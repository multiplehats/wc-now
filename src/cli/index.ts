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
} from "../blueprint/generator";
import { WCStoreApiClient } from "../wc-public-api";
import type { Blueprint } from "../blueprint/types";

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
  server              Start a WordPress server with WooCommerce (default)
  build-snapshot      Build a snapshot of WordPress with WooCommerce
  run-blueprint       Run a blueprint

Additional Options:
  --blueprint=<path>     Path to a custom blueprint.json to merge with defaults
  --source-url=<url>     URL of a WooCommerce store to clone products from
  --site-name=<name>     Name for the WooCommerce store (default: "My WooCommerce Store")
  --port=<number>        Port to run the server on (default: 9400)
  --php=<version>        PHP version to use (default: 8.0)
  --wp=<version>         WordPress version to use (default: latest)
  --mount=<paths>        Mount directories (format: /host/path:/vfs/path)
  --autoMount            Automatically mount the current directory as a plugin/theme

All other options are passed through to wp-playground.

Examples:
  npx wc-now server
  npx wc-now server --blueprint=custom.json
  npx wc-now server --source-url=https://example-store.com
  npx wc-now server --wp=6.4 --php=8.0
  npx wc-now server --mount=/local/plugin:/wordpress/wp-content/plugins/my-plugin

  # Run from within a plugin directory:
  cd my-plugin && npx wc-now server --autoMount
`);
	process.exit(0);
}

async function main() {
	try {
		// Extract command (default to 'server' if not provided)
		let command = "server";
		const firstArg = args[0];
		if (firstArg && !firstArg.startsWith("--")) {
			if (["server", "build-snapshot", "run-blueprint"].includes(firstArg)) {
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
		const mounts: string[] = [];

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
			} else if (arg.startsWith("--mount=")) {
				mounts.push(arg.split("=")[1]);
				playgroundArgs.push(arg);
			} else if (arg === "--autoMount" || arg === "--auto-mount") {
				autoMount = true;
				// Pass it through to wp-playground
				playgroundArgs.push("--autoMount");
			} else {
				playgroundArgs.push(arg);
			}
		}

		// Generate our default blueprint
		let blueprint = generateWooCommerceBlueprint({
			siteName,
			php: phpVersion,
			wp: wpVersion,
		});

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
					blueprint = generateWooCommerceBlueprint({
						siteName,
						products,
						php: phpVersion,
						wp: wpVersion,
					});
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
		if (customBlueprintPath) {
			const resolvedPath = resolve(customBlueprintPath);
			if (!existsSync(resolvedPath)) {
				console.error(`❌ Blueprint file not found: ${customBlueprintPath}`);
				process.exit(1);
			}

			console.log(`📄 Merging custom blueprint from ${customBlueprintPath}...`);
			const customBlueprint: Blueprint = JSON.parse(
				readFileSync(resolvedPath, "utf-8"),
			);

			// Merge blueprints (custom overrides defaults)
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

		// Add default port if running server and not already specified
		if (command === "server" && !args.some((arg) => arg.startsWith("--port"))) {
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

		// Spawn wp-playground with our arguments
		const child = spawn("npx", ["@wp-playground/cli", ...playgroundArgs], {
			stdio: "inherit",
			shell: true,
		});

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

// Helper function to merge blueprints
function mergeBlueprints(base: Blueprint, custom: Blueprint): Blueprint {
	const merged: Blueprint = { ...base };

	// Simple merge for top-level properties
	if (custom.$schema) merged.$schema = custom.$schema;
	if (custom.landingPage) merged.landingPage = custom.landingPage;

	// Merge preferredVersions
	if (custom.preferredVersions) {
		merged.preferredVersions = {
			...base.preferredVersions,
			...custom.preferredVersions,
		};
	}

	// Merge phpExtensionBundles
	if (custom.phpExtensionBundles) {
		merged.phpExtensionBundles = [
			...(base.phpExtensionBundles || []),
			...custom.phpExtensionBundles,
		].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
	}

	// Merge features
	if (custom.features) {
		merged.features = {
			...base.features,
			...custom.features,
		};
	}

	// Override login
	if (custom.login !== undefined) {
		merged.login = custom.login;
	}

	// Merge plugins
	if (custom.plugins) {
		merged.plugins = [...(base.plugins || []), ...custom.plugins];
	}

	// Merge themes
	if (custom.themes) {
		merged.themes = [...(base.themes || []), ...custom.themes];
	}

	// Merge siteOptions
	if (custom.siteOptions) {
		merged.siteOptions = {
			...base.siteOptions,
			...custom.siteOptions,
		};
	}

	// Merge constants
	if (custom.constants) {
		merged.constants = {
			...base.constants,
			...custom.constants,
		};
	}

	// Append steps
	if (custom.steps) {
		merged.steps = [...(base.steps || []), ...custom.steps];
	}

	return merged;
}

// Run the CLI
main().catch(console.error);
