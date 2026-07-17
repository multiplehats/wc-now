import { createHash } from "node:crypto";
import { createServer } from "node:net";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * On-disk record for a single named instance. Persisted as `meta.json` inside
 * the instance directory so every command (list/stop/logs/exec/...) can find and
 * reconnect to a backgrounded Playground process.
 */
export interface InstanceMeta {
	name: string;
	port: number;
	php: string;
	wp: string;
	/** PID of the detached `wp-playground start` process (null once stopped). */
	pid: number | null;
	/** Per-instance working directory `start` is launched from. */
	cwd: string;
	/** sha256(cwd) — the folder name Playground stores the site under. */
	siteHash: string;
	/** Absolute path to the Playground site directory for this instance. */
	siteDir: string;
	url: string;
	/** `${url}/?rest_route=` — all REST/health/exec calls use this form. */
	restBase: string;
	/** Random per-instance token guarding the loopback exec endpoint. */
	token: string;
	/** persist keeps the site dir on stop; ephemeral removes it. */
	persist: boolean;
	/** All `--mount host:vfs` pairs handed to Playground. */
	mounts: string[];
	/** Absolute path to the blueprint used at boot (null after cleanup). */
	blueprint: string | null;
	createdAt: string;
	status: "starting" | "running" | "stopped" | "dead" | "reset";
}

/** Deterministic port range for name→port hashing. */
export const PORT_MIN = 9400;
export const PORT_MAX = 9499;

/** Root for wc-now's instance registry (override with `WC_NOW_HOME`). */
export function homeRoot(): string {
	return process.env.WC_NOW_HOME ?? join(homedir(), ".wc-now");
}

/** Directory holding one sub-directory per named instance. */
export function instancesRoot(): string {
	return join(homeRoot(), "instances");
}

/** Where `wp-playground start` stores persisted sites, keyed by sha256(cwd). */
export function sitesRoot(): string {
	return join(homedir(), ".wordpress-playground", "sites");
}

export function instanceDir(name: string): string {
	return join(instancesRoot(), name);
}

export function metaPath(name: string): string {
	return join(instanceDir(name), "meta.json");
}

export function sha256(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

/** The Playground site directory `start` derives from a launch cwd. */
export function siteDirForCwd(cwd: string): string {
	return join(sitesRoot(), sha256(resolve(cwd)));
}

/** Instance names must be filesystem- and URL-safe slugs. */
export function isSlug(value: string): boolean {
	return /^[a-z0-9][a-z0-9-]{0,40}$/.test(value);
}

/** True if a process with `pid` is currently alive and signalable. */
export function pidAlive(pid: number | null | undefined): boolean {
	if (!pid) {
		return false;
	}
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** Deterministic name→port so a given name maps to a stable port. */
export function portForName(name: string): number {
	const span = PORT_MAX - PORT_MIN + 1;
	const hash = createHash("sha256").update(name).digest().readUInt32BE(0);
	return PORT_MIN + (hash % span);
}

/** Resolve to `true` if nothing is listening on `port` (127.0.0.1). */
export function portFree(port: number): Promise<boolean> {
	return new Promise((resolveFree) => {
		const srv = createServer();
		srv.once("error", () => resolveFree(false));
		srv.once("listening", () => srv.close(() => resolveFree(true)));
		srv.listen(port, "127.0.0.1");
	});
}

/**
 * Pick the port for an instance: the explicit request wins, otherwise the
 * deterministic name→port, linear-probing to the next free port on collision.
 */
export async function resolvePort(
	name: string,
	requested?: number,
): Promise<number> {
	if (requested) {
		return requested;
	}
	const span = PORT_MAX - PORT_MIN + 1;
	const start = portForName(name);
	for (let i = 0; i < span; i++) {
		const candidate = PORT_MIN + (((start - PORT_MIN + i) % span + span) % span);
		if (await portFree(candidate)) {
			return candidate;
		}
	}
	throw new Error(`no free port in range ${PORT_MIN}-${PORT_MAX}`);
}

export function readMeta(name: string): InstanceMeta | null {
	try {
		return JSON.parse(readFileSync(metaPath(name), "utf-8")) as InstanceMeta;
	} catch {
		return null;
	}
}

export function writeMeta(meta: InstanceMeta): void {
	mkdirSync(instanceDir(meta.name), { recursive: true });
	writeFileSync(metaPath(meta.name), JSON.stringify(meta, null, 2));
}

/** All registered instance names (folders containing a `meta.json`). */
export function listInstanceNames(): string[] {
	try {
		return readdirSync(instancesRoot()).filter((name) =>
			existsSync(metaPath(name)),
		);
	} catch {
		return [];
	}
}

/**
 * The instance's primary mount source path — the caller-supplied plugin/theme
 * mount, excluding wc-now's own mu-plugins and logs mounts. Used by `prune` to
 * detect an archived workspace whose host directory has vanished.
 */
export function primaryMountSource(meta: InstanceMeta): string | null {
	const mount = (meta.mounts ?? []).find(
		(entry) => !entry.includes("/mu-plugins") && !entry.includes("/logs"),
	);
	return mount ? mount.split(":")[0] : null;
}
