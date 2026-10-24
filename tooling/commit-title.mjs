// SPDX-License-Identifier: Apache-2.0
// Existing PR-title check; independent of release analysis and generation.
const types = ['feat', 'fix', 'perf', 'docs', 'chore', 'build', 'ci', 'test', 'refactor', 'style', 'revert'];
export function validTitle(title) {
  return new RegExp(`^(${types.join('|')})(\\([^\\r\\n()]+\\))?!?: \\S[^\\r\\n]*$`).test(title);
}
