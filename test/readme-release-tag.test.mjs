// SPDX-License-Identifier: Apache-2.0
// The README install command must resolve a release tag. A vX.Y.Z-style
// placeholder is not a tag, and copying it makes pip fail.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const README = join(dirname(fileURLToPath(import.meta.url)), "../README.md");
const PLACEHOLDER = /v[A-Za-z]\.[A-Za-z]\.[A-Za-z]/;

test("README has no vX.Y.Z-style release placeholder", () => {
  const readme = readFileSync(README, "utf8");
  const found = readme.match(PLACEHOLDER);
  assert.equal(found, null, found ? found[0] : "");
  assert.match(readme, /git ls-remote --tags --refs --sort=-v:refname/);
  assert.match(
    readme,
    /https:\/\/github\.com\/Living-Proof-Labs\/robot-capability-specs\/releases/,
  );
});
