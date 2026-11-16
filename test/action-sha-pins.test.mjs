// SPDX-License-Identifier: Apache-2.0
// Vera review of #55 (same check as collaboration-guidelines#85).
// Offline: every SHA-pinned Action in the workflows uses a full 40-hex SHA and a # vN[.N.N] comment.
// (Tag-referenced uses, such as the org's own reusable workflows, are out of scope here.)
// LIVINGPROOF_NETWORK=1: each SHA is a commit (not an annotated tag object, as the old
// dorny/test-reporter pin 8861569 was), and for a full vX.Y.Z comment it is that tag's peeled
// commit. Floating major tags (# v4) are only checked to be commits, since they move.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

function root() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, ".github/workflows"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("could not find repository root");
    dir = parent;
  }
}

const WORKFLOWS = join(root(), ".github/workflows");
const USES = /^\s*-?\s*uses:\s*(\S+)\s*(?:#\s*(\S+))?\s*$/gm;
const FULL_TAG = /^v\d+\.\d+\.\d+$/;

function pins() {
  const found = [];
  for (const file of readdirSync(WORKFLOWS).filter((n) => /\.ya?ml$/.test(n)).sort()) {
    const text = readFileSync(join(WORKFLOWS, file), "utf8");
    for (const match of text.matchAll(USES)) {
      const [ref, comment] = [match[1], match[2]];
      if (ref.startsWith("./")) continue;
      const at = ref.lastIndexOf("@");
      if (!/^[0-9a-f]{40}$/.test(ref.slice(at + 1))) continue;
      found.push({ file, action: ref.slice(0, at), digest: ref.slice(at + 1), tag: comment });
    }
  }
  return found;
}

test("SHA-pinned workflow Actions carry a release tag comment", () => {
  const found = pins();
  assert.ok(found.some((p) => p.action === "dorny/test-reporter"), "expected dorny/test-reporter");
  for (const pin of found) {
    assert.match(pin.tag ?? "", /^v\d+(?:\.\d+){0,2}$/, `${pin.file}: ${pin.action} tag comment`);
  }
});

test(
  "Action SHA pins are commits, and the peeled commit of a full vX.Y.Z tag",
  { skip: process.env.LIVINGPROOF_NETWORK ? false : "set LIVINGPROOF_NETWORK=1" },
  async () => {
    const token = process.env.GITHUB_TOKEN;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const cache = new Map();
    const commitOf = async (ownerRepo, ref) => {
      const key = `${ownerRepo}@${ref}`;
      if (!cache.has(key)) {
        const url = `https://api.github.com/repos/${ownerRepo}/commits/${ref}`;
        const response = await fetch(url, { headers });
        cache.set(key, response.ok ? (await response.json()).sha : `HTTP ${response.status}`);
      }
      return cache.get(key);
    };
    for (const pin of pins()) {
      const ownerRepo = pin.action.split("/").slice(0, 2).join("/");
      assert.equal(await commitOf(ownerRepo, pin.digest), pin.digest,
        `${pin.file}: ${pin.action}@${pin.digest} is not a commit`);
      if (FULL_TAG.test(pin.tag)) {
        assert.equal(await commitOf(ownerRepo, pin.tag), pin.digest,
          `${pin.file}: ${pin.action}@${pin.digest} is not the peeled commit of ${pin.tag}`);
      }
    }
  },
);
