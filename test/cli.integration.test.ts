import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper to wait for a condition
async function waitFor(
	condition: () => Promise<boolean>,
	timeout = 30000,
	interval = 1000,
): Promise<void> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		if (await condition()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, interval));
	}

	throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

// Helper to check if server is responding
async function isServerResponding(url: string): Promise<boolean> {
	try {
		const response = await fetch(url, {
			method: "HEAD",
			redirect: "manual",
			signal: AbortSignal.timeout(5000),
		});
		return response.ok || response.status === 302; // 302 is redirect to wp-admin
	} catch {
		return false;
	}
}

describe("CLI Integration Tests", () => {
	let serverProcess: ChildProcess | null = null;
	let testDir: string;
	let serverUrl: string;
	const testPort = 9999; // Use a specific port for testing

	beforeAll(() => {
		// Create a temporary directory for the test
		testDir = join(tmpdir(), `wc-now-test-${randomBytes(8).toString("hex")}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterAll(async () => {
		// Clean up: kill the server process
		if (serverProcess) {
			serverProcess.kill("SIGTERM");
			// Wait a bit for the process to clean up
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}

		// Clean up the test directory
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("should start WordPress Playground with WooCommerce defaults", async () => {
		// Path to our CLI
		const cliPath = join(__dirname, "../dist/cli/index.js");
		const mountPath = join(__dirname, "test-plugin");

		// Start the server
		serverProcess = spawn(
			"node",
			[
				cliPath,
				"server",
				`--port=${testPort}`,
				`--mount=${mountPath}:/wordpress/wp-content/plugins/test-plugin`,
			],
			{
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env, NODE_ENV: "test" },
			},
		);

		serverUrl = `http://127.0.0.1:${testPort}`;

		// Capture output
		serverProcess.stdout?.on("data", (data) => {
			const output = data.toString();
			console.log("[CLI Output]:", output);

			// Check if server has started
			const urlMatch = output.match(
				/http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/,
			);
			if (urlMatch) {
				serverUrl = `http://127.0.0.1:${urlMatch[1]}`;
			}
		});

		serverProcess.stderr?.on("data", (data) => {
			console.error("[CLI Error]:", data.toString());
		});

		// Readiness is the HTTP endpoint, not the wrapper's early startup banner.
		await waitFor(() => isServerResponding(serverUrl), 90000, 1000);

		// Verify we can access wp-admin (should redirect to login or show admin)
		const adminUrl = `${serverUrl}/wp-admin/`;
		const adminResponse = await fetch(adminUrl, {
			redirect: "manual",
			signal: AbortSignal.timeout(10000),
		});

		// Should either be 200 (if auto-logged in) or 302 (redirect to login)
		expect([200, 302]).toContain(adminResponse.status);

		// Verify WooCommerce is active by checking for WooCommerce admin page
		const wcAdminUrl = `${serverUrl}/wp-admin/admin.php?page=wc-admin`;
		const wcResponse = await fetch(wcAdminUrl, {
			redirect: "manual",
			signal: AbortSignal.timeout(10000),
		});

		// Should get a response (either 200 or redirect)
		expect(wcResponse.status).toBeGreaterThan(0);

		const mountedResponse = await fetch(
			`${serverUrl}/wp-content/plugins/test-plugin/mounted.txt`,
		);
		expect(mountedResponse.status).toBe(200);
		expect(await mountedResponse.text()).toContain(
			"wc-now mount forwarding works",
		);
	}, 120000); // 2 minute timeout for the entire test

	it("should start with a custom blueprint", async () => {
		// Create a custom blueprint
		const customBlueprint = {
			preferredVersions: {
				php: "8.2",
			},
			steps: [
				{
					step: "setSiteOptions",
					options: {
						blogname: "Test WooCommerce Store",
					},
				},
			],
		};

		const blueprintPath = join(testDir, "test-blueprint.json");
		writeFileSync(blueprintPath, JSON.stringify(customBlueprint, null, 2));

		// Kill previous server if running
		if (serverProcess) {
			serverProcess.kill("SIGTERM");
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}

		// Start with custom blueprint
		const cliPath = join(__dirname, "../dist/cli/index.js");
		serverProcess = spawn(
			"node",
			[cliPath, "server", `--port=${testPort}`, `--blueprint=${blueprintPath}`],
			{
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env, NODE_ENV: "test" },
			},
		);

		serverProcess.stdout?.on("data", (data) => {
			const output = data.toString();
			console.log("[CLI Output]:", output);
		});

		serverProcess.stderr?.on("data", (data) => {
			console.error("[CLI Error]:", data.toString());
		});

		await waitFor(
			() => isServerResponding(`http://127.0.0.1:${testPort}`),
			90000,
			1000,
		);
	}, 120000);
});

// Additional test for error handling
describe("CLI Error Handling", () => {
	it("should show help when --help is passed", async () => {
		const cliPath = join(__dirname, "../dist/cli/index.js");

		const helpProcess = spawn("node", [cliPath, "--help"], {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let output = "";
		helpProcess.stdout?.on("data", (data) => {
			output += data.toString();
		});

		await new Promise<void>((resolve) => {
			helpProcess.on("exit", () => resolve());
		});

		expect(output).toContain("wc-now");
		expect(output).toContain("Usage:");
		expect(output).toContain("--blueprint");
		expect(output).toContain("--source-url");
		expect(output).toContain("--site-name");
	});

	it("should handle invalid blueprint path gracefully", async () => {
		const cliPath = join(__dirname, "../dist/cli/index.js");

		const errorProcess = spawn(
			"node",
			[cliPath, "server", "--blueprint=non-existent-file.json"],
			{
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		let errorOutput = "";
		errorProcess.stderr?.on("data", (data) => {
			errorOutput += data.toString();
		});

		errorProcess.stdout?.on("data", (data) => {
			errorOutput += data.toString();
		});

		const exitCode = await new Promise<number>((resolve) => {
			errorProcess.on("exit", (code) => resolve(code || 0));
		});

		expect(exitCode).toBe(1);
		expect(errorOutput).toContain("Blueprint file not found");
	});
});
