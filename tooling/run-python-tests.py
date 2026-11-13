# SPDX-License-Identifier: Apache-2.0
"""Run the scenario-parameter unittest suite and write JUnit XML."""

import os
import sys
import time
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'artifacts/python/tests.xml'


class Recording(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.records = []

    def startTest(self, test):
        super().startTest(test)
        self._started = time.perf_counter()

    def _remember(self, test, outcome, detail):
        self.records.append((test, outcome, detail, time.perf_counter() - self._started))

    def addSuccess(self, test):
        super().addSuccess(test)
        self._remember(test, 'pass', '')

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self._remember(test, 'failure', self._exc_info_to_string(err, test))

    def addError(self, test, err):
        super().addError(test, err)
        self._remember(test, 'error', self._exc_info_to_string(err, test))

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self._remember(test, 'skipped', reason)


def write_report(result):
    suite = ET.Element('testsuite', {
        'name': 'livingproof_scenario_parameters',
        'tests': str(result.testsRun),
        'failures': str(len(result.failures)),
        'errors': str(len(result.errors)),
        'skipped': str(len(result.skipped)),
    })
    for test, outcome, detail, elapsed in result.records:
        case = ET.SubElement(suite, 'testcase', {
            'classname': test.__class__.__name__,
            'name': test._testMethodName,
            'time': f'{elapsed:.3f}',
        })
        summary = (detail.strip().splitlines() or ['failed'])[-1][:500]
        if outcome == 'failure':
            ET.SubElement(case, 'failure', {'message': summary}).text = detail
        elif outcome == 'error':
            ET.SubElement(case, 'error', {'message': summary}).text = detail
        elif outcome == 'skipped':
            ET.SubElement(case, 'skipped', {'message': detail})
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text('<?xml version="1.0" encoding="utf-8"?>\n' + ET.tostring(suite, encoding='unicode') + '\n')


if __name__ == '__main__':
    os.chdir(ROOT)
    suite = unittest.defaultTestLoader.discover('test/python', pattern='test_*.py')
    result = unittest.TextTestRunner(verbosity=2, resultclass=Recording).run(suite)
    write_report(result)
    print(f'{result.testsRun} tests, {len(result.failures)} failures, {len(result.errors)} errors, '
          f'{len(result.skipped)} skipped')
    sys.exit(0 if result.wasSuccessful() else 1)
