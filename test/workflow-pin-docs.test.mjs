// SPDX-License-Identifier: Apache-2.0
// docs/verification.md used to name the shared workflow release by version.
// Renovate bumps the workflow callers and leaves that sentence behind, so a
// stated version must be the pin in the callers. The held docs-brand release
// and historical adoption notes are not current-pin claims.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "v(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)";
const USES = new RegExp(
  `uses:\\s*Living-Proof-Labs\\/collaboration-guidelines\\/\\.github\\/workflows\\/[\\w.-]+\\.ya?ml@(${TAG})`,
  "g",
);
const CLAIM = new RegExp(
  `(?:(?:pinned\\s+)?shared\\s+workflow(?:\\s+release)?|workflow\\s+release)\\s+(${TAG})`,
  "gi",
);

function workflowPins(texts) {
  const pins = new Set();
  for (const text of texts) {
    for (const match of text.matchAll(USES)) pins.add(match[1]);
  }
  return pins;
}

function claimedVersions(text) {
  return [...text.matchAll(CLAIM)].map((match) => match[1]);
}

function mismatches(text, pins) {
  const actual = pins.size ? [...pins].sort().join(", ") : "none";
  return claimedVersions(text)
    .filter((version) => pins.size !== 1 || !pins.has(version))
    .map((version) => `shared workflow release ${version} is not the pinned shared workflow (${actual})`);
}

function workflowTexts() {
  const dir = join(ROOT, ".github/workflows");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
    .map((name) => readFileSync(join(dir, name), "utf8"));
}

function markdownFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "artifacts" || entry.name === ".git") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...markdownFiles(path));
    else if (entry.name.endsWith(".md")) found.push(path);
  }
  return found;
}

function livePins() {
  const pins = workflowPins(workflowTexts());
  assert.equal(pins.size, 1, [...pins].sort().join(", "));
  return pins;
}

test("docs do not state a shared workflow version other than the pin", () => {
  const pins = livePins();
  const found = [];
  for (const path of markdownFiles(ROOT)) {
    for (const problem of mismatches(readFileSync(path, "utf8"), pins)) {
      found.push(`${path.slice(ROOT.length + 1)}: ${problem}`);
    }
  }
  assert.deepEqual(found, []);
});

test("a shared workflow version other than the pin is reported", () => {
  const pins = livePins();
  const [pin] = pins;
  const wrongVersion = pin === "v9.9.4" ? "v0.0.1" : "v9.9.4";
  const wrong = [
    "No released shared drift workflow was found at the pinned brand release v7.10.9",
    `or the pinned shared workflow release ${wrongVersion}.`,
  ].join("\n");
  assert.deepEqual(claimedVersions(wrong), [wrongVersion]);
  assert.deepEqual(mismatches(wrong, pins), [
    `shared workflow release ${wrongVersion} is not the pinned shared workflow (${pin})`,
  ]);
  assert.deepEqual(mismatches(wrong.replace(wrongVersion, pin), pins), []);
  assert.deepEqual(
    mismatches("the shared workflow release pinned in the release caller", pins),
    [],
  );
  assert.deepEqual(mismatches("That adoption left release workflow v2.0.3 unchanged.", pins), []);
  assert.deepEqual(mismatches("The caller moved to `semantic-release.yml@v9.6.15`.", pins), []);
});
