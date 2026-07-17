---
"wc-now": minor
---

Add named-instance lifecycle commands: `up`, `list`, `stop`, `logs`, `exec`, `reset`, `prune`, and `port`.

Where `start`/`server` run a single playground in the foreground, `up` background-spawns a named, managed instance and only returns once a readiness gate passes. Each instance gets a deterministic name→port (with a free-port fallback), an isolated per-instance site directory, a mounted `debug.log` you can `logs -f`, and a token-guarded loopback endpoint that `exec` uses to run PHP inside the live process. `up` composes with the existing WooCommerce blueprint generation and `--blueprint` merge exactly as `start` does, so `wc-now up --name x` gives a named, persistent (or ephemeral) WooCommerce instance.

- `up --name <slug>` — `--port`, `--persist`/`--ephemeral` (ephemeral default), plus the usual `--php`/`--wp`/`--blueprint`/`--source-url`/`--site-name`/`--mount` boot flags.
- `list` — name → port → status → URL table.
- `stop <name>` — SIGTERM→SIGKILL; ephemeral removes the site dir and registry entry, persist keeps them.
- `logs <name> [-f] [-n N]` — tail the instance's `debug.log`.
- `exec <name> (--code '<php>' | --file f.php)` — run PHP inside the live instance.
- `reset <name>` — wipe the instance's site dir.
- `prune` — reap dead ephemeral instances and instances whose mounted workspace has vanished.
