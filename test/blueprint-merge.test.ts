import { describe, expect, it } from "vitest";
import {
	detectBlueprintVersion,
	mergeBlueprints,
	resolveBlueprintVersion,
} from "../src/blueprint/merge";

describe("Blueprint version selection", () => {
	it("treats a versionless custom Blueprint as v1", () => {
		expect(detectBlueprintVersion({ steps: [] })).toBe(1);
	});

	it("detects version 2", () => {
		expect(detectBlueprintVersion({ version: 2 })).toBe(2);
	});

	it.each([1, 3, "2", null])(
		"rejects unsupported explicit version %j",
		(version) => {
			expect(() => detectBlueprintVersion({ version })).toThrow(
				`Unsupported Blueprint version: ${JSON.stringify(version)}`,
			);
		},
	);

	it("rejects non-object Blueprints", () => {
		expect(() => detectBlueprintVersion(null)).toThrow(
			"Blueprint must be a JSON object",
		);
	});

	it("defaults to v2 without a custom file", () => {
		expect(resolveBlueprintVersion(undefined)).toBe(2);
	});

	it("rejects a requested version that conflicts with the custom file", () => {
		expect(() => resolveBlueprintVersion({ version: 2 }, 1)).toThrow(
			"Requested Blueprint v1 conflicts with custom Blueprint v2",
		);
	});
});

describe("Blueprint merging", () => {
	it("merges v1 objects and appends v1 resources and steps", () => {
		const merged = mergeBlueprints(
			{
				preferredVersions: { php: "8.0", wp: "latest" },
				features: { networking: true },
				plugins: ["woocommerce"],
				steps: [{ step: "mkdir", path: "/base" }],
			},
			{
				preferredVersions: { php: "8.3" },
				plugins: ["akismet"],
				steps: [{ step: "mkdir", path: "/custom" }],
			},
		);

		expect(merged).toMatchObject({
			preferredVersions: { php: "8.3", wp: "latest" },
			plugins: ["woocommerce", "akismet"],
			steps: [
				{ step: "mkdir", path: "/base" },
				{ step: "mkdir", path: "/custom" },
			],
		});
	});

	it("merges v2 application options, maps, arrays, and post-execution steps", () => {
		const merged = mergeBlueprints(
			{
				version: 2,
				phpVersion: "8.0",
				applicationOptions: {
					"wordpress-playground": { login: true, networkAccess: true },
				},
				siteOptions: { blogname: "Base" },
				plugins: ["woocommerce"],
				additionalStepsAfterExecution: [],
			},
			{
				version: 2,
				phpVersion: "8.3",
				applicationOptions: {
					"wordpress-playground": { landingPage: "/shop/" },
				},
				siteOptions: { blogname: "Custom" },
				plugins: ["akismet"],
				additionalStepsAfterExecution: [
					{
						step: "runPHP",
						code: { filename: "custom.php", content: "<?php" },
					},
				],
			},
		);

		expect(merged).toMatchObject({
			version: 2,
			phpVersion: "8.3",
			applicationOptions: {
				"wordpress-playground": {
					login: true,
					networkAccess: true,
					landingPage: "/shop/",
				},
			},
			siteOptions: { blogname: "Custom" },
			plugins: ["woocommerce", "akismet"],
		});
	});

	it("rejects cross-version merging", () => {
		expect(() => mergeBlueprints({ steps: [] }, { version: 2 })).toThrow(
			"Cannot merge Blueprint v1 with Blueprint v2",
		);
	});
});
