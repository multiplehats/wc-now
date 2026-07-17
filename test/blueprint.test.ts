import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateBlueprintDeclaration } from "@wp-playground/blueprints";
import {
	generateWooCommerceBlueprint,
	transformWooCommerceProducts,
} from "../src/blueprint/generator";
import type { PublicWooCommerceProduct } from "../src/wc-public-api";

describe("Blueprint Generator", () => {
	it("generates a native Blueprint v2 by default", () => {
		const blueprint = generateWooCommerceBlueprint();

		expect(blueprint.version).toBe(2);
		expect(blueprint.$schema).toBe(
			"https://playground.wordpress.net/blueprint-schema.json",
		);
		expect(blueprint.phpVersion).toBe("8.0");
		expect(blueprint.wordpressVersion).toBe("latest");
		expect(blueprint.applicationOptions?.["wordpress-playground"]).toEqual({
			landingPage: "/wp-admin/",
			login: true,
			networkAccess: true,
		});
		expect(blueprint.plugins).toContain("woocommerce");
		expect(blueprint.siteOptions?.blogname).toBe("My WooCommerce Store");
		expect(blueprint.siteOptions?.permalink_structure).toBe("/%postname%/");
		expect(blueprint.muPlugins).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ filename: "debug-config.php" }),
				expect.objectContaining({ filename: "playground-helpers.php" }),
			]),
		);
		expect(
			blueprint.additionalStepsAfterExecution?.some(
				(step) => step.step === "runPHP",
			),
		).toBe(true);
		expect("steps" in blueprint).toBe(false);
	});

	it("conforms to the official Blueprint v2 schema", async () => {
		const validation = await validateBlueprintDeclaration(
			generateWooCommerceBlueprint(),
		);

		expect(validation).toEqual({ valid: true });
	});

	it("generates the native v1 format when explicitly requested", () => {
		// Regression: the standalone `activatePlugin` step in @wp-playground/cli
		// v3 unconditionally unlinks a log under /tmp that may not exist in the
		// Playground VFS, aborting the whole blueprint with
		// `Could not unlink "/tmp/playground-activate-plugin.log"`. Activation
		// must ride on installPlugin's `activate` option instead.
		const blueprint = generateWooCommerceBlueprint({
			blueprintVersion: 1,
			additionalPlugins: ["akismet"],
		});

		expect("version" in blueprint).toBe(false);
		expect(blueprint.preferredVersions).toEqual({
			php: "8.0",
			wp: "latest",
		});
		expect(blueprint.features?.networking).toBe(true);
		expect(blueprint.phpExtensionBundles).toContain("kitchen-sink");

		const activateSteps = blueprint.steps?.filter(
			(step) => step.step === "activatePlugin",
		);
		expect(activateSteps).toHaveLength(0);

		const wcPlugin = blueprint.steps?.find(
			(step) =>
				step.step === "installPlugin" &&
				"pluginData" in step &&
				step.pluginData?.slug === "woocommerce",
		);
		const akismetPlugin = blueprint.steps?.find(
			(step) =>
				step.step === "installPlugin" &&
				"pluginData" in step &&
				step.pluginData?.slug === "akismet",
		);
		expect(
			wcPlugin && "options" in wcPlugin && wcPlugin.options?.activate,
		).toBe(true);
		expect(
			akismetPlugin &&
				"options" in akismetPlugin &&
				akismetPlugin.options?.activate,
		).toBe(true);
	});

	it("maps custom options and v2 steps into native v2 fields", () => {
		const extraStep = {
			step: "runPHP" as const,
			code: { filename: "extra.php", content: "<?php echo 'extra';" },
		};
		const blueprint = generateWooCommerceBlueprint({
			siteName: "Test Store",
			php: "8.3",
			wp: "6.8",
			additionalPlugins: ["akismet"],
			landingPage: "/shop/",
			additionalSteps: [extraStep],
		});

		expect(blueprint.phpVersion).toBe("8.3");
		expect(blueprint.wordpressVersion).toBe("6.8");
		expect(
			blueprint.applicationOptions?.["wordpress-playground"].landingPage,
		).toBe("/shop/");
		expect(blueprint.plugins).toEqual(["woocommerce", "akismet"]);
		expect(blueprint.siteOptions?.blogname).toBe("Test Store");
		expect(blueprint.additionalStepsAfterExecution).toContain(extraStep);
	});

	it("activates v2 plugins declaratively without standalone steps", () => {
		const blueprint = generateWooCommerceBlueprint({
			additionalPlugins: ["akismet"],
		});

		expect(blueprint.plugins).toEqual(["woocommerce", "akismet"]);
		expect(
			blueprint.additionalStepsAfterExecution?.filter(
				(step) => step.step === "activatePlugin",
			),
		).toHaveLength(0);
	});

	it("includes product import PHP when products are provided", () => {
		const products = [
			{
				name: "Test Product",
				description: "A test product",
				short_description: "Test",
				price: "10.00",
				regular_price: "10.00",
				sale_price: "",
				sku: "TEST-001",
				stock_status: "instock",
				categories: ["Test Category"],
				images: ["https://example.com/image.jpg"],
				attributes: [],
				variations: [],
			},
		];

		const blueprint = generateWooCommerceBlueprint({ products });
		const importProductsStep = blueprint.additionalStepsAfterExecution?.find(
			(step) =>
				step.step === "runPHP" &&
				typeof step.code === "object" &&
				step.code.filename === "import-products.php",
		);
		expect(importProductsStep).toBeDefined();
	});

	it("keeps the custom example on v2 without standalone plugin activation", () => {
		const example = JSON.parse(
			readFileSync(
				new URL("../examples/custom-blueprint.json", import.meta.url),
				"utf8",
			),
		);

		expect(example.version).toBe(2);
		expect(example.plugins).toContain("productbird");
		expect(example.additionalStepsAfterExecution ?? []).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ step: "activatePlugin" }),
			]),
		);
	});

	it("should transform WooCommerce API products correctly", () => {
		const apiProducts: Partial<PublicWooCommerceProduct>[] = [
			{
				id: 1,
				name: "API Product",
				slug: "api-product",
				permalink: "https://example.com/product/api-product",
				description: "<p>Product description</p>",
				short_description: "Short desc",
				sku: "API-001",
				prices: {
					price: "2000",
					regular_price: "2500",
					sale_price: "2000",
					price_range: null,
					currency_code: "USD",
					currency_symbol: "$",
					currency_minor_unit: 2,
					currency_decimal_separator: ".",
					currency_thousand_separator: ",",
					currency_prefix: "$",
					currency_suffix: "",
				},
				is_in_stock: true,
				categories: [
					{
						id: 1,
						name: "Electronics",
						slug: "electronics",
						link: "https://example.com/category/electronics",
					},
				],
				images: [
					{
						id: 1,
						src: "https://example.com/image1.jpg",
						thumbnail: "https://example.com/thumb1.jpg",
						srcset: "",
						sizes: "",
						name: "image1",
						alt: "Product image",
					},
				],
				attributes: [],
				variations: [],
			},
		];

		const transformed = transformWooCommerceProducts(
			apiProducts as PublicWooCommerceProduct[],
		);

		expect(transformed).toHaveLength(1);
		expect(transformed[0]).toEqual({
			name: "API Product",
			description: "<p>Product description</p>",
			short_description: "Short desc",
			price: "2000",
			regular_price: "2500",
			sale_price: "2000",
			sku: "API-001",
			stock_status: "instock",
			categories: ["Electronics"],
			images: ["https://example.com/image1.jpg"],
			attributes: [],
			variations: [],
		});
	});
});
