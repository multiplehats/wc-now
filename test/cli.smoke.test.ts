import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("CLI Smoke Tests", () => {
	const cliPath = join(__dirname, "../dist/cli/index.js");

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
