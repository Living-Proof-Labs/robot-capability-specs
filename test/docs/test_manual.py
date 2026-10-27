# SPDX-License-Identifier: Apache-2.0
"""Exercise delivered documentation; never claim to execute the catalog's robot scenarios."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit

import pytest
from playwright.sync_api import expect

ROOT = Path(__file__).resolve().parents[2]

class Document(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.links, self.ids, self.text = [], set(), []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.add(attrs['id'])
        self.links.extend(attrs[key] for key in ('href', 'src') if key in attrs)

    def handle_data(self, value):
        self.text.append(value)


def test_sources(output):
    build = json.loads((output / 'html/build.json').read_text())
    assert build['revision'] == subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    assert build['generator'] == 'zensical==0.0.73'
    assert len(build['sources']) >= 15
    def without_links(text):
        return re.sub(r'\]\([^)]*\)', ']', text)
    for item in build['sources']:
        original = (ROOT / item['path']).read_text()
        assert hashlib.sha256(original.encode()).hexdigest() == item['sha256']
        staged = (output / 'source' / item['page']).read_text()
        if item['path'].endswith('.feature'):
            assert original in staged
            assert (output / 'html' / item['path']).read_text() == original
        else:
            assert without_links(original) == without_links(staged)


def test_links(output):
    root = (output / 'html').resolve()
    docs = {path.resolve(): Document(path.read_text()) for path in root.rglob('*.html')}
    problems = []
    for path, doc in docs.items():
        for link in doc.links:
            parts = urlsplit(link)
            if parts.scheme or parts.netloc:
                continue
            if parts.path.startswith('/'):
                assert parts.path.startswith('/robot-capability-specs/'), link
                target = root / unquote(parts.path.removeprefix('/robot-capability-specs/'))
            else:
                target = path.parent / unquote(parts.path) if parts.path else path
            target = target.resolve()
            assert target.is_relative_to(root), link
            if target.is_dir():
                target /= 'index.html'
            if not target.exists():
                problems.append(f'{path.relative_to(root)}: missing {link}')
            elif parts.fragment and target in docs and unquote(parts.fragment) not in docs[target].ids:
                problems.append(f'{path.relative_to(root)}: missing fragment {link}')
    assert not problems, '\n'.join(problems)


def test_version(output):
    html = (output / 'html/index.html').read_text()
    assert 'href="https://docs.livingprooflabs.com/robot-capability-specs/index.html"' in html
    build = json.loads((output / 'html/build.json').read_text())
    version = ' '.join(Document((output / 'html/version.html').read_text()).text)
    assert build['revision'] in version
    assert 'Development documentation' in version
    assert ('with local changes' in version) == build['dirty']
    assert 'Historical rendered manuals are unavailable' in version


@pytest.mark.parametrize('width', [1280, 390], ids=['desktop', 'mobile'])
def test_navigation(browser, server, output, width):
    context = browser.new_context(viewport={'width': width, 'height': 844})
    context.set_default_timeout(5000)
    page = context.new_page()
    failures = []
    page.on('pageerror', lambda error: failures.append(str(error)))
    page.on('response', lambda r: failures.append(r.url) if r.status >= 400 else None)
    page.on('requestfailed', lambda r: failures.append(r.url))
    page.goto(server + '/')
    if width == 390:
        page.locator('label.md-header__button[for="__drawer"]:visible').first.click()
    page.locator('label.md-nav__link').filter(has_text='Catalog').first.click()
    page.get_by_role('link', name='Revision 1', exact=True).first.click()
    article = page.locator('article')
    expect(article).to_contain_text('Reference contracts, revision 1.0.0')
    page.goto(server + '/specs/v1/index.html#pause-100')
    expect(page.locator('#pause-100')).to_be_visible()
    page.goto(server + '/specs/v2/index.html')
    expect(article).to_contain_text('250 milliseconds')
    page.goto(server + '/specs/matrix/reference.feature.html')
    expect(article).to_contain_text('INCOMPATIBLE')
    response = context.request.get(server + '/specs/matrix/reference.feature')
    assert response.status == 200
    assert response.text() == (ROOT / 'specs/matrix/reference.feature').read_text()
    page.goto(server + '/version.html')
    expect(article).to_contain_text('Development documentation')
    (output / 'screenshots').mkdir(exist_ok=True)
    page.screenshot(path=str(output / f'screenshots/navigation-{width}.png'))
    assert not failures, failures
    context.close()


@pytest.mark.parametrize('width', [1280, 390], ids=['desktop', 'mobile'])
def test_search(browser, server, width):
    context = browser.new_context(viewport={'width': width, 'height': 844})
    context.set_default_timeout(5000)
    page = context.new_page()
    page.goto(server + '/')
    if width == 390:
        page.locator('label[for="__search"]:visible').first.click()
    else:
        page.get_by_role('button', name='Search', exact=False).first.click()
    page.get_by_placeholder('Search', exact=True).fill('inhibition')
    result = page.locator('dialog a[href*="specs/v1/index.html"]').first
    expect(result).to_be_visible(timeout=15000)
    result.click()
    expect(page).to_have_url(re.compile('/specs/v1/index.html'))
    expect(page.locator('article')).to_contain_text('inhibition')
    context.close()


@pytest.mark.parametrize('mode', ['light', 'dark'])
def test_themes(browser, server, output, mode):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, color_scheme=mode)
    context.set_default_timeout(5000)
    page = context.new_page()
    page.goto(server + '/specs/v1/reference.feature.html')
    background = lambda: page.evaluate('getComputedStyle(document.body).backgroundColor')
    page.wait_for_timeout(300)
    first = background()
    assert (sum(map(int, re.findall(r'\d+', first)[:3])) < 384) == (mode == 'dark')
    page.emulate_media(color_scheme='light' if mode == 'dark' else 'dark')
    page.wait_for_function('(old) => getComputedStyle(document.body).backgroundColor !== old', arg=first)
    seen = set()
    for _ in range(3):
        page.locator('[data-md-component="palette"] label:visible').first.click()
        page.wait_for_timeout(150)
        seen.add(background())
        expect(page.locator('article pre').first).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    assert len(seen) >= 2
    (output / 'screenshots').mkdir(exist_ok=True)
    page.screenshot(path=str(output / f'screenshots/theme-{mode}.png'))
    context.close()
