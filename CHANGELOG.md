# wc-now

## 1.0.0

### Major Changes

- Upgrade WordPress Playground to 3.1.45 and generate native Blueprint v2 by default using the official v2 schema types. Blueprint v1 remains available with `blueprintVersion: 1`, and custom Blueprint files are auto-detected by version. Also fix Store API trailing-slash URLs, preserve mount forwarding while removing dead CLI state, and modernize the custom Blueprint example. ([`832cb7a`](https://github.com/multiplehats/wc-now/commit/832cb7a9b1d8e6e09e08c64d67b044fc48f5bfa0))

### Patch Changes

- Fix `--autoMount`: forward the `--auto-mount` flag that the WordPress Playground CLI actually recognizes (kebab-case). Previously `wc-now server --autoMount` passed an unrecognized `--autoMount` flag downstream and mounted nothing. Also correct the package `description` and keywords, which still referenced `wp-now` instead of the WordPress Playground CLI. ([`6441432`](https://github.com/multiplehats/wc-now/commit/64414326a488731f589db5374d450af4e7227776))

## 0.2.2

### Patch Changes

- Fix blueprint aborting on startup with `Could not unlink "/tmp/playground-activate-plugin.log"`. ([#1](https://github.com/multiplehats/wc-now/pull/1))

  The default blueprint activated WooCommerce (and any additional plugins) with a standalone `activatePlugin` step. In `@wp-playground/cli` v3 that step unconditionally unlinks a log file under `/tmp`, which may not exist in the Playground VFS, aborting the whole run before the server ever starts. Activation now rides on `installPlugin`'s `activate: true` option, which performs the same activation without that fragile cleanup.
