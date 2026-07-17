import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveWooBlueprint } from "../blueprint/resolve";
import type { BlueprintVersion } from "../blueprint/types";
import {
	EXEC_ROUTE,
	EXEC_TOKEN_HEADER,
	execMuPlugin,
	LOGS_VFS_DIR,
	logsMuPlugin,
} from "./mu-plugins";
import {
	type InstanceMeta,
	instanceDir,
	isSlug,
	listInstanceNames,
	pidAlive,
	portForName,
	primaryMountSource,
	readMeta,
	resolvePort,
	sha256,
	siteDirForCwd,
	writeMeta,
} from "./registry";

const sleep = (ms: number): Promise<void> =>
	new Promise((r) => setTimeout(r, ms));

// Playground's `--login` auto-login fires a one-shot 302 interstitial on the
// first request (setting this cookie). `fetch` doesn't carry the cookie across
// the self-redirect, so it loops; sending the cookie up front bypasses the
// interstitial and returns the real response directly.
const AUTO_LOGIN_COOKIE = "playground_auto_login_already_happened=1";

/** User-facing error that maps to a clean `wc-now: <message>` + exit 1. */
class InstanceError extends Error {}

function log(message: string): void {
	console.log(message);
}

/** Resolve the locally installed @wp-playground/cli entry (never via npx). */
function playgroundCliPath(): string {
	const pkgUrl = import.meta.resolve("@wp-playground/cli/package.json");
	const bin = join(dirname(fileURLToPath(pkgUrl)), "wp-playground.js");
	if (!existsSync(bin)) {
		throw new InstanceError(
			`@wp-playground/cli binary not found at ${bin} (run: pnpm install)`,
		);
	}
	return bin;
}

// ---------------------------------------------------------------- arg parsing

interface ParsedArgs {
	_: string[];
	flags: Set<string>;
	values: Map<string, string>;
	multi: Map<string, string[]>;
}

/** Tiny parser: `--key value`, `--flag`, `-f`, `-n N`, and positionals. */
function parseArgs(
	argv: string[],
	spec: { flags?: string[]; multi?: string[] } = {},
): ParsedArgs {
	const flagKeys = new Set(spec.flags ?? []);
	const multiKeys = new Set(spec.multi ?? []);
	const out: ParsedArgs = {
		_: [],
		flags: new Set(),
		values: new Map(),
		multi: new Map(),
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--") {
			out._.push(...argv.slice(i + 1));
			break;
		}
		if (arg.startsWith("--")) {
			const [key, inlineValue] = splitInline(arg.slice(2));
			if (flagKeys.has(key)) {
				out.flags.add(key);
				continue;
			}
			const value = inlineValue ?? argv[++i];
			if (multiKeys.has(key)) {
				const list = out.multi.get(key) ?? [];
				list.push(value);
				out.multi.set(key, list);
			} else {
				out.values.set(key, value);
			}
		} else if (arg === "-f") {
			out.flags.add("follow");
		} else if (arg === "-n") {
			out.values.set("lines", argv[++i]);
		} else {
			out._.push(arg);
		}
	}
	return out;
}

function splitInline(token: string): [string, string | undefined] {
	const eq = token.indexOf("=");
	return eq === -1
		? [token, undefined]
		: [token.slice(0, eq), token.slice(eq + 1)];
}

// ------------------------------------------------------------------------ up

async function cmdUp(argv: string[]): Promise<void> {
	const a = parseArgs(argv, {
		flags: ["persist", "ephemeral", "reset"],
		multi: ["mount"],
	});
	const name = a.values.get("name") ?? a._[0];
	if (!name) {
		throw new InstanceError("up: --name <slug> required");
	}
	if (!isSlug(name)) {
		throw new InstanceError(`up: invalid name '${name}' (use [a-z0-9-])`);
	}

	const existing = readMeta(name);
	if (existing && pidAlive(existing.pid)) {
		log(
			`instance '${name}' already running → ${existing.url} (pid ${existing.pid})`,
		);
		return;
	}

	const dir = instanceDir(name);
	const cwd = join(dir, "cwd");
	const muDir = join(dir, "mu");
	const logsDir = join(dir, "logs");
	const bootLog = join(dir, "boot.log");
	for (const d of [cwd, muDir, logsDir]) {
		mkdirSync(d, { recursive: true });
	}

	const persist = a.flags.has("persist") && !a.flags.has("ephemeral");
	const siteDir = siteDirForCwd(cwd);
	// Ephemeral always boots fresh; persist reconnects unless --reset is given.
	const reset = persist ? a.flags.has("reset") : true;
	if (!persist) {
		rmSync(siteDir, { recursive: true, force: true });
	}
	// Seed (run the blueprint) on a fresh boot; skip it when reconnecting to an
	// already-seeded persisted site.
	const seed = reset || !existsSync(siteDir);

	// The exec + logs mu-plugins live in the mounted mu dir and are rewritten
	// every boot, so the exec token is always current — even on persist restart.
	const token = randomBytes(24).toString("hex");
	writeFileSync(join(muDir, "wc-now-exec.php"), execMuPlugin(token));
	writeFileSync(join(muDir, "zz-wc-now-logs.php"), logsMuPlugin());
	if (!existsSync(join(logsDir, "debug.log"))) {
		writeFileSync(join(logsDir, "debug.log"), "");
	}

	const php = a.values.get("php") ?? "8.0";
	const wp = a.values.get("wp") ?? "latest";
	const requestedPort = a.values.get("port");
	const port = await resolvePort(
		name,
		requestedPort ? Number(requestedPort) : undefined,
	);
	const url = `http://127.0.0.1:${port}`;

	// PHP version is carried by the blueprint (start ignores --php for the
	// runtime), so it must be injected there — resolveWooBlueprint does that via
	// the generator's phpVersion/preferredVersions field.
	let blueprintPath: string | null = null;
	if (seed) {
		const blueprint = await resolveWooBlueprint({
			customBlueprintPath: a.values.get("blueprint"),
			sourceUrl: a.values.get("source-url"),
			siteName: a.values.get("site-name"),
			php,
			wp,
			requestedBlueprintVersion: parseBlueprintVersion(
				a.values.get("blueprint-version"),
			),
			log,
		});
		blueprintPath = join(dir, "blueprint.json");
		writeFileSync(blueprintPath, JSON.stringify(blueprint, null, 2));
	}

	const mounts = [
		...(a.multi.get("mount") ?? []),
		`${muDir}:/wordpress/wp-content/mu-plugins`,
		`${logsDir}:${LOGS_VFS_DIR}`,
	];

	const args = [
		"start",
		"--no-auto-mount",
		"--skip-browser",
		`--php=${php}`,
		`--wp=${wp}`,
		`--port=${port}`,
	];
	// Auto-login is on by default (the generated blueprint also sets login:true);
	// the exec/health requests bypass the interstitial via the auto-login cookie.
	args.push("--login");
	if (reset) {
		args.push("--reset");
	}
	if (a.values.get("site-name")) {
		args.push(`--site-url=${url}`);
	}
	if (blueprintPath) {
		args.push(`--blueprint=${blueprintPath}`);
	}
	for (const m of mounts) {
		args.push("--mount", m);
	}

	const fd = openSync(bootLog, "w");
	const child = spawn(process.execPath, [playgroundCliPath(), ...args], {
		cwd,
		detached: true,
		stdio: ["ignore", fd, fd],
	});
	child.unref();

	const meta: InstanceMeta = {
		name,
		port,
		php,
		wp,
		pid: child.pid ?? null,
		cwd,
		siteHash: sha256(resolve(cwd)),
		siteDir,
		url,
		restBase: `${url}/?rest_route=`,
		token,
		persist,
		mounts,
		blueprint: blueprintPath,
		createdAt: new Date().toISOString(),
		status: "starting",
	};
	writeMeta(meta);

	// Readiness gate: the child stays alive AND REST answers 200.
	const waitMs = (Number(a.values.get("wait")) || 180) * 1000;
	const startedAt = Date.now();
	let ready = false;
	while (Date.now() - startedAt < waitMs) {
		if (!pidAlive(child.pid)) {
			meta.status = "dead";
			writeMeta(meta);
			const tail = tailFile(bootLog, 25);
			throw new InstanceError(
				`instance '${name}' died during boot:\n${tail}`,
			);
		}
		try {
			const res = await fetch(`${meta.restBase}/`, {
				headers: { cookie: AUTO_LOGIN_COOKIE },
				signal: AbortSignal.timeout(4000),
			});
			if (res.ok) {
				ready = true;
				break;
			}
		} catch {
			// not up yet
		}
		await sleep(2000);
	}
	if (!ready) {
		throw new InstanceError(
			`instance '${name}' did not become ready within ${waitMs / 1000}s (see ${bootLog})`,
		);
	}

	meta.status = "running";
	writeMeta(meta);
	log(
		`✅ '${name}' running  port ${port}  ${url}  (php ${php}, wp ${wp}${persist ? ", persist" : ""})`,
	);
}

function parseBlueprintVersion(value?: string): BlueprintVersion | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (value !== "1" && value !== "2") {
		throw new InstanceError(`Blueprint version must be 1 or 2; received ${value}`);
	}
	return Number(value) as BlueprintVersion;
}

// ---------------------------------------------------------------------- list

function cmdList(): void {
	const names = listInstanceNames();
	if (names.length === 0) {
		log("(no instances)");
		return;
	}
	const rows = names.map((name) => {
		const meta = readMeta(name);
		const alive = pidAlive(meta?.pid);
		return {
			name,
			port: meta?.port ?? "?",
			status: alive ? "running" : meta?.persist ? "stopped" : "dead",
			url: meta?.url ?? "",
		};
	});
	const width = (key: "name" | "status"): number =>
		Math.max(key.length, ...rows.map((r) => String(r[key]).length));
	const wName = width("name");
	const wStatus = width("status");
	log(
		`${"NAME".padEnd(wName)}  ${"PORT".padEnd(5)}  ${"STATUS".padEnd(wStatus)}  URL`,
	);
	for (const r of rows) {
		log(
			`${r.name.padEnd(wName)}  ${String(r.port).padEnd(5)}  ${r.status.padEnd(wStatus)}  ${r.url}`,
		);
	}
}

// ---------------------------------------------------------------------- stop

async function killInstance(meta: InstanceMeta): Promise<void> {
	if (pidAlive(meta.pid) && meta.pid) {
		try {
			process.kill(meta.pid, "SIGTERM");
		} catch {
			// already gone
		}
		for (let i = 0; i < 20 && pidAlive(meta.pid); i++) {
			await sleep(150);
		}
		if (pidAlive(meta.pid)) {
			try {
				process.kill(meta.pid, "SIGKILL");
			} catch {
				// already gone
			}
		}
	}
}

async function cmdStop(argv: string[]): Promise<void> {
	const name = argv[0];
	if (!name) {
		throw new InstanceError("stop: <name> required");
	}
	const meta = readMeta(name);
	if (!meta) {
		throw new InstanceError(`stop: no such instance '${name}'`);
	}
	await killInstance(meta);
	if (meta.persist) {
		meta.pid = null;
		meta.status = "stopped";
		writeMeta(meta);
		log(
			`stopped '${name}' (persisted; site kept — 'wc-now up --name ${name} --persist' to resume, 'wc-now reset ${name}' to wipe)`,
		);
	} else {
		rmSync(meta.siteDir, { recursive: true, force: true });
		rmSync(instanceDir(name), { recursive: true, force: true });
		log(`terminated '${name}' (process, site dir, and registry entry removed)`);
	}
}

// ---------------------------------------------------------------------- logs

function cmdLogs(argv: string[]): void {
	const a = parseArgs(argv);
	const name = a._[0];
	if (!name) {
		throw new InstanceError("logs: <name> required");
	}
	const meta = readMeta(name);
	if (!meta) {
		throw new InstanceError(`logs: no such instance '${name}'`);
	}
	const logFile = join(instanceDir(name), "logs", "debug.log");
	if (!existsSync(logFile)) {
		throw new InstanceError(`logs: no debug.log yet for '${name}'`);
	}
	const tailArgs = ["-n", String(a.values.get("lines") ?? 200)];
	if (a.flags.has("follow")) {
		tailArgs.push("-f");
	}
	tailArgs.push(logFile);
	const result = spawnSync("tail", tailArgs, { stdio: "inherit" });
	process.exit(result.status ?? 0);
}

// ---------------------------------------------------------------------- exec

async function cmdExec(argv: string[]): Promise<void> {
	const a = parseArgs(argv);
	const name = a._[0] ?? a.values.get("name");
	if (!name) {
		throw new InstanceError("exec: <name> required");
	}
	const meta = readMeta(name);
	if (!meta) {
		throw new InstanceError(`exec: no such instance '${name}'`);
	}
	if (!pidAlive(meta.pid)) {
		throw new InstanceError(`exec: instance '${name}' is not running`);
	}

	let code = a.values.get("code");
	const file = a.values.get("file");
	if (file) {
		code = readFileSync(file, "utf-8");
	}
	if (!code && a._.length > 1) {
		code = a._.slice(1).join(" ");
	}
	if (!code) {
		throw new InstanceError('exec: pass --file <f.php> or --code "<php>"');
	}
	// Accept either a full file (leading <?php) or a bare snippet.
	code = code.replace(/^\s*<\?php\s*/, "");

	const body = new URLSearchParams({
		code: Buffer.from(code, "utf-8").toString("base64"),
	});
	// A freshly-booted instance can transiently 500 (workers settling / DB
	// warming), so retry a few times before giving up.
	let text = "";
	let lastErr = "";
	for (let attempt = 0; attempt < 5; attempt++) {
		if (attempt) {
			await sleep(1500);
		}
		let res: Response;
		try {
			res = await fetch(`${meta.restBase}${EXEC_ROUTE}`, {
				method: "POST",
				headers: {
					[EXEC_TOKEN_HEADER]: meta.token,
					"content-type": "application/x-www-form-urlencoded",
					cookie: AUTO_LOGIN_COOKIE,
				},
				body,
				signal: AbortSignal.timeout(120000),
			});
		} catch (error) {
			lastErr = `request failed: ${
				error instanceof Error ? error.message : String(error)
			}`;
			continue;
		}
		text = await res.text();
		if (res.ok && text.trim().startsWith("{")) {
			lastErr = "";
			break;
		}
		lastErr = res.ok
			? `non-JSON response: ${text.slice(0, 200)}`
			: `HTTP ${res.status}: ${text.slice(0, 200)}`;
	}
	if (lastErr) {
		throw new InstanceError(`exec: ${lastErr}`);
	}

	let data: { out?: unknown; ret?: unknown };
	try {
		data = JSON.parse(text);
	} catch {
		throw new InstanceError(`exec: non-JSON response: ${text.slice(0, 300)}`);
	}
	if (typeof data.out === "string") {
		process.stdout.write(data.out.endsWith("\n") ? data.out : `${data.out}\n`);
	} else {
		log(JSON.stringify(data));
	}
}

// --------------------------------------------------------------------- reset

async function cmdReset(argv: string[]): Promise<void> {
	const name = argv[0];
	if (!name) {
		throw new InstanceError("reset: <name> required");
	}
	const meta = readMeta(name);
	if (!meta) {
		throw new InstanceError(`reset: no such instance '${name}'`);
	}
	await killInstance(meta);
	rmSync(meta.siteDir, { recursive: true, force: true });
	meta.pid = null;
	meta.status = "reset";
	writeMeta(meta);
	log(
		`reset '${name}' — site wiped; 'wc-now up --name ${name}${meta.persist ? " --persist" : ""}' for a clean boot`,
	);
}

// --------------------------------------------------------------------- prune

async function cmdPrune(): Promise<void> {
	let reaped = 0;
	for (const name of listInstanceNames()) {
		const meta = readMeta(name);
		if (!meta) {
			continue;
		}
		const alive = pidAlive(meta.pid);
		const src = primaryMountSource(meta);
		const workspaceGone = src !== null && !existsSync(src);

		if (workspaceGone) {
			await killInstance(meta);
			rmSync(meta.siteDir, { recursive: true, force: true });
			rmSync(instanceDir(name), { recursive: true, force: true });
			log(`pruned orphaned '${name}' (workspace ${src} is gone)`);
			reaped++;
		} else if (!alive && !meta.persist) {
			rmSync(meta.siteDir, { recursive: true, force: true });
			rmSync(instanceDir(name), { recursive: true, force: true });
			log(`pruned dead ephemeral instance '${name}'`);
			reaped++;
		}
	}
	log(reaped ? `prune complete (${reaped} reaped)` : "prune: nothing to reap");
}

// ------------------------------------------------------------------ dispatch

function tailFile(path: string, lines: number): string {
	try {
		return readFileSync(path, "utf-8").split("\n").slice(-lines).join("\n");
	} catch {
		return "";
	}
}

/** Top-level lifecycle commands handled by the instance manager. */
export const INSTANCE_COMMANDS: readonly string[] = [
	"up",
	"list",
	"stop",
	"logs",
	"exec",
	"reset",
	"prune",
	"port",
];

/** Dispatch a lifecycle command; throws InstanceError for user-facing failures. */
export async function runInstanceCommand(
	command: string,
	rest: string[],
): Promise<void> {
	switch (command) {
		case "up":
			return cmdUp(rest);
		case "list":
			return cmdList();
		case "stop":
			return cmdStop(rest);
		case "logs":
			return cmdLogs(rest);
		case "exec":
			return cmdExec(rest);
		case "reset":
			return cmdReset(rest);
		case "prune":
			return cmdPrune();
		case "port": {
			const name = rest[0];
			if (!name) {
				throw new InstanceError("port: <name> required");
			}
			log(String(portForName(name)));
			return;
		}
		default:
			throw new InstanceError(`unknown command '${command}'`);
	}
}
