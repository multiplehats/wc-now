import { defineConfig } from "vite";
import { resolve } from "node:path";
import dts from "vite-plugin-dts";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	return {
		cacheDir: "node_modules/.vite",
		build: {
			lib: {
				entry: {
					index: resolve(__dirname, "src/index.ts"),
					"cli/index": resolve(__dirname, "src/cli/index.ts"),
					"blueprint/types": resolve(__dirname, "src/blueprint/types.ts"),
					"blueprint/generator": resolve(
						__dirname,
						"src/blueprint/generator.ts",
					),
					"wc-public-api/index": resolve(
						__dirname,
						"src/wc-public-api/index.ts",
					),
				},
				formats: ["es"],
			},
			rollupOptions: {
				external: [
					"node:child_process",
					"node:fs",
					"node:path",
					"node:url",
					"node:os",
					"node:crypto",
					"@wp-now/wp-now",
					"@wp-now/wp-now/cli.js",
				],
				output: {
					preserveModules: true,
					preserveModulesRoot: "src",
					banner: (chunk) => {
						// Add shebang to CLI entry
						if (chunk.fileName === "cli/index.js") {
							return "#!/usr/bin/env node\n";
						}
						return "";
					},
				},
			},
		},
		resolve: {
			alias: {
				"@": resolve("src/"),
			},
		},
		test: {
			globals: true,
			include: ["test/**/*.test.ts"],
			exclude: ["test/**/*.integration.test.ts"],
			testTimeout: 10000,
		},
		plugins: [
			// generate typescript types
			dts({
				insertTypesEntry: true,
			}),
		],
		define: {
			"import.meta.vitest": mode !== "production",
		},
	};
});
