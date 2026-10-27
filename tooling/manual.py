# SPDX-License-Identifier: Apache-2.0
"""Stage authoritative public documents, then invoke the pinned manual generator."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/manual'
SOURCE = OUT / 'source'

def task_reference():
    records = []
    for filename in ('Taskfile.yml', 'Taskfile.runtime.yml'):
        listing = json.loads(subprocess.check_output(
            ['task', '-t', filename, '--list', '--json'], cwd=ROOT, text=True))
        tasks = []
        for item in sorted(listing['tasks'], key=lambda item: item['name']):
            summary = subprocess.check_output(
                ['task', '-t', filename, item['name'], '--summary'], cwd=ROOT, text=True)
            tasks.append({'name': item['name'], 'description': item['desc'],
                          'summary': summary.replace(str(ROOT), '<repository>')})
        records.append({'path': filename,
                        'sha256': hashlib.sha256((ROOT / filename).read_bytes()).hexdigest(),
                        'tasks': tasks})
    return records


def render_tasks(records):
    text = '# Contributor tasks\n\nGenerated from the reviewed Taskfiles with Task 3.54.0.\n\n'
    for record in records:
        prepared = record['path'] == 'Taskfile.runtime.yml'
        text += '## ' + ('Prepared environment' if prepared else 'Docker host') + '\n\n'
        text += ('Inside the prepared image use `task -t Taskfile.runtime.yml <task>`; '
                 'do not call the host wrapper here.\n\n' if prepared else
                 'On a host with Docker and Task use `task <task>`.\n\n')
        for task in record['tasks']:
            text += f"### {task['name']}\n\n```text\n{task['summary']}```\n\n"
    return text

def build():
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(SOURCE, ignore_errors=True)
    SOURCE.mkdir()
    paths = [ROOT / p for p in ('README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'LICENSE.md')]
    paths += sorted((ROOT / 'docs').rglob('*.md'))
    paths += sorted((ROOT / 'specs').rglob('*.md'))
    paths += [ROOT / '.github/PAGES.md']
    manifest = []
    for path in paths:
        relative = path.relative_to(ROOT)
        target = SOURCE / str(relative).replace('README.md', 'index.md').replace('.github/', 'github/')
        target.parent.mkdir(parents=True, exist_ok=True)
        # Preserve prose; only repository-relative link destinations change.
        text = re.sub(r'(?<=\()([^\s)]*)(?=\))', lambda m: m[0] if '://' in m[0] else
                      m[0].replace('README.md', 'index.md').replace('.github/', 'github/').replace('.feature', '.feature.md'), path.read_text())
        target.write_text(text)
        manifest.append({'path': str(relative), 'page': str(target.relative_to(SOURCE)),
                         'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    for path in sorted((ROOT / 'specs').rglob('*.feature')):
        relative = path.relative_to(ROOT)
        target = SOURCE / relative
        shutil.copyfile(path, target)
        target.with_suffix('.feature.md').write_text(
            f'# {relative}\n\nExplanatory catalog examples; parser validation is not runtime execution.\n\n'
            f'[Download original Gherkin]({path.name})\n\n```gherkin\n{path.read_text()}```\n')
        manifest.append({'path': str(relative), 'page': str(relative) + '.md',
                         'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    shutil.copytree(ROOT / 'LICENSES', SOURCE / 'LICENSES')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip())
    build_info = {'revision': head, 'dirty': dirty, 'generator': 'zensical==0.0.73', 'sources': manifest}
    records = task_reference()
    build_info['task_sources'] = [{'path': row['path'], 'sha256': row['sha256']} for row in records]
    (SOURCE / 'task-reference.json').write_text(json.dumps(records, indent=2) + '\n')
    (SOURCE / 'tasks.md').write_text(render_tasks(records))
    (SOURCE / 'build.json').write_text(json.dumps(build_info, indent=2) + '\n')
    (SOURCE / 'version.md').write_text(
        '# Documentation version\n\nDevelopment documentation from source commit '
        f'[`{head}`](https://github.com/Living-Proof-Labs/robot-capability-specs/commit/{head})' + (' with local changes' if dirty else '') + '.\n\n'
        'Catalog tags version the bundle; contract revisions identify individual contracts. '
        'Historical rendered manuals are unavailable; consult '
        '[published source tags](https://github.com/Living-Proof-Labs/robot-capability-specs/tags).\n\n'
        '[Build identity and source hashes](build.json)\n\n'
        '[Catalog releases](https://github.com/Living-Proof-Labs/robot-capability-specs/releases) '
        'are published bundle versions, not this documentation build identity.\n')
    config = (ROOT / 'zensical.yml').read_text()
    identity = (f'<a href="https://github.com/Living-Proof-Labs/robot-capability-specs/commit/{head}">'
                f'Docs: development · {head[:12]}</a>' + (' (local changes)' if dirty else ''))
    footer = ('<a href="https://docs.livingprooflabs.com/">Documentation home</a> · '
              '<a href="https://github.com/Living-Proof-Labs/robot-capability-specs">Source</a> · '
              '<a href="https://github.com/Living-Proof-Labs/robot-capability-specs/issues">Help / report an issue</a> · '
              '<a href="https://docs.livingprooflabs.com/robot-capability-specs/LICENSE.html">License</a> · '
              + identity + ' · <a href="https://github.com/Living-Proof-Labs/robot-capability-specs/releases">Catalog releases</a>')
    config += '\ndocs_dir: source\nsite_dir: html\ncopyright: ' + json.dumps(footer) + '\n'
    (OUT / 'zensical.yml').write_text(config)
    subprocess.run(['zensical', 'build', '--clean', '--config-file', 'zensical.yml'], cwd=OUT, check=True)

if __name__ == '__main__':
    build()
