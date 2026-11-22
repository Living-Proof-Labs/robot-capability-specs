# SPDX-License-Identifier: Apache-2.0
"""Verify a built Python package matches the release candidate before tagging.

The candidate tag does not exist until semantic-release publishes it. The build
reads that future version from LIVINGPROOF_PACKAGE_VERSION (the shared
resolver's PEP 440 version) or from an exact ``vX.Y.Z`` tag already on HEAD.
"""
import os
import re
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from email.parser import Parser
from pathlib import Path


BUILD_FRONTEND = "build==1.6.1"
STABLE = re.compile(r"(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){2}")


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def _run(cmd, **kwargs):
    result = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise ValueError(detail or f"command failed: {cmd[0]}")
    return result.stdout


def _build_env(env):
    cleaned = dict(env)
    cleaned.pop("GIT_DIR", None)
    cleaned.pop("GIT_WORK_TREE", None)
    cleaned.pop("FORCE_COLOR", None)
    cleaned["NO_COLOR"] = "1"
    return cleaned


def _metadata_version(text):
    message = Parser().parsestr(text)
    version = message.get("Version")
    if not version:
        raise ValueError("Distribution metadata has no Version")
    return version


def _wheel_version(path):
    with zipfile.ZipFile(path) as archive:
        name = next(item for item in archive.namelist() if item.endswith(".dist-info/METADATA"))
        return _metadata_version(archive.read(name).decode())


def _sdist_version(path):
    with tarfile.open(path) as archive:
        member = next(
            item for item in archive.getmembers()
            if item.name.endswith("/PKG-INFO") and item.name.count("/") == 1
        )
        return _metadata_version(archive.extractfile(member).read().decode())


def _install_version(artifact, env):
    with tempfile.TemporaryDirectory(prefix="package-install-") as temporary:
        venv = Path(temporary) / "venv"
        _run([sys.executable, "-m", "venv", str(venv)])
        python = venv / "bin" / "python"
        _run([
            str(python), "-m", "pip", "install", "--disable-pip-version-check", "--no-deps", str(artifact),
        ], env=env)
        probe = (
            "import importlib.metadata as metadata\n"
            "import livingproof_scenario_parameters as package\n"
            "found = metadata.version('livingproof-scenario-parameters')\n"
            "if package.__version__ != found:\n"
            "    raise SystemExit(f'installed metadata {found!r} does not match __version__ {package.__version__!r}')\n"
            "print(found)\n"
        )
        return _run([str(python), "-c", probe], env=env).strip()


def built_versions(root, env):
    """Build the committed tree and return wheel, sdist, and installed versions."""
    root = Path(root)
    with tempfile.TemporaryDirectory(prefix="package-release-") as temporary:
        tmp = Path(temporary)
        clone = tmp / "src"
        _run(["git", "-c", "safe.directory=*", "clone", "--quiet", str(root), str(clone)])
        venv = tmp / "venv"
        _run([sys.executable, "-m", "venv", str(venv)])
        python = venv / "bin" / "python"
        dist = tmp / "dist"
        dist.mkdir()
        build_env = _build_env(env)
        _run([str(python), "-m", "pip", "install", "--disable-pip-version-check", BUILD_FRONTEND], env=build_env)
        _run([
            str(python), "-m", "build", "--sdist", "--wheel", "--outdir", str(dist), str(clone / "python"),
        ], env=build_env)
        wheels = sorted(dist.glob("*.whl"))
        sdists = sorted(dist.glob("*.tar.gz"))
        if len(wheels) != 1 or len(sdists) != 1:
            raise ValueError(f"Expected one wheel and one sdist, found {wheels} and {sdists}")
        wheel, sdist = wheels[0], sdists[0]
        installed_env = _build_env(env)
        installed_env.pop("LIVINGPROOF_PACKAGE_VERSION", None)
        return {
            "wheel": _wheel_version(wheel),
            "sdist": _sdist_version(sdist),
            "installed": _install_version(wheel, installed_env),
            "sdist_installed": _install_version(sdist, installed_env),
        }


def _tag_commit(tag):
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--verify", f"refs/tags/{tag}^{{commit}}"],
            text=True, stderr=subprocess.DEVNULL,
        ).strip()
    except subprocess.CalledProcessError:
        return ""


def check(event_commit, candidate_commit, version, tag):
    if not re.fullmatch(r"[0-9a-f]{40}", candidate_commit):
        raise ValueError("Missing or malformed release candidate commit")
    if candidate_commit != event_commit or git("rev-parse", "HEAD") != candidate_commit:
        raise ValueError("Release candidate must match the event and checked-out commit")
    if not version and not tag:
        print("No stable release planned; no package version needs to be checked")
        return
    if not re.fullmatch(STABLE, version):
        raise ValueError("Missing or malformed stable release candidate version")
    if tag != f"v{version}":
        raise ValueError("Release candidate tag and version disagree")
    existing = _tag_commit(tag)
    if existing and existing != candidate_commit:
        raise ValueError(f"Release tag {tag} points at {existing}, not the release commit {candidate_commit}")
    built = built_versions(Path.cwd(), os.environ.copy())
    for label, found in built.items():
        if found != version:
            raise ValueError(
                f"Built {label} version {found!r} must match release candidate {version!r}. "
                "The build reads LIVINGPROOF_PACKAGE_VERSION or the exact release tag."
            )


if __name__ == "__main__":
    try:
        check(*sys.argv[1:])
    except (TypeError, ValueError, OSError, KeyError, subprocess.CalledProcessError) as exc:
        sys.exit(str(exc))
