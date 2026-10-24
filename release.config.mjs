// SPDX-License-Identifier: Apache-2.0
const maintenanceTypes = ['docs', 'chore', 'build', 'ci', 'test', 'refactor', 'style', 'revert'];
const types = ['feat', 'fix', 'perf', ...maintenanceTypes];
export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', {
      preset: 'conventionalcommits',
      releaseRules: [
        // Matching custom rules must not downgrade a breaking docs/chore change.
        { breaking: true, release: 'major' },
        ...maintenanceTypes.map(type => ({ type, release: 'patch' })),
      ],
    }],
    ['@semantic-release/release-notes-generator', {
      preset: 'conventionalcommits',
      presetConfig: { types: types.map(type => ({ type, section: type, hidden: false })) },
    }],
    ['@semantic-release/github', {
      successComment: false,
      failComment: false,
      failTitle: false,
      releasedLabels: false,
      addReleases: false,
    }],
  ],
};
