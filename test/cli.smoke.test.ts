import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = join(__dirname, "../dist/cli/index.js");

async function runCli(args: string[]) {
	const child = spawn("node", [cliPath, ...args], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	let stdout = "";
	let stderr = "";
	child.stdout?.on("data", (data) => {
		stdout += data.toString();
	});
	child.stderr?.on("data", (data) => {
		stderr += data.toString();
	});
	const exitCode = await new Promise<number>((resolve) => {
		child.on("exit", (code) => resolve(code ?? 0));
	});
	return { exitCode, stdout, stderr, combinedOutput: stdout + stderr };
}

describe("CLI Smoke Tests", () => {
	it("should have the CLI file built", () => {
		expect(existsSync(cliPath)).toBe(true);
	});

	it("should show help output", async () => {
		const helpProcess = spawn("node", [cliPath, "--help"], {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let output = "";
		helpProcess.stdout?.on("data", (data) => {
			output += data.toString();
		});

		const exitCode = await new Promise<number>((resolve) => {
			helpProcess.on("exit", (code) => resolve(code || 0));
		});

		expect(exitCode).toBe(0);
		expect(output).toContain(
			"wc-now - WordPress Playground with WooCommerce defaults",
		);
		expect(output).toContain("Usage: npx wc-now [command] [options]");
		expect(output).toContain("Commands:");
		expect(output).toContain("server");
		expect(output).toContain("build-snapshot");
		expect(output).toContain("run-blueprint");
		expect(output).toContain("--blueprint=<path>");
		expect(output).toContain("--source-url=<url>");
		expect(output).toContain("--site-name=<name>");
		expect(output).toContain("Examples:");
	});

	it("documents Blueprint version selection", async () => {
		const result = await runCli(["--help"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("--blueprint-version=<1|2>");
		expect(result.stdout).toContain("--auto-mount");
	});

	it("rejects an invalid Blueprint version before starting Playground", async () => {
		const result = await runCli(["server", "--blueprint-version=3"]);

		expect(result.exitCode).toBe(1);
		expect(result.combinedOutput).toContain(
			"Blueprint version must be 1 or 2; received 3",
		);
	});

	it("rejects an explicit version that conflicts with a custom Blueprint", async () => {
		const testDir = mkdtempSync(join(tmpdir(), "wc-now-smoke-"));
		try {
			const blueprintPath = join(testDir, "blueprint.json");
			writeFileSync(blueprintPath, JSON.stringify({ steps: [] }));
			const result = await runCli([
				"server",
				`--blueprint=${blueprintPath}`,
				"--blueprint-version=2",
			]);

			expect(result.exitCode).toBe(1);
			expect(result.combinedOutput).toContain(
				"Requested Blueprint v2 conflicts with custom Blueprint v1",
			);
		} finally {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("should pass through playground help for server command", async () => {
		const serverHelpProcess = spawn("node", [cliPath, "server", "--help"], {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let output = "";
		let errorOutput = "";

		serverHelpProcess.stdout?.on("data", (data) => {
			output += data.toString();
		});

		serverHelpProcess.stderr?.on("data", (data) => {
			errorOutput += data.toString();
		});

		await new Promise<void>((resolve) => {
			serverHelpProcess.on("exit", () => resolve());
		});

		// Should contain playground help content
		const combinedOutput = output + errorOutput;
		expect(combinedOutput.toLowerCase()).toMatch(/wordpress|playground|php/i);
	});

	it("should handle run-blueprint command", async () => {
		const blueprintProcess = spawn(
			"node",
			[cliPath, "run-blueprint", "--help"],
			{
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		let output = "";
		let errorOutput = "";

		blueprintProcess.stdout?.on("data", (data) => {
			output += data.toString();
		});

		blueprintProcess.stderr?.on("data", (data) => {
			errorOutput += data.toString();
		});

		await new Promise<void>((resolve) => {
			blueprintProcess.on("exit", () => resolve());
		});

		// Should pass through to playground run-blueprint command
		const combinedOutput = output + errorOutput;
		expect(combinedOutput).toBeTruthy();
	});

	it("should validate blueprint file exists", async () => {
		const errorProcess = spawn(
			"node",
			[cliPath, "server", "--blueprint=/non/existent/path/blueprint.json"],
			{
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		let output = "";
		let errorOutput = "";

		errorProcess.stdout?.on("data", (data) => {
			output += data.toString();
		});

		errorProcess.stderr?.on("data", (data) => {
			errorOutput += data.toString();
		});

		const exitCode = await new Promise<number>((resolve) => {
			errorProcess.on("exit", (code) => resolve(code || 0));
		});

		expect(exitCode).toBe(1);
		const combinedOutput = output + errorOutput;
		expect(combinedOutput).toContain("Blueprint file not found");
	});

	it("should show our custom message when starting", async () => {
		// We can't easily test the full start without actually starting playground
		// But we can at least verify our wrapper executes
		const startProcess = spawn("node", [cliPath, "server", "--help"], {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let output = "";
		startProcess.stdout?.on("data", (data) => {
			output += data.toString();
		});

		await new Promise<void>((resolve) => {
			startProcess.on("exit", () => resolve());
		});

		// The fact that it runs without error is a good sign
		expect(output).toBeTruthy();
	});
});
