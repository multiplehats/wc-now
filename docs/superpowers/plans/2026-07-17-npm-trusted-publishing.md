# npm Trusted Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `wc-now` from the existing Changesets workflow with npm Trusted Publishing instead of a long-lived npm token.

**Architecture:** Keep `.github/workflows/release.yml` as the single release orchestrator and keep `changesets/action@v1` invoking `pnpm ci:publish`. Give the job an OIDC identity, run a Trusted Publishing-compatible Node/npm toolchain, configure npmjs.org explicitly, and remove every token-authentication fallback from the workflow.

**Tech Stack:** GitHub Actions, Node.js 24, npm 11.5.1 or newer, pnpm 9.14.4, Changesets, npm Trusted Publishing/OIDC

## Global Constraints

- Preserve the existing Changesets release pull request and direct-publication behavior.
- Keep `main` and `next` as release workflow trigger branches.
- Use the existing GitHub-hosted `macos-latest` runner.
- Trusted Publisher identity is `multiplehats/wc-now` plus workflow filename `release.yml`, with no GitHub environment.
- Do not retain an npm token fallback in the workflow.
- Do not delete the repository's old npm secret or restrict npm token access until an OIDC publish succeeds.

---

### Task 1: Migrate the release workflow to OIDC

**Files:**

- Modify: `.github/workflows/release.yml`

**Interfaces:**

- Consumes: npm Trusted Publisher for package `wc-now`, repository `multiplehats/wc-now`, workflow `release.yml`, allowed action `npm publish`, no environment.
- Produces: A GitHub Actions release job that exposes GitHub's OIDC request variables to npm 11.5.1 or newer and has no npm publishing token configured.

- [ ] **Step 1: Run the workflow regression check and verify the legacy configuration fails it**

Run:

```bash
node --input-type=module -e '
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const workflow = readFileSync(".github/workflows/release.yml", "utf8");
assert.match(workflow, /^\s*id-token:\s*write\s*$/m);
assert.match(workflow, /^\s*node-version:\s*24\s*$/m);
assert.match(workflow, /^\s*registry-url:\s*"https:\/\/registry\.npmjs\.org"\s*$/m);
assert.match(workflow, /^\s*package-manager-cache:\s*false\s*$/m);
assert.doesNotMatch(workflow, /^\s*cache:\s*pnpm\s*$/m);
assert.doesNotMatch(workflow, /^\s*packages:\s*write\s*$/m);
assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/);
'
```

Expected: FAIL on the missing `id-token: write` assertion, proving the check detects the legacy token-based workflow.

- [ ] **Step 2: Apply the minimal trusted-publishing workflow configuration**

Replace `.github/workflows/release.yml` with:

```yaml
name: Release

on:
  push:
    branches:
      - main
      - next

concurrency: ${{ github.workflow }}-${{ github.ref }}

permissions:
  contents: write
  pull-requests: write
  id-token: write

jobs:
  release:
    name: Release
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          registry-url: "https://registry.npmjs.org"
          package-manager-cache: false

      - name: Install dependencies
        run: pnpm install --frozen-lockfile --prefer-offline

      - name: Create Release Pull Request or Publish to npm
        id: changesets
        uses: changesets/action@v1
        with:
          commit: "chore(release): version package"
          title: "chore(release): version package"
          publish: pnpm ci:publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 3: Run the workflow regression check and verify it passes**

Run the exact Node.js assertion command from Step 1.

Expected: exit code 0 with no assertion output.

- [ ] **Step 4: Validate workflow syntax and formatting**

Run:

```bash
pnpm exec prettier --check .github/workflows/release.yml
```

Expected: exit code 0 and `All matched files use Prettier code style!`

- [ ] **Step 5: Run the project verification suite**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all four commands exit 0. The build may continue to report the existing `Generated an empty chunk: "blueprint/types"` warning, but must generate `blueprint.json` successfully.

- [ ] **Step 6: Review the final diff for scope and credential removal**

Run:

```bash
git diff --check
git diff -- .github/workflows/release.yml
git status --short
```

Expected: no whitespace errors; the workflow diff only adds OIDC-compatible release configuration, updates the relevant official Actions, and removes legacy npm token/package permissions; the plan document may also appear as an untracked file.

- [ ] **Step 7: Commit the implementation**

```bash
git add .github/workflows/release.yml docs/superpowers/plans/2026-07-17-npm-trusted-publishing.md
git commit -m "ci: use npm trusted publishing"
```

- [ ] **Step 8: Verify the first GitHub Actions publish before retiring legacy credentials**

After the implementation reaches GitHub and the release PR for `0.2.2` is merged, inspect the Release workflow log.

Expected evidence:

```text
No NPM_TOKEN found, but OIDC is available - using npm trusted publishing
```

The publish must complete as `wc-now@0.2.2` and npm should display provenance linked to `multiplehats/wc-now/.github/workflows/release.yml`. Only after that successful publish should the old GitHub `NPM_TOKEN` secret be deleted and npm publishing access optionally changed to disallow tokens.
