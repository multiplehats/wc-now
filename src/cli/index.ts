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

Usage: npx wc-now [wp-now-command] [options]

Additional Options:
  --blueprint=<path>     Path to a custom blueprint.json to merge with defaults
  --source-url=<url>     URL of a WooCommerce store to clone products from
  --site-name=<name>     Name for the WooCommerce store (default: "My WooCommerce Store")

All other options are passed through to wp-now.

Examples:
  npx wc-now start
  npx wc-now start --blueprint=custom.json
  npx wc-now start --source-url=https://example-store.com
  npx wc-now start --wp=6.4 --php=8.0
`);
	process.exit(0);
}

async function main() {
	try {
		// Extract our custom arguments
		let customBlueprintPath: string | undefined;
		let sourceUrl: string | undefined;
		let siteName = "My WooCommerce Store";

		const wpNowArgs: string[] = [];

		for (let i = 0; i < args.length; i++) {
			const arg = args[i];

			if (arg.startsWith("--blueprint=")) {
				customBlueprintPath = arg.split("=")[1];
			} else if (arg.startsWith("--source-url=")) {
				sourceUrl = arg.split("=")[1];
			} else if (arg.startsWith("--site-name=")) {
				siteName = arg.split("=")[1];
			} else {
				wpNowArgs.push(arg);
			}
		}

		// Generate our default blueprint
		let blueprint = generateWooCommerceBlueprint({ siteName });

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
						php: extractVersionArg(wpNowArgs, "--php"),
						wp: extractVersionArg(wpNowArgs, "--wp"),
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

		// Add the blueprint argument to wp-now
		wpNowArgs.push(`--blueprint=${tempBlueprintPath}`);

		console.log("🚀 Starting wp-now with WooCommerce defaults...\n");

		// Spawn wp-now with our arguments
		const child = spawn("npx", ["@wp-now/wp-now", ...wpNowArgs], {
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

// Helper function to extract version arguments
function extractVersionArg(args: string[], prefix: string): string | undefined {
	const arg = args.find((a) => a.startsWith(prefix));
	return arg ? arg.split("=")[1] : undefined;
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
