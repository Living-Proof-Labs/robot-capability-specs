# SPDX-License-Identifier: Apache-2.0
"""Resolve the package version when it is built.

A release build uses one stable catalog tag, ``vX.Y.Z``, or the shared
resolver's PEP 440 version when that tag does not exist yet. Any other
checkout, including a pull request or a local tree, gets a development
version that is not a stable release.
"""
import os
import re
import subprocess
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
STAMP = Path(__file__).with_name("_version.py")
ENV_NAME = "LIVINGPROOF_PACKAGE_VERSION"
STABLE = r"(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){2}"
PEP440 = re.compile(
    STABLE + r"(?:\.dev(?:0|[1-9][0-9]*))?" + r"(?:\+[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?"
)
TAG = re.compile(rf"v({STABLE})")
STAMPED = re.compile(r'(?m)^__version__ = "([^"]+)"$')


def _git(*args):
    try:
        return subprocess.check_output(
            ["git", *args], cwd=PROJECT, text=True, stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def in_git_checkout():
    return _git("rev-parse", "--is-inside-work-tree") == "true"


def _clean_checkout():
    if not in_git_checkout():
        return False
    return _git("status", "--porcelain", "--untracked-files=all") == ""


def exact_release_versions():
    raw = _git("tag", "--points-at", "HEAD")
    if not raw:
        return []
    found = []
    for line in raw.splitlines():
        match = TAG.fullmatch(line.strip())
        if match:
            found.append(match.group(1))
    return sorted(set(found))


def _local_version():
    sha = _git("rev-parse", "--short=12", "HEAD")
    if sha and re.fullmatch(r"[0-9a-f]{12,}", sha):
        version = f"0.0.0.dev0+g{sha}"
    else:
        version = "0.0.0.dev0+local"
    if re.fullmatch(STABLE, version):
        raise RuntimeError("A development version must not look like a stable release")
    return version


def _stamped_version():
    if not STAMP.is_file():
        return ""
    match = STAMPED.search(STAMP.read_text(encoding="utf-8"))
    if not match or not PEP440.fullmatch(match.group(1)):
        raise ValueError("Stamped package version is not a supported PEP 440 version")
    return match.group(1)


def resolve_version():
    """Return the version for this build.

    The shared resolver's PEP 440 output wins when it is supplied, but it
    must agree with an exact release tag on HEAD. A source distribution that
    was already stamped keeps that version when it is rebuilt without Git.
    """
    env = os.environ.get(ENV_NAME, "").strip()
    if env and not PEP440.fullmatch(env):
        raise ValueError(
            f"{ENV_NAME} {env!r} must be a stable X.Y.Z release or a development version "
            "such as 0.0.0.dev0+local"
        )
    clean = _clean_checkout()
    if env and re.fullmatch(STABLE, env) and in_git_checkout() and not clean:
        raise ValueError(
            f"Refusing to stamp stable version {env} onto a checkout with uncommitted changes"
        )
    tags = exact_release_versions() if clean else []
    if len(tags) > 1:
        names = ", ".join(f"v{item}" for item in tags)
        raise ValueError(f"HEAD has more than one stable release tag: {names}")
    tagged = tags[0] if tags else ""
    if env and tagged and env != tagged:
        raise ValueError(f"Resolver version {env!r} does not match the release tag v{tagged}")
    if env:
        return env
    if tagged:
        return tagged
    if not in_git_checkout():
        stamped = _stamped_version()
        if stamped:
            return stamped
    return _local_version()
