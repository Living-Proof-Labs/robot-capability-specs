# SPDX-License-Identifier: Apache-2.0
"""Fail visibly when either report is absent or the publisher lost test cases."""
import os
from pathlib import Path
import xml.etree.ElementTree as ET

counts = [os.environ[name] for name in ('PASSED', 'FAILED', 'SKIPPED')]
assert all(count.isdecimal() for count in counts), counts
reports = [Path('artifacts/tests.xml'), Path('artifacts/manual/tests.xml')]
emitted = sum(len(list(ET.parse(path).iter('testcase'))) for path in reports)
ingested = sum(map(int, counts))
with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
    summary.write(f'Individual cases: {ingested} ingested / {emitted} emitted. '
                  'Catalog and manual artifacts are retained for 14 days.\n')
    if os.environ.get('ARTIFACT_URL'):
        summary.write(f'[Download HTML, reports and screenshots]({os.environ["ARTIFACT_URL"]})\n')
assert emitted > 0 and ingested == emitted, (ingested, emitted)
