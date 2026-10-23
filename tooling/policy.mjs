// SPDX-License-Identifier: Apache-2.0
import { analyzeCommits as analyze } from '@semantic-release/commit-analyzer';
import { generateNotes as generate } from '@semantic-release/release-notes-generator';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const types = ['feat', 'fix', 'perf', 'docs', 'chore', 'build', 'ci', 'test', 'refactor', 'style', 'revert'];
export const analyzerOptions = {
  preset: 'conventionalcommits',
  releaseRules: [
    { breaking: true, release: 'major' },
    { type: 'feat', release: 'minor' },
    { type: '*', release: 'patch' },
  ],
};
export const notesOptions = {
  preset: 'conventionalcommits',
  presetConfig: { types: types.map(type => ({ type, section: type, hidden: false })) },
};
export function validTitle(title) {
  return new RegExp(`^(${types.join('|')})(\\([^\\r\\n()]+\\))?!?: \\S[^\\r\\n]*$`).test(title);
}
export async function analyzeCommits(_, context) {
  // Conventional parsing decides severity; an unclassified/merge/revert commit
  // still needs a release. Do not silently discard historical commits.
  return await analyze(analyzerOptions, context) || (context.commits.length ? 'patch' : null);
}
export function manifest(context) {
  return {
    formatVersion: 1,
    version: context.nextRelease.version,
    gitTag: context.nextRelease.gitTag,
    gitHead: context.nextRelease.gitHead,
    commits: context.commits.map(({ hash, message }) => ({ hash, subject: message.split('\n')[0] })),
  };
}
export async function generateNotes(_, context) {
  const notes = await generate(notesOptions, context);
  // Complete ledger also covers merges, reverts and unknown legacy types which
  // conventional-changelog may intentionally filter out of its summary.
  const ledger = context.commits.map(({ hash, message }) =>
    `- ${hash}: ${message.split('\n')[0].replace(/[<>`]/g, '')}`).join('\n');
  return `${notes}\n\n### Complete commit ledger\n\n${ledger}\n\nRelease source: ${context.nextRelease.gitHead}\n`;
}
export async function prepare(_, context) {
  const directory = join(context.cwd, 'artifacts');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'release.json'), JSON.stringify(manifest(context), null, 2) + '\n');
  await writeFile(join(directory, 'RELEASE_NOTES.md'), context.nextRelease.notes);
}
