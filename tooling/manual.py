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
    (SOURCE / 'build.json').write_text(json.dumps(build_info, indent=2) + '\n')
    (SOURCE / 'version.md').write_text(
        '# Documentation version\n\nDevelopment documentation from source commit '
        f'`{head}`' + (' with local changes' if dirty else '') + '.\n\n'
        'Catalog tags version the bundle; contract revisions identify individual contracts. '
        'Historical rendered manuals are unavailable; consult '
        '[published source tags](https://github.com/Living-Proof-Labs/robot-capability-specs/tags).\n\n'
        '[Build identity and source hashes](build.json)\n')
    config = (ROOT / 'zensical.yml').read_text()
    config += '\ndocs_dir: source\nsite_dir: html\n'
    (OUT / 'zensical.yml').write_text(config)
    subprocess.run(['zensical', 'build', '--clean', '--config-file', 'zensical.yml'], cwd=OUT, check=True)

if __name__ == '__main__':
    build()
