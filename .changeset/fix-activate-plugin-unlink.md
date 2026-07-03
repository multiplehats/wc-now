---
"wc-now": patch
---

Fix blueprint aborting on startup with `Could not unlink "/tmp/playground-activate-plugin.log"`.

The default blueprint activated WooCommerce (and any additional plugins) with a standalone `activatePlugin` step. In `@wp-playground/cli` v3 that step unconditionally unlinks a log file under `/tmp`, which may not exist in the Playground VFS, aborting the whole run before the server ever starts. Activation now rides on `installPlugin`'s `activate: true` option, which performs the same activation without that fragile cleanup.
