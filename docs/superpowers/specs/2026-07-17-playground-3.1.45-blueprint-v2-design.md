# Playground 3.1.45 and Blueprint v2 Design

## Goal

Upgrade wc-now from `@wp-playground/cli` `^3.0.46` to `^3.1.45`, make
Blueprint v2 the default generated format, retain native Blueprint v1 support,
and fix the related CLI, Store API, example, and documentation issues in the
same compatibility-focused release.

## Upstream findings

- npm and the official WordPress Playground GitHub release identify `3.1.45`
  as the latest stable release on 2026-07-17.
- The 31 published stable releases after `3.0.46` contain no breaking change
  for wc-now's current Blueprint v1 flow, CLI executable path, `start` and
  `server` commands, mounts, or pass-through arguments.
- Relevant compatible changes include mount reliability fixes,
  `--no-auto-mount`, configurable workers, native Blueprint v2 CLI support,
  and removing `process.exit()` from library APIs.
- Both `3.0.46` and `3.1.45` document Node.js 20.18 as the minimum runtime.
  wc-now's current `>=20` engine declaration is therefore inaccurate and will
  be corrected to `>=20.18.0`.
- Blueprint v2 is not v1 plus a `version` property. It moves runtime versions,
  application options, plugins, site options, and helper files into new
  declarative fields. It retains an `additionalStepsAfterExecution` escape
  hatch for supported imperative steps such as `runPHP`.
- Blueprint v2 intentionally omits v1's `phpExtensionBundles`. The v2 CLI
  resolves its own standard runtime configuration, so wc-now will not emit an
  unsupported replacement. A real WooCommerce boot is required to verify this
  compatibility boundary.

Primary upstream references:

- <https://github.com/WordPress/wordpress-playground/releases/tag/v3.1.45>
- <https://www.npmjs.com/package/@wp-playground/cli>
- <https://github.com/WordPress/wordpress-playground/blob/v3.1.45/packages/playground/blueprints/src/lib/v2/wep-1-blueprint-v2-schema/appendix-A-blueprint-v2-schema.ts>

## Public generation API

`generateWooCommerceBlueprint()` will generate Blueprint v2 by default.

The generator options become a discriminated v1/v2 union:

- Omitting `blueprintVersion`, or setting it to `2`, selects v2 and accepts v2
  `additionalSteps`.
- Setting `blueprintVersion: 1` selects v1 and accepts the existing v1
  `additionalSteps`.
- Overloads return `BlueprintV2` for the default/v2 form and `BlueprintV1` for
  the explicit v1 form.

The package will export explicit `BlueprintV1`, `BlueprintV2`,
`BlueprintV1Step`, and `BlueprintV2Step` types. `Blueprint` will be the union
used where either version is accepted. Existing consumers that require v1
output can retain the old behavior by adding `blueprintVersion: 1`.

Shared WooCommerce values and PHP source strings remain shared implementation
details. Each format receives a native generator rather than converting one
format into the other.

## Blueprint v2 output

The default generated document will use these native v2 fields:

- `version: 2` and the existing official schema URL.
- `phpVersion` and `wordpressVersion` for runtime selection.
- `applicationOptions["wordpress-playground"]` for `landingPage`, `login`, and
  `networkAccess`.
- `plugins` for WooCommerce and additional WordPress.org plugin slugs. V2
  activates plugins by default, eliminating standalone activation steps.
- `siteOptions` for the site title, pretty permalink structure, and all
  WooCommerce settings.
- Inline `muPlugins` data references for debug configuration and development
  helpers. This replaces v1 `mkdir` and `writeFile` setup steps.
- `additionalStepsAfterExecution` for WooCommerce database setup, sample or
  cloned product creation, and caller-supplied v2 steps. Inline PHP will use v2
  file data references rather than raw v1 code strings.

The v2 generator will preserve the functional result of the v1 generator:
WooCommerce is active, settings and development helpers are applied, products
are created, login and landing behavior remain enabled, and network access is
available for downloads.

The checked-in `blueprint.json` will be regenerated as v2.

## Blueprint v1 support

The v1 generator will retain the existing output and ordering, including
`preferredVersions`, `features.networking`, `phpExtensionBundles`, v1 plugin
installation with `options.activate: true`, and `steps`.

No standalone `activatePlugin` step will be introduced in either format.

## CLI version selection and custom Blueprint auto-detection

The CLI will accept a wc-now-owned `--blueprint-version=1|2` option and will not
forward it to Playground.

Selection rules:

1. With no custom file, default to v2 unless `--blueprint-version=1` is given.
2. With a custom file whose `version` is exactly `2`, generate a v2 base.
3. With a custom file that has no `version`, treat it as v1 and generate a v1
   base. This preserves existing custom files automatically.
4. Reject any other `version` value with a clear unsupported-version error.
5. If an explicit CLI version conflicts with the detected custom file version,
   reject it instead of coercing or cross-merging formats.

Version detection and merging will live in a focused Blueprint module rather
than the process-oriented CLI entrypoint, allowing direct unit tests.

V1 merging retains the existing behavior: selected scalar fields override,
objects shallow-merge, resource arrays concatenate, and custom steps append.

V2 merging follows the same intent with v2 fields:

- `phpVersion`, `wordpressVersion`, `siteLanguage`, `activeTheme`, and
  `blueprintMeta` from the custom Blueprint override the defaults when present.
- `applicationOptions["wordpress-playground"]`, `siteOptions`, and `constants`
  shallow-merge with custom values winning.
- `plugins`, `themes`, `muPlugins`, `content`, `media`, `users`, and `roles`
  concatenate in base-then-custom order.
- `additionalStepsAfterExecution` append in base-then-custom order.
- Other supported custom v2 fields, including `postTypes` and `fonts`, are
  preserved and shallow-merged where both documents define maps.

## Related fixes

- Remove the unused `mounts` array and its writes from the CLI. Every
  `--mount=` argument continues to be appended unchanged to `playgroundArgs`.
- Correct Store API base URL normalization from the impossible
  `/\/$core/` expression to `/\/$/`, removing one trailing slash before API
  paths are appended.
- Convert `examples/custom-blueprint.json` to a v2 example using declarative
  `plugins`. This removes its discouraged standalone `activatePlugin` step.
- Preserve the dependency caret policy with `@wp-playground/cli: ^3.1.45` and
  update the lockfile to resolve `3.1.45`.

## Documentation

The README will document:

- Node.js `>=20.18.0` and Playground `3.1.45` compatibility.
- Blueprint v2 as the default and `--blueprint-version=1` as the v1 opt-in.
- Automatic detection of custom v1 and v2 files, including mismatch errors.
- V1 and v2 merge semantics.
- A v2 custom Blueprint example without standalone activation.
- V2 programmatic output and the discriminated `blueprintVersion`/
  `additionalSteps` options.
- The v2 declarative equivalents used for plugins, options, mu-plugins, and
  post-execution steps.

CLI help text will include the new version option and use the canonical
`--auto-mount` spelling while retaining the existing `--autoMount` alias for
compatibility.

## Error handling

- Invalid CLI Blueprint versions fail before a temporary Blueprint is written.
- Malformed or unsupported custom `version` values report the received value.
- Explicit/detected version mismatches name both versions and explain how to
  resolve the conflict.
- Only same-version documents reach the merge functions.
- Existing fallback behavior for Store API failures remains unchanged.

## Testing and verification

Test-driven changes will add regression coverage for:

- Default v2 generation and its native fields.
- Explicit v1 generation and its existing activation behavior.
- Version detection for v1, v2, and unsupported values.
- Same-version v1 and v2 merge behavior and mismatch rejection.
- CLI version flag handling and custom-file auto-detection.
- Mount pass-through behavior after removing dead collection state.
- Store API URL construction with and without a trailing slash.
- The v2 custom example containing no standalone activation step.

Final verification will run formatting/lint checks, unit and smoke tests,
TypeScript typechecking, the production build and checked-in Blueprint
generation, and the real Playground integration suite. The integration suite
must boot the default v2 WooCommerce environment and an auto-detected custom v1
environment, proving both the new default and backward-compatible path.

## Non-goals

- Converting arbitrary third-party Blueprints between v1 and v2.
- Supporting future Blueprint version numbers before Playground publishes
  them.
- Migrating the project to Playground's internal Blueprint compiler APIs.
- Broad refactoring of product generation or unrelated dependencies.
