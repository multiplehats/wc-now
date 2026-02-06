import { describe, it, expect } from "vitest";
import {
	generateWooCommerceBlueprint,
	transformWooCommerceProducts,
} from "../src/blueprint/generator";
import type { PublicWooCommerceProduct } from "../src/wc-public-api";

describe("Blueprint Generator", () => {
	it("should generate a default WooCommerce blueprint", () => {
		const blueprint = generateWooCommerceBlueprint();

		expect(blueprint.$schema).toBe(
			"https://playground.wordpress.net/blueprint-schema.json",
		);
		expect(blueprint.landingPage).toBe("/wp-admin/");
		expect(blueprint.preferredVersions?.php).toBe("8.0");
		expect(blueprint.preferredVersions?.wp).toBe("latest");
		expect(blueprint.features?.networking).toBe(true);

		// Check for WooCommerce plugin
		const wcPlugin = blueprint.steps?.find(
			(step) =>
				step.step === "installPlugin" &&
				"pluginData" in step &&
				step.pluginData?.slug === "woocommerce",
		);
		expect(wcPlugin).toBeDefined();

		// Check for debug constants
		const debugStep = blueprint.steps?.find(
			(step) =>
				step.step === "writeFile" &&
				"path" in step &&
				step.path === "/wordpress/wp-content/mu-plugins/debug-config.php",
		);
		expect(debugStep).toBeDefined();
	});

	it("should generate blueprint with custom options", () => {
		const blueprint = generateWooCommerceBlueprint({
			siteName: "Test Store",
			php: "7.4",
			wp: "6.3",
			additionalPlugins: ["akismet"],
			landingPage: "/wp-admin/plugins.php",
		});

		expect(blueprint.preferredVersions?.php).toBe("7.4");
		expect(blueprint.preferredVersions?.wp).toBe("6.3");
		expect(blueprint.landingPage).toBe("/wp-admin/plugins.php");

		// Check site name in options
		const siteOptionsStep = blueprint.steps?.find(
			(step) => step.step === "setSiteOptions",
		);
		expect(siteOptionsStep).toBeDefined();
		if (siteOptionsStep && "options" in siteOptionsStep) {
			expect(siteOptionsStep.options.blogname).toBe("Test Store");
		}

		// Check additional plugin
		const akismetPlugin = blueprint.steps?.find(
			(step) =>
				step.step === "installPlugin" &&
				"pluginData" in step &&
				step.pluginData?.slug === "akismet",
		);
		expect(akismetPlugin).toBeDefined();
	});

	it("should include product import steps when products are provided", () => {
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

		// Should have product import steps instead of default WXR import
		const importProductsStep = blueprint.steps?.find(
			(step) =>
				step.step === "writeFile" &&
				"path" in step &&
				step.path === "/wordpress/wp-content/mu-plugins/import-products.php",
		);
		expect(importProductsStep).toBeDefined();

		// Should not have default WXR import
		const wxrImportStep = blueprint.steps?.find(
			(step) => step.step === "importWxr",
		);
		expect(wxrImportStep).toBeUndefined();
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
