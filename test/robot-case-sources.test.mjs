// SPDX-License-Identifier: Apache-2.0
// robot-capability-specs#49: a parameter case that quotes a robot's values cites the robot
// release they come from, and the quoted values match that release, so a stale copy fails.
// Offline, the cited files are the copies under test/fixtures/robot-releases/<repo>/<tag>/.
// LIVINGPROOF_NETWORK=1 also checks that those copies are the released bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SCENARIOS = ['walk-hallway', 'walk-corner'];
const FIXTURES = 'test/fixtures/robot-releases/';
const ROBOT_REPOS = /\blivingproof-(unitree-g1|unitree-go1|booster-t1)\b/;
const TAG = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const json = async path => JSON.parse(await readFile(path, 'utf8'));

function pointer(doc, ref) {
  // "robot.json#/dimensions/width" -> doc at /dimensions/width
  const [, path] = ref.split('#');
  return path.split('/').slice(1).reduce((node, key) => (node == null ? undefined : node[key]), doc);
}

async function robotCases() {
  const out = [];
  for (const scenario of SCENARIOS) {
    const { cases } = await json(`specs/scenarios/${scenario}/parameter-cases.json`);
    for (const c of cases) if (c.source || ROBOT_REPOS.test(c.name)) out.push({ scenario, c });
  }
  return out;
}

function citedFiles(source) {
  return [...new Set(Object.values(source.inputs).map(ref => ref.split('#')[0]))];
}

test('every case that names a robot cites the robot release it quotes', async () => {
  const cases = await robotCases();
  assert.ok(cases.length >= 6, 'expected the G1, Go1 and T1 cases in both scenarios');
  for (const { scenario, c } of cases) {
    const where = `${scenario}: ${c.name}`;
    assert.ok(c.source, `${where} has no source`);
    assert.equal(c.source.repository, `Living-Proof-Labs/${c.name.match(ROBOT_REPOS)[0]}`, where);
    assert.match(c.source.release, TAG, `${where}: release must be a full vX.Y.Z tag`);
    assert.ok(Object.keys(c.source.inputs).length, `${where} cites no inputs`);
  }
});

test('quoted robot values match the cited robot release', async () => {
  const stale = [];
  for (const { scenario, c } of await robotCases()) {
    if (!c.source) continue; // reported by the test above
    const root = `${FIXTURES}${c.source.repository.split('/')[1]}/${c.source.release}/`;
    for (const [input, ref] of Object.entries(c.source.inputs)) {
      const cited = pointer(await json(root + ref.split('#')[0]), ref);
      const quoted = c.inputs[input];
      const same = cited !== null && typeof cited === 'object'
        ? quoted?.value === cited.value && quoted?.unit === cited.unit
        : cited !== undefined && quoted === cited;
      if (!same) {
        const says = cited !== null && typeof cited === 'object' ? { value: cited.value, unit: cited.unit } : cited;
        stale.push(`${scenario}: ${c.name}: ${input} quotes ${JSON.stringify(quoted)}, but ` +
          `${c.source.repository}@${c.source.release} ${ref} says ${JSON.stringify(says)}`);
      }
    }
  }
  assert.deepEqual(stale, []);
});

test('robot release fixtures are the released bytes',
  { skip: process.env.LIVINGPROOF_NETWORK ? false : 'set LIVINGPROOF_NETWORK=1' }, async () => {
    for (const { c } of await robotCases()) {
      for (const file of citedFiles(c.source)) {
        const url = `https://raw.githubusercontent.com/${c.source.repository}/${c.source.release}/${file}`;
        const res = await fetch(url);
        assert.equal(res.status, 200, url);
        const local = await readFile(`${FIXTURES}${c.source.repository.split('/')[1]}/${c.source.release}/${file}`, 'utf8');
        assert.equal(local, await res.text(), url);
      }
    }
  });
