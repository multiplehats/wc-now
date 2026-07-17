import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	instanceDir,
	isSlug,
	listInstanceNames,
	metaPath,
	pidAlive,
	PORT_MAX,
	PORT_MIN,
	portForName,
	primaryMountSource,
	readMeta,
	resolvePort,
	sha256,
	siteDirForCwd,
	sitesRoot,
	writeMeta,
	type InstanceMeta,
} from "../src/instances/registry";
import { execMuPlugin, logsMuPlugin } from "../src/instances/mu-plugins";

function sampleMeta(overrides: Partial<InstanceMeta> = {}): InstanceMeta {
	return {
		name: "demo",
		port: 9452,
		php: "8.2",
		wp: "latest",
		pid: 4242,
		cwd: "/tmp/demo/cwd",
		siteHash: "hash",
		siteDir: "/sites/hash",
		url: "http://127.0.0.1:9452",
		restBase: "http://127.0.0.1:9452/?rest_route=",
		token: "tok",
		persist: false,
		mounts: [],
		blueprint: null,
		createdAt: new Date().toISOString(),
		status: "running",
		...overrides,
	};
}

describe("name → port hashing", () => {
	it("is deterministic for a given name", () => {
		expect(portForName("demo")).toBe(portForName("demo"));
	});

	it("stays within the configured port range", () => {
		for (const name of ["a", "demo", "feature-branch-x", "z9"]) {
			const port = portForName(name);
			expect(port).toBeGreaterThanOrEqual(PORT_MIN);
			expect(port).toBeLessThanOrEqual(PORT_MAX);
		}
	});

	it("maps different names to (usually) different ports", () => {
		expect(portForName("alpha")).not.toBe(portForName("beta"));
	});
});

describe("resolvePort", () => {
	it("returns the requested port verbatim when provided", async () => {
		await expect(resolvePort("demo", 12345)).resolves.toBe(12345);
	});

	it("falls back to the deterministic port when free", async () => {
		// Nothing is bound in the high hash range during unit tests.
		const port = await resolvePort("unbound-name-xyz");
		expect(port).toBeGreaterThanOrEqual(PORT_MIN);
		expect(port).toBeLessThanOrEqual(PORT_MAX);
	});
});

describe("isSlug", () => {
	it.each(["a", "demo", "feature-1", "x".repeat(41)])(
		"accepts valid slug %j",
		(value) => {
			expect(isSlug(value)).toBe(true);
		},
	);

	it.each(["", "-lead", "Upper", "has space", "sym!", "x".repeat(42)])(
		"rejects invalid slug %j",
		(value) => {
			expect(isSlug(value)).toBe(false);
		},
	);
});

describe("pidAlive", () => {
	it("is true for the current process", () => {
		expect(pidAlive(process.pid)).toBe(true);
	});

	it("is false for null/undefined/unused pids", () => {
		expect(pidAlive(null)).toBe(false);
		expect(pidAlive(undefined)).toBe(false);
		expect(pidAlive(2_147_483_646)).toBe(false);
	});
});

describe("siteDirForCwd", () => {
	it("derives the site dir from sha256 of the resolved cwd", () => {
		const cwd = "/tmp/demo/cwd";
		expect(siteDirForCwd(cwd)).toBe(join(sitesRoot(), sha256(resolve(cwd))));
	});
});

describe("primaryMountSource", () => {
	it("returns the caller mount, ignoring wc-now's mu-plugins and logs mounts", () => {
		const meta = sampleMeta({
			mounts: [
				"/work/plugin:/wordpress/wp-content/plugins/plugin",
				"/inst/mu:/wordpress/wp-content/mu-plugins",
				"/inst/logs:/wordpress/wp-content/logs",
			],
		});
		expect(primaryMountSource(meta)).toBe("/work/plugin");
	});

	it("returns null when there is no caller mount", () => {
		const meta = sampleMeta({
			mounts: [
				"/inst/mu:/wordpress/wp-content/mu-plugins",
				"/inst/logs:/wordpress/wp-content/logs",
			],
		});
		expect(primaryMountSource(meta)).toBeNull();
	});
});

describe("registry persistence", () => {
	let home: string;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "wc-now-home-"));
		process.env.WC_NOW_HOME = home;
	});

	afterEach(() => {
		process.env.WC_NOW_HOME = undefined;
		rmSync(home, { recursive: true, force: true });
	});

	it("honors WC_NOW_HOME for instance paths", () => {
		expect(instanceDir("demo")).toBe(join(home, "instances", "demo"));
		expect(metaPath("demo")).toBe(join(home, "instances", "demo", "meta.json"));
	});

	it("round-trips meta through write/read", () => {
		const meta = sampleMeta();
		writeMeta(meta);
		expect(readMeta("demo")).toEqual(meta);
	});

	it("lists only instances with a meta.json", () => {
		expect(listInstanceNames()).toEqual([]);
		writeMeta(sampleMeta({ name: "one" }));
		writeMeta(sampleMeta({ name: "two" }));
		expect(listInstanceNames().sort()).toEqual(["one", "two"]);
	});

	it("returns null reading a missing instance", () => {
		expect(readMeta("nope")).toBeNull();
	});
});

describe("mu-plugin templates", () => {
	it("embeds the token and exec route in the exec mu-plugin", () => {
		const php = execMuPlugin("secret-token");
		expect(php).toContain("secret-token");
		expect(php).toContain("wcnow/v1");
		expect(php).toContain("x-wcnow-token");
	});

	it("routes error_log to the mounted logs dir on late hooks", () => {
		const php = logsMuPlugin();
		expect(php).toContain("/wordpress/wp-content/logs/debug.log");
		expect(php).toContain("PHP_INT_MAX");
	});
});
