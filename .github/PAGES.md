<!-- SPDX-License-Identifier: Apache-2.0 -->
# Pages deployment and live verification

The main-only `pages.yml` workflow publishes the manual after verification.
Repository settings were enabled separately under scoped approval.

Repository settings were completed on 2026-10-27: Pages uses GitHub
Actions, with a main-only environment and no project custom domain. Read-only
API verification returned `has_pages: true`, `build_type: workflow`, and
`cname: null`. The setup is:

1. GitHub Pages uses the GitHub Actions build source.
2. `github-pages` is configured to permit deployments only from main.
3. The `pages.yml` workflow is active. Only its separate
   deploy job requests `pages: write` and `id-token: write`; build remains
   `contents: read`. The deploy job executes no checkout or project code.

The published URL is `https://docs.livingprooflabs.com/robot-capability-specs/`.
No per-project custom domain, CNAME, DNS, mail or organization setting change is
needed or authorized. Deployment is serialized and restricted to main after
successful verification. The Pages transfer artifact contains only public HTML.

## Published revision

[Pages run 40452444868](https://github.com/Living-Proof-Labs/robot-capability-specs/actions/runs/40452444868)
published source `323ebcec62b68633987a2c44f87230639a4cb3c8` on 2026-10-27,
also released as catalog v1.2.2. The live `build.json` records that exact revision,
`dirty: false`, and Zensical 0.0.73. The manual follows main; subsequent deployments
show their own exact source identity rather than retaining a historical manual.

For each deployment, check the live landing page, revision links and anchors,
search and result navigation, asset loading, desktop/mobile navigation, themes
and version identity. A successful build or artifact upload alone is not live
verification. The shared documentation-directory entry is maintained separately.
