---
"wc-now": patch
---

Fix `--autoMount`: forward the `--auto-mount` flag that the WordPress Playground CLI actually recognizes (kebab-case). Previously `wc-now server --autoMount` passed an unrecognized `--autoMount` flag downstream and mounted nothing. Also correct the package `description` and keywords, which still referenced `wp-now` instead of the WordPress Playground CLI.
