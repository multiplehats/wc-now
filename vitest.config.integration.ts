import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
	test: {
		globals: true,
		include: ["test/**/*.integration.test.ts"],
		testTimeout: 120000, // 2 minutes for integration tests
		hookTimeout: 30000, // 30 seconds for hooks
	},
	resolve: {
		alias: {
			"@": resolve("src/"),
		},
	},
});
