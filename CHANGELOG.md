# wc-now

## 0.2.2

### Patch Changes

- Fix blueprint aborting on startup with `Could not unlink "/tmp/playground-activate-plugin.log"`. ([#1](https://github.com/multiplehats/wc-now/pull/1))

  The default blueprint activated WooCommerce (and any additional plugins) with a standalone `activatePlugin` step. In `@wp-playground/cli` v3 that step unconditionally unlinks a log file under `/tmp`, which may not exist in the Playground VFS, aborting the whole run before the server ever starts. Activation now rides on `installPlugin`'s `activate: true` option, which performs the same activation without that fragile cleanup.
