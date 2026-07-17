# npm Trusted Publishing Design

## Goal

Migrate `wc-now` releases from a long-lived npm token to npm Trusted Publishing through GitHub Actions OIDC, while preserving the existing Changesets release workflow and automatic publication behavior.

## Root Cause

The release build succeeds and `wc-now@0.2.1` exists in the npm registry with repository metadata matching `multiplehats/wc-now`. The failure occurs when npm handles the authenticated `PUT` for version `0.2.2`. The workflow currently supplies `NPM_TOKEN`, so it follows the legacy token-authentication path; npm reports rejected or unauthorized package publishing as a 404.

## Design

The existing `.github/workflows/release.yml` remains the sole release workflow. It continues to use `changesets/action` and `pnpm ci:publish`, preserving release pull requests, versioning, GitHub releases, tags, and direct npm publication.

The workflow will:

- grant `id-token: write` so GitHub Actions can mint an OIDC identity token;
- retain `contents: write` and `pull-requests: write`, which Changesets needs;
- remove `packages: write`, which applies to GitHub Packages rather than npm;
- run on Node.js 24 so the bundled npm CLI supports Trusted Publishing;
- configure `https://registry.npmjs.org` as the npm registry;
- disable the dependency cache for the release job;
- stop exposing `NPM_TOKEN` to the Changesets action.

The npm Trusted Publisher is configured separately for:

- package: `wc-now`;
- GitHub repository: `multiplehats/wc-now`;
- workflow filename: `release.yml`;
- allowed action: `npm publish`;
- GitHub environment: none.

The package's existing `repository.url` already matches the trusted GitHub repository and requires no change.

## Publish Flow

1. A push to a configured release branch starts `release.yml` on a GitHub-hosted runner.
2. The workflow installs dependencies and invokes `changesets/action`.
3. If Changesets finds pending changesets, it creates or updates the release pull request as before.
4. If no changesets remain and an unpublished package version exists, `pnpm ci:publish` builds the package and `changeset publish` invokes npm.
5. npm detects the GitHub Actions OIDC environment, exchanges the workflow identity for a short-lived registry credential, and publishes `wc-now`.
6. npm automatically records provenance for the public package published from the public repository.

## Error Handling

The workflow will continue to fail when the build, Changesets, OIDC exchange, or npm publication fails. Trusted Publisher identity fields are exact and case-sensitive; a mismatch in repository or workflow filename is expected to surface during publication rather than when the npm trust configuration is saved.

No token fallback will remain in the workflow. This ensures an incorrect OIDC configuration fails closed instead of silently using a long-lived publishing credential.

## Verification

Static verification will confirm that:

- the workflow is valid YAML;
- `id-token: write` is present;
- Node.js 24 and the npm registry are configured;
- release caching is disabled;
- no npm publishing token is referenced;
- the package repository metadata matches `multiplehats/wc-now`.

Local project verification will run the existing typecheck, lint, tests, and build. The complete end-to-end authentication check can only occur in GitHub Actions when an unpublished version is published. The next release run should show that Changesets detected OIDC and used npm Trusted Publishing.

## Out of Scope

- Changing the Changesets release model or release branches.
- Switching to staged publishing or manual approval.
- Adding a GitHub deployment environment.
- Restricting token access or deleting old npm/GitHub secrets before the first successful OIDC publish.
