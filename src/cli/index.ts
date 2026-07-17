import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { resolveWooBlueprint } from "../blueprint/resolve";
import type { Blueprint, BlueprintVersion } from "../blueprint/types";
import { INSTANCE_COMMANDS, runInstanceCommand } from "../instances/manager";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);

// Lifecycle sub-commands own their own arg handling; don't let the top-level
// --help block swallow e.g. `wc-now up --help`.
const isLifecycleCommand =
	args[0] !== undefined && INSTANCE_COMMANDS.includes(args[0]);

// Check if user wants help
if (!isLifecycleCommand && (args.includes("--help") || args.includes("-h"))) {
	console.log(`
wc-now - WordPress Playground with WooCommerce defaults

Usage: npx wc-now [command] [options]

Commands:
  start               Start a WordPress server with WooCommerce (default, recommended)
  server              Start a WordPress server with WooCommerce (advanced, low-level)
  build-snapshot      Build a snapshot of WordPress with WooCommerce
  run-blueprint       Run a blueprint

Instance lifecycle (named, backgrounded, managed instances):
  up --name <slug>    Background-boot a named instance; returns once it is ready
  list                Show name → port → status → URL for all instances
  stop <name>         Stop an instance (ephemeral: removes site + registry entry)
  logs <name> [-f]    Tail the instance's debug.log ([-n N] lines)
  exec <name>         Run PHP inside the live instance (--code '<php>' | --file f.php)
  reset <name>        Wipe the instance's site dir for a clean next boot
  prune               Reap dead ephemeral instances and orphaned workspaces
  port <name>         Print the deterministic port for a name

up options: --port <n> --persist|--ephemeral --php <v> --wp <v> --blueprint <f>
            --source-url <url> --site-name <name> --mount host:vfs --wait <secs>

Additional Options:
  --blueprint=<path>     Path to a custom blueprint.json to merge with defaults
  --source-url=<url>     URL of a WooCommerce store to clone products from
  --site-name=<name>     Name for the WooCommerce store (default: "My WooCommerce Store")
  --port=<number>        Port to run the server on (default: 9400)
  --php=<version>        PHP version to use (default: 8.0)
  --wp=<version>         WordPress version to use (default: latest)
  --blueprint-version=<1|2>  Generated Blueprint version (default: 2; custom files auto-detected)
  --mount=<paths>        Mount directories (format: /host/path:/vfs/path)
  --auto-mount           Automatically mount the current directory as a plugin/theme

All other options are passed through to wp-playground.

Examples:
  npx wc-now start
  npx wc-now start --blueprint=custom.json
  npx wc-now start --source-url=https://example-store.com
  npx wc-now start --wp=6.4 --php=8.0
  npx wc-now start --mount=/local/plugin:/wordpress/wp-content/plugins/my-plugin

  # Run from within a plugin directory:
  cd my-plugin && npx wc-now start --auto-mount
`);
	process.exit(0);
}

async function main() {
	try {
		// Extract command (default to 'start' if not provided)
		let command = "start";
		const firstArg = args[0];
		if (firstArg && !firstArg.startsWith("--")) {
			if (
				["start", "server", "build-snapshot", "run-blueprint"].includes(
					firstArg,
				)
			) {
				command = firstArg;
				args.shift(); // Remove command from args
			}
		}

		// Extract our custom arguments
		let customBlueprintPath: string | undefined;
		let sourceUrl: string | undefined;
		let siteName = "My WooCommerce Store";
		let port = 9400;
		let phpVersion = "8.0";
		let wpVersion = "latest";
		let autoMount = false;
		let requestedBlueprintVersion: BlueprintVersion | undefined;

		const playgroundArgs: string[] = [command];

		for (let i = 0; i < args.length; i++) {
			const arg = args[i];

			if (arg.startsWith("--blueprint=")) {
				customBlueprintPath = arg.split("=")[1];
			} else if (arg.startsWith("--source-url=")) {
				sourceUrl = arg.split("=")[1];
			} else if (arg.startsWith("--site-name=")) {
				siteName = arg.split("=")[1];
			} else if (arg.startsWith("--port=")) {
				port = Number.parseInt(arg.split("=")[1], 10);
				playgroundArgs.push(arg);
			} else if (arg.startsWith("--php=")) {
				phpVersion = arg.split("=")[1];
				playgroundArgs.push(arg);
			} else if (arg.startsWith("--wp=")) {
				wpVersion = arg.split("=")[1];
				playgroundArgs.push(arg);
			} else if (arg.startsWith("--blueprint-version=")) {
				const value = arg.split("=")[1];
				if (value !== "1" && value !== "2") {
					throw new Error(
						`Blueprint version must be 1 or 2; received ${value}`,
					);
				}
				requestedBlueprintVersion = Number(value) as BlueprintVersion;
			} else if (arg.startsWith("--mount=")) {
				playgroundArgs.push(arg);
			} else if (arg === "--autoMount" || arg === "--auto-mount") {
				autoMount = true;
				// Forward the flag the WordPress Playground CLI actually
				// recognizes (kebab-case `--auto-mount`). `start` already
				// auto-mounts the current directory by default, but passing it
				// explicitly is harmless there and is what makes `server`
				// (low-level, no auto-mount by default) mount the cwd as intended.
				playgroundArgs.push("--auto-mount");
			} else {
				playgroundArgs.push(arg);
			}
		}

		// Build the WooCommerce blueprint (generate defaults, optionally clone
		// products, merge a custom blueprint) using the same shared resolver the
		// `up` lifecycle command uses, so both compose identically.
		let blueprint: Blueprint;
		try {
			blueprint = await resolveWooBlueprint({
				customBlueprintPath,
				sourceUrl,
				siteName,
				php: phpVersion,
				wp: wpVersion,
				requestedBlueprintVersion,
				log: console.log,
			});
		} catch (error) {
			console.error(`❌ ${error instanceof Error ? error.message : error}`);
			process.exit(1);
		}

		// Create a temporary blueprint file
		const tempBlueprintPath = join(
			tmpdir(),
			`wp-wc-blueprint-${randomBytes(8).toString("hex")}.json`,
		);
		writeFileSync(tempBlueprintPath, JSON.stringify(blueprint, null, 2));

		// Add the blueprint argument to wp-playground
		playgroundArgs.push(`--blueprint=${tempBlueprintPath}`);

		// Add default port if running start/server and not already specified
		if (
			(command === "start" || command === "server") &&
			!args.some((arg) => arg.startsWith("--port"))
		) {
			playgroundArgs.push(`--port=${port}`);
		}

		// If autoMount is enabled, show a helpful message
		if (autoMount) {
			console.log("🔧 Auto-mounting current directory...");
			const cwd = process.cwd();
			const cwdName = cwd.split("/").pop();
			console.log(`📁 Detected directory: ${cwdName}`);
		}

		console.log(
			"🚀 Starting WordPress Playground with WooCommerce defaults...\n",
		);

		// Resolve the locally installed @wp-playground/cli binary
		// This avoids npx downloading a different version at runtime
		const playgroundPkgUrl = import.meta.resolve(
			"@wp-playground/cli/package.json",
		);
		const playgroundCliPath = join(
			dirname(fileURLToPath(playgroundPkgUrl)),
			"wp-playground.js",
		);

		// Spawn wp-playground with our arguments
		const child = spawn(
			process.execPath,
			[playgroundCliPath, ...playgroundArgs],
			{
				stdio: "inherit",
			},
		);

		// Clean up on exit
		child.on("exit", async (code) => {
			try {
				if (existsSync(tempBlueprintPath)) {
					const { unlinkSync } = await import("node:fs");
					unlinkSync(tempBlueprintPath);
				}
			} catch (e) {
				// Ignore cleanup errors
			}
			process.exit(code || 0);
		});

		// Handle signals
		process.on("SIGINT", () => {
			child.kill("SIGINT");
		});

		process.on("SIGTERM", () => {
			child.kill("SIGTERM");
		});
	} catch (error) {
		console.error("❌ Error:", error);
		process.exit(1);
	}
}

// Run the CLI: dispatch instance-lifecycle sub-commands to the manager,
// otherwise fall through to the foreground start/server pipeline.
if (isLifecycleCommand) {
	runInstanceCommand(args[0], args.slice(1)).catch((error) => {
		console.error(`wc-now: ${error instanceof Error ? error.message : error}`);
		process.exit(1);
	});
} else {
	main().catch(console.error);
}
