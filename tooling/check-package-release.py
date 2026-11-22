# SPDX-License-Identifier: Apache-2.0
"""Verify the committed Python project version before a stable release."""
import re
import subprocess
import sys
import tomllib


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def check(event_commit, candidate_commit, version, tag):
    if not re.fullmatch(r"[0-9a-f]{40}", candidate_commit):
        raise ValueError("Missing or malformed release candidate commit")
    if candidate_commit != event_commit or git("rev-parse", "HEAD") != candidate_commit:
        raise ValueError("Release candidate must match the event and checked-out commit")
    if not version and not tag:
        print("No stable release planned; no package version needs to be checked")
        return
    if not re.fullmatch(r"(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){2}", version):
        raise ValueError("Missing or malformed stable release candidate version")
    if tag != f"v{version}":
        raise ValueError("Release candidate tag and version disagree")
    metadata = tomllib.loads(git("show", "HEAD:python/pyproject.toml"))
    package_version = metadata["project"]["version"]
    if package_version != version:
        raise ValueError(f"Python package version {package_version!r} must match release candidate {version!r}; update python/pyproject.toml")


if __name__ == "__main__":
    try:
        check(*sys.argv[1:])
    except (TypeError, ValueError, OSError, KeyError, subprocess.CalledProcessError) as exc:
        sys.exit(str(exc))
