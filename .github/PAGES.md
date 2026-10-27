<!-- SPDX-License-Identifier: Apache-2.0 -->
# Pages deployment and live verification

Scoped approval permits the main-only `pages.yml` workflow. Repository settings
are handled separately by the parent browser worker; this implementation does
not mutate settings.

The parent completed repository settings on 2026-10-27: Pages uses GitHub
Actions, with a main-only environment and no project custom domain. Read-only
API verification returned `has_pages: true`, `build_type: workflow`, and
`cname: null`; no deployment status was present yet. The authorized setup is:

1. GitHub Pages uses the GitHub Actions build source.
2. The parent configured `github-pages` to permit deployments only from main.
3. The prepared `pages.yml` workflow is active after merge. Only its separate
   deploy job requests `pages: write` and `id-token: write`; build remains
   `contents: read`. The deploy job executes no checkout or project code.

The intended URL is `https://docs.livingprooflabs.com/robot-capability-specs/`.
No per-project custom domain, CNAME, DNS, mail or organization setting change is
needed or authorized. Deployment is serialized and restricted to main after
successful verification. The Pages transfer artifact contains only public HTML.

After independent review and merge, deploy and record the run, source SHA and public URL. Check the
live landing page, revision links and anchors, search and result navigation,
asset loading, desktop/mobile navigation, themes and version identity. Then add
a prominent Start here link to the README and the verified manual to the shared
documentation directory in separately scoped work. Neither is claimed complete
by a local build or artifact upload.
