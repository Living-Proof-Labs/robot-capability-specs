// SPDX-License-Identifier: Apache-2.0
// A workflow that reads current main at git/ref/heads/main must send the
// workflow token. An anonymous call shares the runner rate limit, fails with
// HTTP 403, and leaves the published site on the previous release.
// contents: read is enough for that call.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function root() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsWorkflows(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("could not find repository root");
    dir = parent;
  }
}

function existsWorkflows(dir) {
  try {
    return readdirSync(join(dir, ".github/workflows")).some((name) => name.endsWith(".yml"));
  } catch {
    return false;
  }
}

const ROOT = root();
const WORKFLOWS = join(ROOT, ".github/workflows");
const FRESHNESS = "git/ref/heads/main";
const TOKEN_VALUE = /\$\{\{\s*(?:github\.token|secrets\.GITHUB_TOKEN)\s*\}\}/;
const EXPECTED_SHA = "a".repeat(40);
const SUPERSEDED = "Superseded source; deployment skipped.";

function indentOf(line) {
  return line.match(/^ */)[0].length;
}

function stripValue(value) {
  return value.trim().replace(/\s+#.*$/, "").replace(/^['"]|['"]$/g, "");
}

function envsAt(lines, envIndent) {
  const found = [];
  const envRe = envIndent === 0 ? /^env:\s*$/ : new RegExp(`^ {${envIndent}}env:\\s*$`);
  for (let i = 0; i < lines.length; i++) {
    if (!envRe.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const inner = lines[j];
      if (!inner.trim() || /^\s*#/.test(inner)) continue;
      const indent = indentOf(inner);
      if (indent <= envIndent) break;
      const match = inner.match(/^ +([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
      if (match && indent === envIndent + 2) {
        found.push({ name: match[1], value: stripValue(match[2]) });
      }
    }
  }
  return found;
}

function permissionBlock(lines, blockIndent) {
  const re = blockIndent === 0
    ? /^permissions:\s*(.*)$/
    : new RegExp(`^ {${blockIndent}}permissions:\\s*(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(re);
    if (!match) continue;
    const inline = stripValue(match[1]);
    if (inline && inline !== "|" && inline !== ">") return { _scalar: inline };
    const block = {};
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const indent = indentOf(line);
      if (indent <= blockIndent) break;
      const key = line.match(/^ +([\w-]+):\s*(.*)$/);
      if (key && indent === blockIndent + 2) block[key[1]] = stripValue(key[2]);
    }
    return block;
  }
  return null;
}

function extractJobs(text) {
  const lines = text.split(/\r?\n/);
  const jobs = [];
  let inJobs = false;
  let current = null;
  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (!inJobs) continue;
    if (line.trim() && indentOf(line) === 0) break;
    if (/^  [\w-]+:\s*$/.test(line)) {
      if (current) jobs.push(current);
      current = { name: line.trim().slice(0, -1), lines: [line] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) jobs.push(current);
  return jobs;
}

function extractSteps(jobLines) {
  const steps = [];
  let inSteps = false;
  let current = null;
  for (const line of jobLines) {
    if (/^    steps:\s*$/.test(line)) {
      inSteps = true;
      continue;
    }
    if (!inSteps) continue;
    if (line.trim() && indentOf(line) <= 4) break;
    if (/^      - /.test(line)) {
      if (current) steps.push(current);
      current = [line];
      continue;
    }
    if (current) current.push(line);
  }
  if (current) steps.push(current);
  return steps;
}

function runScript(stepLines) {
  const scripts = [];
  for (let i = 0; i < stepLines.length; i++) {
    const match = stepLines[i].match(/^( +)run:\s*(.*)$/);
    if (!match) continue;
    const indent = match[1].length;
    const rest = match[2].trim();
    if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-" || rest === "|+" || rest === ">+") {
      const body = [];
      for (let j = i + 1; j < stepLines.length; j++) {
        const inner = stepLines[j];
        if (!inner.trim()) {
          body.push("");
          continue;
        }
        if (indentOf(inner) <= indent) break;
        body.push(inner);
      }
      scripts.push(body.join("\n"));
    } else {
      scripts.push(stripValue(rest));
    }
  }
  return scripts.join("\n");
}

function workflowTokenEnv(entries) {
  return entries.filter((entry) =>
    (entry.name === "GH_TOKEN" || entry.name === "GITHUB_TOKEN") && TOKEN_VALUE.test(entry.value));
}

function usesDirectHttp(script) {
  return /urlopen|urllib\.request|requests\.(?:get|post|request)|(?:^|[^\w])curl\s|http\.client|\bfetch\(/.test(script);
}

function sendsBearer(script, tokenNames) {
  if (!/Authorization/.test(script) || !/Bearer/.test(script)) return false;
  return tokenNames.some((name) => script.includes(name));
}

function contentsPermission(jobLines, workflowText) {
  const job = permissionBlock(jobLines, 4);
  if (job) return job.contents ?? null;
  const workflow = permissionBlock(workflowText.split(/\r?\n/), 0);
  return workflow?.contents ?? null;
}

// Problems for one workflow document. An empty list means every freshness
// read is authenticated and the job keeps contents: read.
export function freshnessProblems(filename, text) {
  const problems = [];
  const workflowEnv = workflowTokenEnv(envsAt(text.split(/\r?\n/), 0));
  for (const job of extractJobs(text)) {
    const jobEnv = workflowTokenEnv(envsAt(job.lines, 4));
    for (const step of extractSteps(job.lines)) {
      const stepText = step.join("\n");
      if (!stepText.includes(FRESHNESS)) continue;
      const script = runScript(step);
      const tokens = workflowTokenEnv([
        ...workflowEnv,
        ...jobEnv,
        ...envsAt(step, 8),
      ]);
      const tokenNames = tokens.map((entry) => entry.name);
      const ghApi = /\bgh\s+api\b/.test(script);
      const directHttp = usesDirectHttp(script);
      const where = `${filename} job ${job.name}`;
      if (!script.includes(FRESHNESS)) {
        problems.push(
          `${where}: ${FRESHNESS} is outside the run script, so the call is not an authenticated read`,
        );
        continue;
      }
      if (!ghApi && !directHttp) {
        problems.push(
          `${where}: ${FRESHNESS} is called without authentication. Pass GH_TOKEN or GITHUB_TOKEN from github.token and use gh api, or send Authorization: Bearer.`,
        );
        continue;
      }
      if (ghApi && tokenNames.length === 0) {
        problems.push(
          `${where}: gh api reads ${FRESHNESS} without authentication. Set GH_TOKEN or GITHUB_TOKEN to \${{ github.token }} in the step env.`,
        );
      }
      if (directHttp && (tokenNames.length === 0 || !sendsBearer(script, tokenNames))) {
        problems.push(
          `${where}: ${FRESHNESS} is called without authentication. Pass GITHUB_TOKEN from github.token in the step env and send Authorization: Bearer with that token.`,
        );
      }
      if (contentsPermission(job.lines, text) !== "read") {
        problems.push(
          `${where}: the freshness read must set permissions contents: read. That scope is enough; do not grant contents: write.`,
        );
      }
    }
  }
  return problems;
}

const UNAUTHENTICATED = `
jobs:
  deploy:
    permissions:
      pages: write
      id-token: write
    steps:
      - name: Check current main inside deployment lock
        env:
          EXPECTED_SHA: abcdef
        run: |
          python - <<'PYCODE'
          import json, os, urllib.request
          url = 'https://api.github.com/repos/example/repo/git/ref/heads/main'
          with urllib.request.urlopen(url, timeout=30) as response:
              current = json.load(response)['object']['sha']
          PYCODE
`;

const TOKEN_PRESENT_BUT_UNUSED = `
jobs:
  deploy:
    permissions:
      contents: read
    steps:
      - name: Check current main
        env:
          GITHUB_TOKEN: \${{ github.token }}
        run: |
          python - <<'PYCODE'
          import urllib.request
          url = 'https://api.github.com/repos/example/repo/git/ref/heads/main'
          urllib.request.urlopen(url)
          PYCODE
`;

const GH_WITHOUT_TOKEN = `
permissions:
  contents: read
jobs:
  deploy:
    steps:
      - name: Require current main
        run: |
          current=$(gh api repos/example/repo/git/ref/heads/main --jq .object.sha)
          test "$current" = "$GITHUB_SHA"
`;

const AUTHENTICATED_GH = `
permissions:
  contents: read
jobs:
  deploy:
    permissions:
      contents: read
    steps:
      - name: Require current main
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          ref="repos/\${GITHUB_REPOSITORY}/git/ref/heads/main"
          current=$(gh api "$ref" --jq .object.sha)
          test "$current" = "$GITHUB_SHA"
`;

const AUTHENTICATED_URLLIB = `
jobs:
  deploy:
    permissions:
      contents: read
      pages: write
      id-token: write
    steps:
      - name: Require current main
        env:
          GITHUB_TOKEN: \${{ github.token }}
        run: |
          python - <<'PYCODE'
          import json, os, urllib.request
          token = os.environ["GITHUB_TOKEN"]
          repo = os.environ["GITHUB_REPOSITORY"]
          url = f"https://api.github.com/repos/{repo}/git/ref/heads/main"
          request = urllib.request.Request(
              url,
              headers={"Authorization": f"Bearer {token}"},
          )
          with urllib.request.urlopen(request, timeout=30) as response:
              current = json.load(response)["object"]["sha"]
          PYCODE
`;

function pagesText() {
  return readFileSync(join(WORKFLOWS, "pages.yml"), "utf8");
}

function deployJob(text = pagesText()) {
  const job = extractJobs(text).find((item) => item.name === "deploy");
  assert.ok(job, "pages.yml deploy job");
  return job;
}

test("repository workflows authenticate every main-freshness read", () => {
  const files = readdirSync(WORKFLOWS).filter((name) => /\.ya?ml$/.test(name)).sort();
  const calls = [];
  const problems = [];
  for (const name of files) {
    const text = readFileSync(join(WORKFLOWS, name), "utf8");
    if (text.includes(FRESHNESS)) calls.push(name);
    problems.push(...freshnessProblems(name, text));
  }
  assert.deepEqual(problems, [], problems.join("\n"));
  assert.deepEqual(calls, ["pages.yml"]);

  const text = pagesText();
  const job = deployJob(text);
  assert.deepEqual(permissionBlock(job.lines, 4), {
    pages: "write",
    "id-token": "write",
    contents: "read",
  });
  const steps = extractSteps(job.lines);
  const guard = steps[0].join("\n");
  assert.match(guard, /name: Confirm this run still describes current main/);
  assert.match(guard, /GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/);
  assert.match(runScript(steps[0]), /\bgh\s+api\b/);
  assert.match(runScript(steps[0]), /git\/ref\/heads\/main/);
  assert.doesNotMatch(runScript(steps[0]), /urlopen\s*\(\s*url\b/);
  const deploy = steps[1].join("\n");
  assert.match(deploy, /actions\/deploy-pages@/);
  assert.match(deploy, /if: steps\.freshness\.outputs\.current == 'true'/);
});

test("an unauthenticated urllib freshness read fails", () => {
  const problems = freshnessProblems("sample.yml", UNAUTHENTICATED);
  assert.ok(problems.some((problem) => /without authentication/.test(problem)), problems.join("\n"));
  assert.ok(problems.some((problem) => /contents: read/.test(problem)), problems.join("\n"));
  assert.ok(problems.some((problem) => /contents: write/.test(problem)), problems.join("\n"));
});

test("a token that is not sent on the request still fails", () => {
  const problems = freshnessProblems("sample.yml", TOKEN_PRESENT_BUT_UNUSED);
  assert.ok(problems.some((problem) => /without authentication/.test(problem)), problems.join("\n"));
});

test("gh api without GH_TOKEN fails", () => {
  const problems = freshnessProblems("sample.yml", GH_WITHOUT_TOKEN);
  assert.ok(problems.some((problem) => /without authentication/.test(problem)), problems.join("\n"));
});

test("gh api with GH_TOKEN and urllib with Authorization Bearer pass", () => {
  assert.deepEqual(freshnessProblems("gh.yml", AUTHENTICATED_GH), []);
  assert.deepEqual(freshnessProblems("urllib.yml", AUTHENTICATED_URLLIB), []);
});

test("contents: write fails even when the read sends a token", () => {
  const text = AUTHENTICATED_URLLIB.replace(
    "      contents: read\n      pages: write",
    "      contents: write\n      pages: write",
  );
  const problems = freshnessProblems("sample.yml", text);
  assert.ok(
    problems.some((problem) => /contents: read/.test(problem) && /contents: write/.test(problem)),
    problems.join("\n"),
  );
});

test("removing the pages freshness token fails the guard", () => {
  const text = pagesText().replace(/\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n/, "\n");
  assert.notEqual(text, pagesText());
  const problems = freshnessProblems("pages.yml", text);
  assert.ok(problems.some((problem) => /without authentication/.test(problem)), problems.join("\n"));
});

function runGuard({ remoteSha, ghStatus }) {
  const script = runScript(extractSteps(deployJob().lines)[0]);
  const dir = mkdtempSync(join(tmpdir(), "freshness-"));
  const record = join(dir, "record");
  const gh = join(dir, "gh");
  writeFileSync(gh, `#!/bin/sh
printf '%s\\n' "$*" > '${record}'
if [ -n "$GH_TOKEN" ]; then
  printf '%s\\n' token-present >> '${record}'
else
  printf '%s\\n' token-missing >> '${record}'
fi
if [ '${ghStatus}' != 0 ]; then
  echo 'HTTP Error ${ghStatus}: rate limit exceeded' >&2
  exit ${ghStatus}
fi
printf '%s\\n' '${remoteSha}'
`);
  chmodSync(gh, 0o755);
  const output = join(dir, "output");
  const summary = join(dir, "summary");
  const result = spawnSync("bash", ["-eo", "pipefail", "-c", script], {
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      GH_TOKEN: "workflow-token",
      GITHUB_REPOSITORY: "Living-Proof-Labs/robot-capability-specs",
      GITHUB_SHA: EXPECTED_SHA,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
    },
    encoding: "utf8",
  });
  const read = (path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return "";
    }
  };
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    record: read(record),
    output: read(output),
    summary: read(summary),
  };
}

test("the freshness step deploys only the current main and fails when the read fails", () => {
  const current = runGuard({ remoteSha: EXPECTED_SHA, ghStatus: 0 });
  assert.equal(current.status, 0, current.stderr);
  assert.match(current.record, /git\/ref\/heads\/main/);
  assert.match(current.record, /token-present/);
  assert.match(current.output, /^current=true$/m);
  assert.equal(current.summary, "");
  assert.doesNotMatch(`${current.stdout}${current.stderr}${current.output}${current.summary}`, /workflow-token/);

  const moved = runGuard({ remoteSha: "b".repeat(40), ghStatus: 0 });
  assert.equal(moved.status, 0, moved.stderr);
  assert.doesNotMatch(moved.output, /current=true/);
  assert.match(moved.summary, new RegExp(SUPERSEDED));

  const empty = runGuard({ remoteSha: "", ghStatus: 0 });
  assert.equal(empty.status, 0, empty.stderr);
  assert.doesNotMatch(empty.output, /current=true/);
  assert.match(empty.summary, new RegExp(SUPERSEDED));

  const denied = runGuard({ remoteSha: EXPECTED_SHA, ghStatus: 403 });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /HTTP Error 403: rate limit exceeded/);
  assert.doesNotMatch(denied.output, /current=true/);
  assert.doesNotMatch(`${denied.stdout}${denied.stderr}`, /workflow-token/);
});
