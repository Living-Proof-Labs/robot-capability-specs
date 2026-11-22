# SPDX-License-Identifier: Apache-2.0
"""Exercise the pre-release parity check with real, committed project metadata."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


CHECK = Path(__file__).resolve().parents[2] / "tooling/check-package-release.py"


class PackageReleaseTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / "python").mkdir()
        (self.root / "python/pyproject.toml").write_text('[project]\nversion = "1.2.3"\n')
        self.git("init", "-q")
        self.git("add", "python/pyproject.toml")
        self.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                 "commit", "-qm", "fixture")
        self.commit = self.git("rev-parse", "HEAD")

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.root, text=True).strip()

    def check(self, commit, version, tag, *, event_commit=None):
        return subprocess.run(
            [sys.executable, str(CHECK), event_commit or self.commit, commit, version, tag],
            cwd=self.root, capture_output=True, text=True,
        )

    def test_requires_exact_committed_version_not_worktree_or_tags(self):
        self.assertEqual(self.git("tag", "--list"), "")
        self.assertEqual(self.check(self.commit, "1.2.3", "v1.2.3").returncode, 0)
        (self.root / "python/pyproject.toml").write_text('[project]\nversion = "1.2.4"\n')
        failure = self.check(self.commit, "1.2.4", "v1.2.4")
        self.assertNotEqual(failure.returncode, 0)
        self.assertIn("must match release candidate", failure.stderr)

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

    def test_exact_no_release_plan_is_a_noop(self):
        result = self.check(self.commit, "", "")
        self.assertEqual(result.returncode, 0)
        self.assertIn("No stable release planned", result.stdout)
