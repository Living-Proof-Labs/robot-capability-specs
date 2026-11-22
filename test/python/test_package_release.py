# SPDX-License-Identifier: Apache-2.0
"""The built package version follows the release tag, not a committed literal."""
import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CHECK = ROOT / "tooling/check-package-release.py"
PROJECT = ROOT / "python"
STABLE = re.compile(r"(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){2}")
LOCAL = re.compile(r"0\.0\.0\.dev0\+(?:local|g[0-9a-f]{12,})")


def load_checker():
    spec = importlib.util.spec_from_file_location("check_package_release", CHECK)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PackageReleaseTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        ignore = shutil.ignore_patterns("__pycache__", "*.egg-info", "build", "dist", "_version.py", "VERSION")
        shutil.copytree(PROJECT, self.root / "python", ignore=ignore)
        shutil.copy(ROOT / ".gitignore", self.root / ".gitignore")
        self.git("init", "-q")
        self.git("config", "user.name", "Fixture")
        self.git("config", "user.email", "fixture@example.invalid")
        self.git("add", "python", ".gitignore")
        self.git("commit", "-qm", "fixture")
        self.commit = self.git("rev-parse", "HEAD")
        self.checker = load_checker()

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.root, text=True).strip()

    def check(self, commit, version, tag, *, event_commit=None, package_version=None):
        env = os.environ.copy()
        env.pop("LIVINGPROOF_PACKAGE_VERSION", None)
        if package_version is not None:
            env["LIVINGPROOF_PACKAGE_VERSION"] = package_version
        return subprocess.run(
            [sys.executable, str(CHECK), event_commit or self.commit, commit, version, tag],
            cwd=self.root, capture_output=True, text=True, env=env,
        )

    def versions(self, package_version=None):
        env = os.environ.copy()
        env.pop("LIVINGPROOF_PACKAGE_VERSION", None)
        env.pop("GIT_DIR", None)
        env.pop("GIT_WORK_TREE", None)
        if package_version is not None:
            env["LIVINGPROOF_PACKAGE_VERSION"] = package_version
        return self.checker.built_versions(self.root, env)

    def tag(self, name):
        self.git("tag", "-a", name, "-m", "Fixture release")

    def test_project_metadata_has_no_committed_version(self):
        text = (PROJECT / "pyproject.toml").read_text()
        self.assertIn('dynamic = ["version"]', text)
        self.assertNotRegex(text, r'(?m)^version\s*=\s*["\']')
        self.assertFalse((PROJECT / "livingproof_scenario_parameters/_version.py").exists())

    def test_exact_tag_build_matches_the_candidate_and_ignores_worktree_edits(self):
        self.tag("v1.2.3")
        before = self.git("status", "--porcelain", "--untracked-files=all")
        result = self.check(self.commit, "1.2.3", "v1.2.3")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git("status", "--porcelain", "--untracked-files=all"), before)
        (self.root / "python/pyproject.toml").write_text('name = "tampered"\n')
        dirty = self.check(self.commit, "1.2.3", "v1.2.3")
        self.assertEqual(dirty.returncode, 0, dirty.stderr)
        refused = self.check(self.commit, "1.2.4", "v1.2.4")
        self.assertNotEqual(refused.returncode, 0)
        self.assertIn("must match release candidate", refused.stderr)
        built = self.versions()
        self.assertEqual(set(built.values()), {"1.2.3"})

    def test_resolver_version_matches_without_a_tag(self):
        result = self.check(self.commit, "1.2.3", "v1.2.3", package_version="1.2.3")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(set(self.versions(package_version="1.2.3").values()), {"1.2.3"})

    def test_mismatched_build_is_refused(self):
        self.tag("v1.2.3")
        wrong_candidate = self.check(self.commit, "9.9.9", "v9.9.9")
        self.assertNotEqual(wrong_candidate.returncode, 0)
        self.assertIn("must match release candidate", wrong_candidate.stderr)
        wrong_resolver = self.check(self.commit, "1.2.3", "v1.2.3", package_version="9.9.9")
        self.assertNotEqual(wrong_resolver.returncode, 0)
        self.assertIn("does not match the release tag", wrong_resolver.stderr)
        self.git("tag", "-d", "v1.2.3")
        untagged = self.check(self.commit, "1.2.3", "v1.2.3", package_version="9.9.9")
        self.assertNotEqual(untagged.returncode, 0)
        self.assertIn("must match release candidate", untagged.stderr)

    def test_non_release_build_is_not_a_stable_version(self):
        built = self.versions()
        self.assertEqual(len(set(built.values())), 1, built)
        version = next(iter(built.values()))
        self.assertRegex(version, LOCAL)
        self.assertIsNone(STABLE.fullmatch(version))
        short = self.git("rev-parse", "--short=12", "HEAD")
        self.assertEqual(version, f"0.0.0.dev0+g{short}")
        result = self.check(self.commit, "", "")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("No stable release planned", result.stdout)

    def test_dirty_tagged_checkout_stays_a_development_version(self):
        self.tag("v1.2.3")
        (self.root / "python/MARKER").write_text("local edit\n")
        env = os.environ.copy()
        env.pop("LIVINGPROOF_PACKAGE_VERSION", None)
        version = subprocess.check_output(
            [sys.executable, "-c",
             "from livingproof_scenario_parameters.versioning import resolve_version; print(resolve_version())"],
            cwd=self.root / "python", env=env, text=True,
        ).strip()
        self.assertRegex(version, LOCAL)
        self.assertIsNone(STABLE.fullmatch(version))
        env["LIVINGPROOF_PACKAGE_VERSION"] = "1.2.3"
        refused = subprocess.run(
            [sys.executable, "-c",
             "from livingproof_scenario_parameters.versioning import resolve_version; resolve_version()"],
            cwd=self.root / "python", env=env, text=True, capture_output=True,
        )
        self.assertNotEqual(refused.returncode, 0)
        self.assertIn("uncommitted changes", refused.stderr)

    def test_release_tag_on_another_commit_is_refused(self):
        self.tag("v1.2.3")
        (self.root / "python/MARKER").write_text("later\n")
        self.git("add", "python/MARKER")
        self.git("commit", "-qm", "later")
        head = self.git("rev-parse", "HEAD")
        failure = self.check(head, "1.2.3", "v1.2.3", event_commit=head)
        self.assertNotEqual(failure.returncode, 0)
        self.assertIn("points at", failure.stderr)

    def test_rejects_missing_or_wrong_candidate_identity(self):
        cases = [
            ("", "1.2.3", "v1.2.3", None, "Missing or malformed release candidate commit"),
            ("f" * 40, "", "", "f" * 40, "checked-out commit"),
            (self.commit, "1.2.3", "v1.2.3", "f" * 40, "checked-out commit"),
            (self.commit, "", "v1.2.3", None, "stable release candidate version"),
            (self.commit, "01.2.3", "v01.2.3", None, "stable release candidate version"),
            (self.commit, "1.2.3", "", None, "tag and version disagree"),
            (self.commit, "1.2.3", "v1.2.4", None, "tag and version disagree"),
        ]
        for commit, version, tag, event, message in cases:
            with self.subTest(commit=commit, version=version, tag=tag, event=event):
                failure = self.check(commit, version, tag, event_commit=event)
                self.assertNotEqual(failure.returncode, 0)
                self.assertIn(message, failure.stderr)

    def test_in_place_tag_install_leaves_a_clean_worktree(self):
        self.tag("v1.2.3")
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        venv = Path(temporary.name) / "venv"
        subprocess.check_call([sys.executable, "-m", "venv", str(venv)])
        env = os.environ.copy()
        env.pop("LIVINGPROOF_PACKAGE_VERSION", None)
        python = venv / "bin" / "python"
        subprocess.check_call([
            str(python), "-m", "pip", "install", "--disable-pip-version-check",
            str(self.root / "python"),
        ], env=env)
        installed = subprocess.check_output(
            [str(python), "-c", "import livingproof_scenario_parameters as package; print(package.__version__)"],
            text=True,
        ).strip()
        self.assertEqual(installed, "1.2.3")
        self.assertEqual(self.git("status", "--porcelain", "--untracked-files=all"), "")

    def test_ambiguous_release_tags_are_refused(self):
        self.tag("v1.2.3")
        self.tag("v1.2.4")
        failure = self.check(self.commit, "1.2.4", "v1.2.4")
        self.assertNotEqual(failure.returncode, 0)
        self.assertIn("more than one stable release tag", failure.stderr)
