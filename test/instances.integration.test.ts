import { afterAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "../dist/cli/index.js");

// Isolated registry home + a unique name so the test never collides with a
// developer's real instances.
const home = mkdtempSync(join(tmpdir(), "wc-now-int-"));
const name = `it-${randomBytes(3).toString("hex")}`;

interface CliResult {
	code: number;
	stdout: string;
	stderr: string;
}

function runCli(args: string[]): Promise<CliResult> {
	return new Promise((resolve) => {
		const child = spawn("node", [cliPath, ...args], {
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, WC_NOW_HOME: home },
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => {
			stdout += d.toString();
		});
		child.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		child.on("exit", (code) => resolve({ code: code ?? 0, stdout, stderr }));
	});
}

describe("Instance lifecycle integration", () => {
	afterAll(async () => {
		// Best-effort teardown even if an assertion failed mid-way.
		await runCli(["stop", name]).catch(() => undefined);
		rmSync(home, { recursive: true, force: true });
	});

	it(
		"boots a named instance, execs PHP inside it, then stops it",
		async () => {
			const up = await runCli(["up", "--name", name, "--php", "8.2", "--wait", "150"]);
			expect(up.code, up.stdout + up.stderr).toBe(0);
			expect(up.stdout).toContain(`'${name}' running`);

			// `list` shows the running instance.
			const list = await runCli(["list"]);
			expect(list.stdout).toContain(name);
			expect(list.stdout).toContain("running");

			// exec runs PHP inside the live process: 2*21 => 42.
			const math = await runCli(["exec", name, "--code", "echo 2*21;"]);
			expect(math.code, math.stdout + math.stderr).toBe(0);
			expect(math.stdout.trim()).toBe("42");

			// PHP version is driven by the blueprint, not the (cosmetic) --php flag.
			const version = await runCli(["exec", name, "--code", "echo PHP_VERSION;"]);
			expect(version.stdout.trim()).toMatch(/^8\.2\./);

			// stop removes the ephemeral instance from the registry.
			const stop = await runCli(["stop", name]);
			expect(stop.code).toBe(0);
			const listAfter = await runCli(["list"]);
			expect(listAfter.stdout).not.toContain(name);
		},
		220_000,
	);
});
