# SPDX-License-Identifier: Apache-2.0
import os
from pathlib import Path
import subprocess
import sys

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / 'tooling/check-publication.py'

@pytest.mark.parametrize('reported,expected', [('2', 0), ('1', 1), ('', 1)],
                         ids=['complete', 'lost-case', 'missing-publisher-output'])
def test_report_completeness(tmp_path, reported, expected):
    for relative in ('artifacts/tests.xml', 'artifacts/manual/tests.xml'):
        path = tmp_path / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('<testsuite><testcase name="fixture"/></testsuite>')
    result = subprocess.run([sys.executable, str(SCRIPT)], cwd=tmp_path,
                            env={**os.environ, 'PASSED': reported, 'FAILED': '0', 'SKIPPED': '0',
                                 'GITHUB_STEP_SUMMARY': str(tmp_path / 'summary.md')}, capture_output=True)
    assert result.returncode == expected, result.stderr.decode()
