# SPDX-License-Identifier: Apache-2.0
"""Validate the sealed Pages tar before either publishing a release or deploying."""
import hashlib
import json
import re
import sys
import tarfile
from pathlib import Path

STABLE = r'(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)'
NUMBER = r'[1-9][0-9]*'
VERSION = rf'{STABLE}(?:-(?:pr\.{NUMBER}|main)\.{NUMBER}\.{NUMBER})?'


def check(path, version, commit, run, attempt, digest=''):
    if (not re.fullmatch(VERSION, version) or not re.fullmatch(r'[0-9a-f]{40}', commit)
            or not all(re.fullmatch(NUMBER, value) for value in (run, attempt))):
        raise ValueError('Invalid version, commit, run, or attempt for the catalog manual')
    with path.open('rb') as stream:
        actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    if digest and (not re.fullmatch(r'[0-9a-f]{64}', digest) or digest != actual):
        raise ValueError('Catalog manual bytes differ from the sealed artifact')
    with tarfile.open(path, mode='r:') as archive:
        identities = [item for item in archive.getmembers() if item.name in ('build.json', './build.json')]
        if len(identities) != 1 or not identities[0].isfile():
            raise ValueError('Catalog manual must contain one regular build.json')
        with archive.extractfile(identities[0]) as stream:
            identity = json.load(stream)
    if identity.get('dirty') is not False or any(
        identity.get(key) != value for key, value in {
            'version': version, 'revision': commit, 'run_id': run, 'run_attempt': attempt
        }.items()
    ):
        raise ValueError('Catalog manual is dirty, stale, or built for another version')
    return actual


if __name__ == '__main__':
    command, archive, *identity = sys.argv[1:]
    if (command, len(identity)) not in {('seal', 4), ('check', 5)} or (command == 'check' and not identity[-1]):
        raise SystemExit('Expected seal|check, tar, version, commit, run, attempt [digest]')
    try:
        print(check(Path(archive), *identity))
    except (ValueError, OSError, tarfile.TarError, TypeError) as error:
        raise SystemExit(str(error)) from error
