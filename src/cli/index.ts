import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
	generateWooCommerceBlueprint,
	transformWooCommerceProducts,
	type ProductImport,
} from "../blueprint/generator";
import { mergeBlueprints, resolveBlueprintVersion } from "../blueprint/merge";
import { WCStoreApiClient } from "../wc-public-api";
import type { Blueprint, BlueprintVersion } from "../blueprint/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);

// Check if user wants help
if (args.includes("--help") || args.includes("-h")) {
	console.log(`
wc-now - WordPress Playground with WooCommerce defaults

Usage: npx wc-now [command] [options]

Commands:
  start               Start a WordPress server with WooCommerce (default, recommended)
  server              Start a WordPress server with WooCommerce (advanced, low-level)
  build-snapshot      Build a snapshot of WordPress with WooCommerce
  run-blueprint       Run a blueprint

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

		let customBlueprint: Blueprint | undefined;
		if (customBlueprintPath) {
			const resolvedPath = resolve(customBlueprintPath);
			if (!existsSync(resolvedPath)) {
				console.error(`❌ Blueprint file not found: ${customBlueprintPath}`);
				process.exit(1);
			}
			customBlueprint = JSON.parse(readFileSync(resolvedPath, "utf-8"));
		}

		const blueprintVersion = resolveBlueprintVersion(
			customBlueprint,
			requestedBlueprintVersion,
		);
		const generateBlueprint = (products: ProductImport[] = []) =>
			blueprintVersion === 1
				? generateWooCommerceBlueprint({
						blueprintVersion: 1,
						siteName,
						products,
						php: phpVersion,
						wp: wpVersion,
					})
				: generateWooCommerceBlueprint({
						blueprintVersion: 2,
						siteName,
						products,
						php: phpVersion,
						wp: wpVersion,
					});

		// Generate our default blueprint in the selected format.
		let blueprint: Blueprint = generateBlueprint();

		// If source URL is provided, fetch products
		if (sourceUrl) {
			console.log(`🔍 Fetching products from ${sourceUrl}...`);
			try {
				const wcApi = new WCStoreApiClient(sourceUrl);
				const response = await wcApi.getProducts({ per_page: 10 });

				if (response.data && response.data.length > 0) {
					const products = transformWooCommerceProducts(response.data);
					console.log(`✅ Found ${products.length} products to import`);

					// Regenerate blueprint with products
					blueprint = generateBlueprint(products);
				} else {
					console.log("⚠️  No products found, using default sample data");
				}
			} catch (error) {
				console.error(
					"⚠️  Failed to fetch products:",
					error instanceof Error ? error.message : error,
				);
				console.log("Using default sample data instead");
			}
		}

		// If custom blueprint is provided, merge it
		if (customBlueprint && customBlueprintPath) {
			console.log(`📄 Merging custom blueprint from ${customBlueprintPath}...`);
			blueprint = mergeBlueprints(blueprint, customBlueprint);
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

// Run the CLI
main().catch(console.error);
