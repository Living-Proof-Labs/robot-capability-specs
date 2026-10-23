// SPDX-License-Identifier: Apache-2.0
export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    './tooling/policy.mjs',
    ['@semantic-release/github', {
      assets: ['artifacts/release.json', 'artifacts/RELEASE_NOTES.md'],
      successComment: false,
      failComment: false,
      failTitle: false,
      releasedLabels: false,
      addReleases: false,
    }],
  ],
};
