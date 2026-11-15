// SPDX-License-Identifier: Apache-2.0
// docs-brand.lock.json names a published release whose tag, commit and brand.css bytes all agree.
// Proposed by Vera in the capability-verifier#72 review (guidelines bump checklist item 7).
// Offline tests use a fake GitHub; LIVINGPROOF_NETWORK=1 checks the real release.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

function root() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, "docs-brand.lock.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("could not find docs-brand.lock.json");
    dir = parent;
  }
}

const ROOT = root();
const REPO = "Living-Proof-Labs/collaboration-guidelines";
const PATH = "brand/docs/brand.css";
const API = `https://api.github.com/repos/${REPO}`;

function lock() {
  return JSON.parse(readFileSync(join(ROOT, "docs-brand.lock.json"), "utf8"));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function problems(pin, get) {
  const found = [];
  const keys = Object.keys(pin).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["commit", "path", "repository", "sha256", "version"])) {
    return [`expected the five lock fields, got ${keys}`];
  }
  if (pin.repository !== REPO || pin.path !== PATH) {
    found.push("lock must name the collaboration-guidelines brand.css");
  }
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pin.version)) {
    found.push(`version ${pin.version} is not a full release tag`);
  }
  if (!/^[0-9a-f]{40}$/.test(pin.commit) || !/^[0-9a-f]{64}$/.test(pin.sha256)) {
    found.push("commit must be 40 and sha256 64 lowercase hex characters");
  }
  if (found.length) return found;
  const release = JSON.parse(get(`${API}/releases/tags/${pin.version}`).toString());
  if (release.tag_name !== pin.version || release.draft || release.prerelease) {
    found.push(`${pin.version} is not a published stable release`);
  }
  const commit = JSON.parse(get(`${API}/commits/${pin.version}`).toString()).sha;
  if (commit !== pin.commit) {
    found.push(`${pin.version} is commit ${commit}, lock says ${pin.commit}`);
  }
  const digest = sha256(get(`https://raw.githubusercontent.com/${REPO}/${commit}/${PATH}`));
  if (digest !== pin.sha256) {
    found.push(`brand.css at ${pin.version} has sha256 ${digest}, lock says ${pin.sha256}`);
  }
  return found;
}

const V740 = ["v7.4.0", "613e3d97bbb1f00836d88b25c380b9eafdcfb15a", Buffer.from("/* brand v7.4.0 */")];
const V920 = ["v9.2.0", "8c8155ec9db30dbe19ce5c2a71cf10f3f71271b0", Buffer.from("/* brand v9.2.0 */")];

function fakeGithub(releases, draft = new Set()) {
  const pages = {};
  for (const [tag, commit, css] of releases) {
    pages[`${API}/releases/tags/${tag}`] = JSON.stringify({
      tag_name: tag,
      draft: draft.has(tag),
      prerelease: false,
    });
    pages[`${API}/commits/${tag}`] = JSON.stringify({ sha: commit });
    pages[`https://raw.githubusercontent.com/${REPO}/${commit}/${PATH}`] = css;
  }
  return (url) => {
    const page = pages[url];
    if (page == null) throw new Error(`unexpected request ${url}`);
    return Buffer.isBuffer(page) ? page : Buffer.from(page);
  };
}

function pinFor(tag, commit, css) {
  return { repository: REPO, version: tag, commit, path: PATH, sha256: sha256(css) };
}

test("committed lock has the five fields and spellings", () => {
  const pin = lock();
  assert.deepEqual(Object.keys(pin).sort(), ["commit", "path", "repository", "sha256", "version"]);
  assert.equal(pin.repository, REPO);
  assert.equal(pin.path, PATH);
  assert.match(pin.version, /^v\d+\.\d+\.\d+$/);
  assert.match(pin.commit, /^[0-9a-f]{40}$/);
  assert.match(pin.sha256, /^[0-9a-f]{64}$/);
});

test("a regenerated lock passes", () => {
  assert.deepEqual(problems(pinFor(...V920), fakeGithub([V740, V920])), []);
});

test("a version-only update is refused", () => {
  const pin = { ...pinFor(...V740), version: "v9.2.0" };
  const found = problems(pin, fakeGithub([V740, V920]));
  assert.ok(found.some((p) => p.includes("is commit 8c8155e")), found);
  assert.ok(found.some((p) => p.includes("brand.css at v9.2.0")), found);
});

test("a draft release is refused", () => {
  const found = problems(pinFor(...V920), fakeGithub([V920], new Set(["v9.2.0"])));
  assert.deepEqual(found, ["v9.2.0 is not a published stable release"]);
});

test("a short tag is refused before any request", () => {
  const offline = (url) => {
    throw new Error(`unexpected request ${url}`);
  };
  assert.deepEqual(problems({ ...pinFor(...V920), version: "v9.2" }, offline), [
    "version v9.2 is not a full release tag",
  ]);
});

test("committed lock matches the real release", { skip: process.env.LIVINGPROOF_NETWORK ? false : "set LIVINGPROOF_NETWORK=1" }, async () => {
  const token = process.env.GITHUB_TOKEN;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const get = async (url) => {
    const response = await fetch(url, { headers });
    assert.ok(response.ok, `${url} -> ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  };
  // problems() is synchronous; wrap the async get.
  const cache = {};
  const syncGet = (url) => {
    if (!(url in cache)) throw new Error(`missing prefetched ${url}`);
    return cache[url];
  };
  const pin = lock();
  cache[`${API}/releases/tags/${pin.version}`] = await get(`${API}/releases/tags/${pin.version}`);
  cache[`${API}/commits/${pin.version}`] = await get(`${API}/commits/${pin.version}`);
  const commit = JSON.parse(cache[`${API}/commits/${pin.version}`].toString()).sha;
  const raw = `https://raw.githubusercontent.com/${REPO}/${commit}/${PATH}`;
  cache[raw] = await get(raw);
  assert.deepEqual(problems(pin, syncGet), []);
});
