// SPDX-License-Identifier: Apache-2.0
// Third-party Actions stay pinned to a full commit with a version comment.
// Automates the hand check from pull request #53: actions/checkout@v4.4.0 is a
// tag, not a pin. Reusable workflows published by Living Proof Labs stay on a
// full release tag.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const WORKFLOWS = join(dirname(fileURLToPath(import.meta.url)), "../.github/workflows");
const SHA = /^[0-9a-f]{40}$/;
const VERSION = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const USES = /^[ \t]*(?:-[ \t]*)?uses:[ \t]*(\S+)(?:[ \t]+#\s*(\S+))?[ \t]*$/gm;
const REUSABLE = /^Living-Proof-Labs\/[\w.-]+\/\.github\/workflows\/[\w.-]+\.ya?ml$/;
const CHECKOUT = "11d5960a326750d5838078e36cf38b85af677262";

function actionUses(text) {
  return [...text.matchAll(USES)].map((match) => {
    const spec = match[1];
    const at = spec.lastIndexOf("@");
    return {
      spec,
      action: at === -1 ? spec : spec.slice(0, at),
      ref: at === -1 ? "" : spec.slice(at + 1),
      comment: match[2] ?? "",
    };
  });
}

function problems(text) {
  const found = [];
  for (const use of actionUses(text)) {
    if (REUSABLE.test(use.action)) {
      if (!VERSION.test(use.ref)) found.push(`${use.spec} is not a full release tag`);
      continue;
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(use.action) || !SHA.test(use.ref)) {
      found.push(`${use.spec} is not a full commit SHA`);
    }
    if (!VERSION.test(use.comment)) found.push(`${use.spec} is missing a full version comment`);
  }
  return found;
}

function workflowNames() {
  return readdirSync(WORKFLOWS)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
}

function workflowUses(name) {
  return actionUses(readFileSync(join(WORKFLOWS, name), "utf8"));
}

test("third-party actions are pinned to a commit SHA and a version comment", () => {
  const names = workflowNames();
  assert.ok(names.includes("release.yml"));
  const found = [];
  let thirdParty = 0;
  for (const name of names) {
    const text = readFileSync(join(WORKFLOWS, name), "utf8");
    const uses = actionUses(text);
    assert.ok(uses.length, `${name} has no action uses`);
    thirdParty += uses.filter((use) => !REUSABLE.test(use.action)).length;
    for (const problem of problems(text)) found.push(`${name}: ${problem}`);
  }
  assert.ok(thirdParty > 0, "expected third-party action pins");
  assert.deepEqual(found, []);
});

test("actions/checkout uses one commit across workflows", () => {
  const pins = [];
  for (const name of workflowNames()) {
    for (const use of workflowUses(name)) {
      if (use.action === "actions/checkout") pins.push({ name, ref: use.ref, comment: use.comment });
    }
  }
  const names = pins.map((pin) => pin.name);
  assert.ok(names.includes("pages.yml") && names.includes("release.yml") && names.includes("verify.yml"));
  assert.equal(new Set(pins.map((pin) => pin.ref)).size, 1, names.join(", "));
  assert.equal(new Set(pins.map((pin) => pin.comment)).size, 1);
  assert.match(pins[0].ref, SHA);
  assert.match(pins[0].comment, VERSION);
});

test("a tag pin is reported", () => {
  assert.deepEqual(problems("      - uses: actions/checkout@v4.4.0\n"), [
    "actions/checkout@v4.4.0 is not a full commit SHA",
    "actions/checkout@v4.4.0 is missing a full version comment",
  ]);
});

test("a commit pin without a version comment is reported", () => {
  const line = `      - uses: actions/checkout@${CHECKOUT}\n`;
  assert.deepEqual(problems(line), [
    `actions/checkout@${CHECKOUT} is missing a full version comment`,
  ]);
});

test("a commit pin with a version comment is accepted", () => {
  assert.deepEqual(problems(`      - uses: actions/checkout@${CHECKOUT} # v4.4.0\n`), []);
});

test("a shared workflow stays on a full release tag", () => {
  const tag = "    uses: Living-Proof-Labs/collaboration-guidelines/.github/workflows/semantic-release.yml@v9.5.1\n";
  assert.deepEqual(problems(tag), []);
  assert.deepEqual(problems(tag.replace("@v9.5.1", "@main")), [
    "Living-Proof-Labs/collaboration-guidelines/.github/workflows/semantic-release.yml@main is not a full release tag",
  ]);
});
