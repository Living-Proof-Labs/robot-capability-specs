// SPDX-License-Identifier: Apache-2.0
// Shared-workflow versions drift when prose copies them: Renovate edits the
// workflow callers and leaves the sentence behind. These docs name no workflow
// version; they point at the callers. A guidelines or brand version must match
// the held pin in docs-brand.lock.json.
// History under docs/adr/ and the root CHANGELOG.md is exempt by path.
// A version is tied to a trigger in the same sentence, including a wrapped
// line. The next sentence is a different claim. `task test` loads this file
// through tooling/test-suite.mjs. `task check` only syntax-checks it.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)";
const VERSION = new RegExp(`(?<![A-Za-z0-9])\`?v?${TAG}\`?(?![A-Za-z0-9])`, "g");
const USES = new RegExp(
  `uses:\\s*Living-Proof-Labs\\/collaboration-guidelines\\/\\.github\\/workflows\\/[\\w.-]+\\.ya?ml@(v${TAG})`,
  "g",
);
const ANCHORS = [
  [/semantic-release[\w.-]*\.ya?ml@/gi, "workflow"],
  [/collaboration-guidelines/gi, "guidelines"],
  [/(?<!collaboration-)\bguidelines\b/gi, "guidelines"],
  [/\bbrand\b/gi, "guidelines"],
  [/\bworkflow\b/gi, "workflow"],
  [/\bcallers?\b/gi, "workflow"],
];

function workflowPins(texts) {
  const pins = new Set();
  for (const text of texts) {
    for (const match of text.matchAll(USES)) pins.add(match[1]);
  }
  return pins;
}

function workflowTexts() {
  const dir = join(ROOT, ".github/workflows");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
    .map((name) => readFileSync(join(dir, name), "utf8"));
}

function loadPins() {
  const pins = workflowPins(workflowTexts());
  assert.equal(pins.size, 1, [...pins].sort().join(", "));
  const brand = JSON.parse(readFileSync(join(ROOT, "docs-brand.lock.json"), "utf8")).version;
  assert.match(brand, new RegExp(`^v${TAG}$`));
  return { workflow: [...pins][0], brand };
}

function normalize(token) {
  const bare = token.replaceAll("`", "");
  return bare.startsWith("v") ? bare : `v${bare}`;
}

function mentions(text) {
  return [...text.matchAll(VERSION)].map((match) => ({
    version: normalize(match[0]),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function anchors(text) {
  const found = [];
  for (const [pattern, kind] of ANCHORS) {
    for (const match of text.matchAll(pattern)) {
      found.push({ kind, start: match.index, end: match.index + match[0].length });
    }
  }
  return found;
}

function gap(anchor, mention) {
  if (anchor.end <= mention.start) return mention.start - anchor.end;
  if (mention.end <= anchor.start) return anchor.start - mention.end;
  return 0;
}

function isSentenceEnd(text, index) {
  const mark = text[index];
  if (mark === "\n" && text[index + 1] === "\n") return true;
  if (!/[.!?]/.test(mark)) return false;
  if (mark === "." && /\d/.test(text[index - 1] ?? "") && /\d/.test(text[index + 1] ?? "")) return false;
  const next = text[index + 1];
  return next === undefined || /[\s"'”)\]*]/.test(next);
}

function sentenceSpan(text, index) {
  let start = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (isSentenceEnd(text, i)) {
      start = i + 1;
      break;
    }
  }
  let end = text.length;
  for (let i = index; i < text.length; i += 1) {
    if (isSentenceEnd(text, i)) {
      end = i + 1;
      break;
    }
  }
  return { start, end };
}

function nearestAnchor(text, mention, found) {
  const span = sentenceSpan(text, mention.start);
  let best = null;
  for (const anchor of found) {
    if (anchor.start < span.start || anchor.start >= span.end) continue;
    const distance = gap(anchor, mention);
    if (!best || distance < best.distance) best = { kind: anchor.kind, distance };
  }
  return best;
}

function isHistory(relativePath) {
  const path = relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
  if (path === "docs/adr" || path.startsWith("docs/adr/")) return true;
  // Only the repository changelog. docs/changelog-policy.md is ordinary prose.
  return path === "CHANGELOG.md";
}

// Generated manual output is the repository-root artifacts directory.
// A documentation folder that is also named artifacts stays in the scan.
function isGeneratedOutput(relativePath) {
  const path = relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
  return path === "artifacts" || path.startsWith("artifacts/");
}

function problems(relativePath, text, pins) {
  if (isHistory(relativePath)) return [];
  const found = anchors(text);
  const reported = [];
  for (const mention of mentions(text)) {
    const anchor = nearestAnchor(text, mention, found);
    if (!anchor) continue;
    if (anchor.kind === "workflow") {
      reported.push(
        `${relativePath}: shared workflow version ${mention.version} is hardcoded; the callers pin ${pins.workflow}`,
      );
    } else if (mention.version !== pins.brand) {
      reported.push(
        `${relativePath}: guidelines version ${mention.version} is not the held pin ${pins.brand}`,
      );
    }
  }
  return reported;
}

function markdownFiles(dir, rel = "") {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (isGeneratedOutput(relPath)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...markdownFiles(full, relPath));
    else if (entry.name.endsWith(".md") || /^changelog/i.test(entry.name)) found.push(relPath);
  }
  return found;
}

function assertStale(phrase) {
  const found = problems("docs/verification.md", phrase, loadPins());
  assert.ok(found.some((item) => item.includes("v9.9.4")), `${phrase}\n${found.join("\n")}`);
}

test("docs do not state a shared-workflow or guidelines version other than the held pin", () => {
  const pins = loadPins();
  const found = [];
  for (const path of markdownFiles(ROOT)) {
    found.push(...problems(path, readFileSync(join(ROOT, path), "utf8"), pins));
  }
  assert.deepEqual(found, []);
});

test("the release workflow vX is reported", () => {
  assertStale("the release workflow v9.9.4 is pinned");
});

test("a semantic-release.yml ref is reported", () => {
  assertStale("the caller uses `semantic-release.yml@v9.9.4`");
});

test("a backticked version is reported", () => {
  assertStale("the shared workflow release `v9.9.4`");
});

test("a version without v is reported", () => {
  assertStale("the shared workflow release 9.9.4");
});

test("a collaboration-guidelines version is reported", () => {
  assertStale("pinned to collaboration-guidelines v9.9.4");
});

test("a version after pinned at is reported", () => {
  assertStale("the shared workflow release is pinned at v9.9.4");
});

test("the release caller pins vX is reported", () => {
  assertStale("the release caller pins v9.9.4");
});

test("a version is tied to a trigger in the same sentence", () => {
  const pad = "word ".repeat(30);
  assertStale(`the release caller ${pad}pins v9.9.4`);
  const next = "See the release caller. Unrelated catalog tag v1.2.2 stands alone.";
  assert.deepEqual(problems("README.md", next, loadPins()), []);
});

test("ADR and CHANGELOG history is not flagged", () => {
  const pins = loadPins();
  const adr = "docs/adr/0002-shared-release-workflow.md";
  assert.deepEqual(problems(adr, readFileSync(join(ROOT, adr), "utf8"), pins), []);
  const stale = [
    "the release workflow v9.9.4 is pinned",
    "the caller uses `semantic-release.yml@v9.9.4`",
    "the shared workflow release `v9.9.4`",
    "the shared workflow release 9.9.4",
    "pinned to collaboration-guidelines v9.9.4",
    "the shared workflow release is pinned at v9.9.4",
    "the release caller pins v9.9.4",
  ].join("\n");
  assert.deepEqual(problems("CHANGELOG.md", stale, pins), []);
  assert.ok(problems("README.md", stale, pins).length >= 7);
});

test("a changelog-prefixed doc outside the root changelog is reported", () => {
  const stale = "the release caller pins v9.9.4";
  const pins = loadPins();
  assert.deepEqual(problems("CHANGELOG.md", stale, pins), []);
  assert.ok(problems("docs/changelog-policy.md", stale, pins).length > 0);
  assert.ok(problems("docs/CHANGELOG-1.md", stale, pins).length > 0);
  assert.ok(problems("docs/CHANGELOG.md", stale, pins).length > 0);
});

test("only the generated artifacts directory is skipped", () => {
  assert.equal(isGeneratedOutput("artifacts"), true);
  assert.equal(isGeneratedOutput("artifacts/manual/page.md"), true);
  assert.equal(isGeneratedOutput("docs/artifacts/note.md"), false);
  assert.equal(isGeneratedOutput("nested/artifacts/note.md"), false);
  const stale = "the release workflow v9.9.4 is pinned";
  assert.ok(problems("docs/artifacts/note.md", stale, loadPins()).length > 0);
  assert.ok(problems("nested/artifacts/note.md", stale, loadPins()).length > 0);
});

test("task test executes this file through the catalog suite", () => {
  const suite = readFileSync(join(ROOT, "tooling/test-suite.mjs"), "utf8");
  assert.match(suite, /endsWith\(\s*['"]\.test\.mjs['"]\s*\)/);
  assert.ok(readdirSync(join(ROOT, "test")).includes("workflow-pin-docs.test.mjs"));
  const taskfile = readFileSync(join(ROOT, "Taskfile.runtime.yml"), "utf8");
  assert.match(taskfile, /tooling\/test-suite\.mjs/);
});
