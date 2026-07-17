import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	generateWooCommerceBlueprint,
	transformWooCommerceProducts,
	type ProductImport,
} from "./generator";
import { mergeBlueprints, resolveBlueprintVersion } from "./merge";
import type { Blueprint, BlueprintVersion } from "./types";
import { WCStoreApiClient } from "../wc-public-api";

export interface ResolveWooBlueprintOptions {
	/** Path to a custom blueprint JSON to merge with the WooCommerce defaults. */
	customBlueprintPath?: string;
	/** Clone up to 10 products from this store's Store API. */
	sourceUrl?: string;
	siteName?: string;
	php?: string;
	wp?: string;
	/** Explicit generated Blueprint version; custom files are auto-detected. */
	requestedBlueprintVersion?: BlueprintVersion;
	/** Optional progress logger (defaults to silent). */
	log?: (message: string) => void;
}

/**
 * Build the WooCommerce blueprint exactly as `start`/`server` do: generate the
 * defaults in the resolved version, optionally clone products from a source
 * store, then merge a custom blueprint on top. Shared by the CLI's foreground
 * commands and the instance-lifecycle `up` command so both compose identically.
 */
export async function resolveWooBlueprint(
	options: ResolveWooBlueprintOptions,
): Promise<Blueprint> {
	const {
		customBlueprintPath,
		sourceUrl,
		siteName = "My WooCommerce Store",
		php = "8.0",
		wp = "latest",
		requestedBlueprintVersion,
		log = () => {},
	} = options;

	let customBlueprint: Blueprint | undefined;
	if (customBlueprintPath) {
		const resolvedPath = resolve(customBlueprintPath);
		if (!existsSync(resolvedPath)) {
			throw new Error(`Blueprint file not found: ${customBlueprintPath}`);
		}
		customBlueprint = JSON.parse(readFileSync(resolvedPath, "utf-8")) as Blueprint;
	}

	const blueprintVersion = resolveBlueprintVersion(
		customBlueprint,
		requestedBlueprintVersion,
	);
	const generate = (products: ProductImport[] = []): Blueprint =>
		blueprintVersion === 1
			? generateWooCommerceBlueprint({
					blueprintVersion: 1,
					siteName,
					products,
					php,
					wp,
				})
			: generateWooCommerceBlueprint({
					blueprintVersion: 2,
					siteName,
					products,
					php,
					wp,
				});

	let blueprint = generate();

	if (sourceUrl) {
		log(`🔍 Fetching products from ${sourceUrl}...`);
		try {
			const wcApi = new WCStoreApiClient(sourceUrl);
			const response = await wcApi.getProducts({ per_page: 10 });
			if (response.data && response.data.length > 0) {
				const products = transformWooCommerceProducts(response.data);
				log(`✅ Found ${products.length} products to import`);
				blueprint = generate(products);
			} else {
				log("⚠️  No products found, using default sample data");
			}
		} catch (error) {
			log(
				`⚠️  Failed to fetch products: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			log("Using default sample data instead");
		}
	}

	if (customBlueprint && customBlueprintPath) {
		log(`📄 Merging custom blueprint from ${customBlueprintPath}...`);
		blueprint = mergeBlueprints(blueprint, customBlueprint);
	}

	return blueprint;
}
