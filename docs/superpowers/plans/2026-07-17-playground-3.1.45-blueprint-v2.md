# Playground 3.1.45 and Blueprint v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade wc-now to `@wp-playground/cli` 3.1.45, generate native Blueprint v2 by default while retaining auto-detected v1 compatibility, and ship the related CLI, Store API, example, and documentation fixes.

**Architecture:** Keep two native generators behind a discriminated public API: v2 is the default and v1 is explicit. Move version detection and same-version merging into a pure Blueprint module so the CLI only coordinates arguments, custom-file loading, generation, and process launch. Express v2 defaults declaratively and use `additionalStepsAfterExecution` only for WooCommerce/product PHP that has no declarative equivalent.

**Tech Stack:** TypeScript 5.5, Node.js 20.18+, pnpm 9, Vite 6, Vitest 2, WordPress Playground CLI and Blueprints 3.1.45, Blueprint schema v1/v2

## Global Constraints

- Preserve the dependency caret policy: `@wp-playground/cli` and `@wp-playground/blueprints` must be `^3.1.45`, with the lockfile resolving `3.1.45`.
- Blueprint v2 is the generated default; Blueprint v1 remains a native opt-in and is selected automatically for versionless custom files.
- A custom Blueprint with `version: 2` is v2; a custom Blueprint without `version` is v1; every other version value is rejected.
- Never convert or cross-merge Blueprint formats.
- Preserve all pass-through Playground arguments, especially repeated `--mount=` values.
- Do not emit standalone `activatePlugin` steps in generated output or maintained examples.
- Preserve WooCommerce setup, products, debug helpers, login, landing page, and network access in both formats.
- Correct the package Node engine to `>=20.18.0`.
- Update README and CLI help for every new public behavior.
- Run a real v2 WooCommerce boot and an auto-detected custom v1 boot before completion.

---

### Task 1: Upgrade Playground and runtime metadata

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: npm `latest` dist-tag resolving `@wp-playground/cli` 3.1.45.
- Produces: caret dependencies `^3.1.45`, exact lock resolution 3.1.45, Node engine `>=20.18.0`.

- [ ] **Step 1: Run the metadata assertion and confirm the current versions fail**

```bash
node --input-type=module -e '
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(pkg.dependencies["@wp-playground/cli"], "^3.1.45");
assert.equal(pkg.dependencies["@wp-playground/blueprints"], "^3.1.45");
assert.equal(pkg.engines.node, ">=20.18.0");
const lock = readFileSync("pnpm-lock.yaml", "utf8");
assert.match(lock, /specifier: \^3\.1\.45/);
assert.match(lock, /version: 3\.1\.45/);
'
```

Expected: FAIL because `package.json` still declares `^3.0.46` and `>=20`.

- [ ] **Step 2: Upgrade the dependency and lockfile**

```bash
pnpm add '@wp-playground/cli@^3.1.45' '@wp-playground/blueprints@^3.1.45'
```

Expected: `package.json` contains caret ranges for the CLI and Blueprints packages, and the Playground/PHP-WASM packages in `pnpm-lock.yaml` resolve to 3.1.45.

- [ ] **Step 3: Correct the Node engine floor**

Change the `engines.node` value in `package.json` to:

```json
"node": ">=20.18.0"
```

- [ ] **Step 4: Re-run the exact metadata assertion**

Expected: exit code 0 with no assertion output.

- [ ] **Step 5: Verify the upgraded CLI executable contract**

```bash
node --input-type=module -e '
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const url = import.meta.resolve("@wp-playground/cli/package.json");
const pkg = JSON.parse(readFileSync(new URL(url), "utf8"));
assert.equal(pkg.version, "3.1.45");
assert.equal(pkg.bin["wp-playground-cli"], "wp-playground.js");
'
```

Expected: exit code 0, proving `src/cli/index.ts` can keep resolving `wp-playground.js` from the installed package.

- [ ] **Step 6: Commit the dependency upgrade**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: upgrade WordPress Playground"
```

---

### Task 2: Add native v2 types and default generation

**Files:**

- Modify: `src/blueprint/types.ts`
- Modify: `src/blueprint/generator.ts`
- Modify: `test/blueprint.test.ts`
- Modify: `src/blueprint/build-blueprint.ts`
- Modify: `blueprint.json`

**Interfaces:**

- Consumes: existing WooCommerce settings, product PHP generation, v1 step types, and `BlueprintGeneratorOptions` values.
- Produces: `BlueprintV1`, `BlueprintV2`, their step types, version-discriminated generator options, and overloads returning v2 by default or v1 for `blueprintVersion: 1`.

- [ ] **Step 1: Replace the default-generator assertions with a failing v2 contract test**

In `test/blueprint.test.ts`, make the default test assert:

```ts
it("generates a native Blueprint v2 by default", () => {
  const blueprint = generateWooCommerceBlueprint();

  expect(blueprint.version).toBe(2);
  expect(blueprint.$schema).toBe(
    "https://playground.wordpress.net/blueprint-schema.json",
  );
  expect(blueprint.phpVersion).toBe("8.0");
  expect(blueprint.wordpressVersion).toBe("latest");
  expect(blueprint.applicationOptions?.["wordpress-playground"]).toEqual({
    landingPage: "/wp-admin/",
    login: true,
    networkAccess: true,
  });
  expect(blueprint.plugins).toContain("woocommerce");
  expect(blueprint.siteOptions?.blogname).toBe("My WooCommerce Store");
  expect(blueprint.siteOptions?.permalink_structure).toBe("/%postname%/");
  expect(blueprint.muPlugins).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ filename: "debug-config.php" }),
      expect.objectContaining({ filename: "playground-helpers.php" }),
    ]),
  );
  expect(
    blueprint.additionalStepsAfterExecution?.some(
      (step) => step.step === "runPHP",
    ),
  ).toBe(true);
  expect("steps" in blueprint).toBe(false);
});
```

- [ ] **Step 2: Add a failing explicit-v1 compatibility test**

```ts
it("generates the native v1 format when explicitly requested", () => {
  const blueprint = generateWooCommerceBlueprint({ blueprintVersion: 1 });

  expect("version" in blueprint).toBe(false);
  expect(blueprint.preferredVersions).toEqual({ php: "8.0", wp: "latest" });
  expect(blueprint.features?.networking).toBe(true);
  expect(blueprint.phpExtensionBundles).toContain("kitchen-sink");
  expect(
    blueprint.steps?.filter((step) => step.step === "activatePlugin"),
  ).toHaveLength(0);
  expect(
    blueprint.steps?.find(
      (step) =>
        step.step === "installPlugin" &&
        "pluginData" in step &&
        step.pluginData?.slug === "woocommerce",
    ),
  ).toEqual(expect.objectContaining({ options: { activate: true } }));
});
```

- [ ] **Step 3: Add failing v2 customization and additional-step assertions**

```ts
it("maps custom options and v2 steps into native v2 fields", () => {
  const extraStep = {
    step: "runPHP" as const,
    code: { filename: "extra.php", content: "<?php echo 'extra';" },
  };
  const blueprint = generateWooCommerceBlueprint({
    siteName: "Test Store",
    php: "8.3",
    wp: "6.8",
    landingPage: "/shop/",
    additionalPlugins: ["akismet"],
    additionalSteps: [extraStep],
  });

  expect(blueprint.phpVersion).toBe("8.3");
  expect(blueprint.wordpressVersion).toBe("6.8");
  expect(
    blueprint.applicationOptions?.["wordpress-playground"].landingPage,
  ).toBe("/shop/");
  expect(blueprint.plugins).toEqual(["woocommerce", "akismet"]);
  expect(blueprint.siteOptions?.blogname).toBe("Test Store");
  expect(blueprint.additionalStepsAfterExecution).toContain(extraStep);
});
```

- [ ] **Step 4: Run the focused tests and verify the v2 contract fails**

```bash
pnpm exec vitest run test/blueprint.test.ts
```

Expected: FAIL because the current generator has no `version`, `phpVersion`, `applicationOptions`, `muPlugins`, or `additionalStepsAfterExecution`.

- [ ] **Step 5: Define the versioned Blueprint type surface**

Refactor `src/blueprint/types.ts` so the existing interface is exported as `BlueprintV1`, the existing `BlueprintStep` union is exported as `BlueprintV1Step`, and the v2 surface comes directly from the matching official package:

```ts
import type { BlueprintV2Declaration as PlaygroundBlueprintV2 } from "@wp-playground/blueprints";

export type BlueprintVersion = 1 | 2;
export type BlueprintV2 = PlaygroundBlueprintV2;
export type BlueprintV2Step = NonNullable<
  BlueprintV2["additionalStepsAfterExecution"]
>[number];
export type Blueprint = BlueprintV1 | BlueprintV2;
export type BlueprintStep = BlueprintV1Step;
```

Keep `BlueprintStep` as a compatibility alias for existing v1 consumers. Add an official schema-validation test for the generated v2 document so runtime output and exported types remain aligned.

- [ ] **Step 6: Add discriminated generator options and overloads**

In `src/blueprint/generator.ts`, define:

```ts
interface SharedBlueprintGeneratorOptions {
  siteName?: string;
  products?: ProductImport[];
  landingPage?: string;
  php?: string;
  wp?: string;
  additionalPlugins?: string[];
}

export interface BlueprintV1GeneratorOptions
  extends SharedBlueprintGeneratorOptions {
  blueprintVersion: 1;
  additionalSteps?: BlueprintV1Step[];
}

export interface BlueprintV2GeneratorOptions
  extends SharedBlueprintGeneratorOptions {
  blueprintVersion?: 2;
  additionalSteps?: BlueprintV2Step[];
}

export type BlueprintGeneratorOptions =
  | BlueprintV1GeneratorOptions
  | BlueprintV2GeneratorOptions;

export function generateWooCommerceBlueprint(
  options: BlueprintV1GeneratorOptions,
): BlueprintV1;
export function generateWooCommerceBlueprint(
  options?: BlueprintV2GeneratorOptions,
): BlueprintV2;
export function generateWooCommerceBlueprint(
  options: BlueprintGeneratorOptions = {},
): Blueprint {
  return options.blueprintVersion === 1
    ? generateWooCommerceBlueprintV1(options)
    : generateWooCommerceBlueprintV2(options);
}
```

- [ ] **Step 7: Isolate the shared configuration and PHP payloads**

Extract the current site options object and PHP strings into private constants/functions in `src/blueprint/generator.ts`:

```ts
const BLUEPRINT_SCHEMA_URL =
  "https://playground.wordpress.net/blueprint-schema.json";

function getWooCommerceSiteOptions(
  siteName: string,
): Record<string, JsonValue> {
  return {
    blogname: siteName,
    woocommerce_store_city: "New York",
    woocommerce_store_address: "123 Main St",
    woocommerce_store_postcode: "10001",
    woocommerce_default_country: "US:NY",
    woocommerce_onboarding_profile: { skipped: true },
    woocommerce_currency: "USD",
    woocommerce_weight_unit: "lbs",
    woocommerce_dimension_unit: "in",
    woocommerce_allow_tracking: "no",
    woocommerce_cheque_settings: { enabled: "yes" },
    woocommerce_cod_settings: { enabled: "yes" },
    woocommerce_bacs_settings: { enabled: "yes" },
    woocommerce_calc_taxes: "yes",
    woocommerce_enable_coupons: "yes",
    woocommerce_enable_reviews: "yes",
    woocommerce_enable_review_rating: "yes",
    woocommerce_manage_stock: "yes",
    woocommerce_notify_low_stock: "yes",
    woocommerce_notify_no_stock: "yes",
    woocommerce_stock_email_recipient: "admin@example.com",
    woocommerce_notify_low_stock_amount: 2,
    woocommerce_notify_no_stock_amount: 0,
    woocommerce_enable_guest_checkout: "yes",
    woocommerce_enable_checkout_login_reminder: "yes",
    woocommerce_enable_signup_and_login_from_checkout: "yes",
    woocommerce_enable_myaccount_registration: "yes",
    woocommerce_registration_generate_username: "yes",
    woocommerce_registration_generate_password: "yes",
  };
}

function inlinePHP(filename: string, content: string): InlineFileReference {
  return { filename, content };
}
```

Move the existing literals without editing their contents: `generateProductImportScript()` at `src/blueprint/generator.ts:51`, the debug helper beginning at line 423, the WooCommerce database setup beginning at line 465, the sample-product PHP beginning at line 587, and the Playground helper beginning at line 779. Name the extracted constants `DEBUG_CONFIG_PHP`, `WOOCOMMERCE_SETUP_PHP`, `SAMPLE_PRODUCTS_PHP`, and `PLAYGROUND_HELPERS_PHP`; keep `generateProductImportScript()` as the product-aware function.

- [ ] **Step 8: Preserve the current v1 generator behind the explicit helper**

Move the current v1 object construction into:

```ts
function generateWooCommerceBlueprintV1(
  options: BlueprintV1GeneratorOptions,
): BlueprintV1;
```

Use `getWooCommerceSiteOptions(siteName)` for the `setSiteOptions` step, keep `phpExtensionBundles: ["kitchen-sink"]`, keep the current step ordering, and append `options.additionalSteps` before the final Playground helper exactly as the existing generator does.

- [ ] **Step 9: Implement the native v2 generator**

Construct the v2 document with this shape:

```ts
function generateWooCommerceBlueprintV2(
  options: BlueprintV2GeneratorOptions,
): BlueprintV2 {
  const {
    siteName = "My WooCommerce Store",
    products = [],
    landingPage = "/wp-admin/",
    php = "8.0",
    wp = "latest",
    additionalPlugins = [],
    additionalSteps = [],
  } = options;

  return {
    version: 2,
    $schema: BLUEPRINT_SCHEMA_URL,
    phpVersion: php,
    wordpressVersion: wp,
    applicationOptions: {
      "wordpress-playground": {
        landingPage,
        login: true,
        networkAccess: true,
      },
    },
    plugins: ["woocommerce", ...additionalPlugins],
    siteOptions: {
      ...getWooCommerceSiteOptions(siteName),
      permalink_structure: "/%postname%/",
    },
    muPlugins: [
      inlinePHP("debug-config.php", DEBUG_CONFIG_PHP),
      inlinePHP("playground-helpers.php", PLAYGROUND_HELPERS_PHP),
    ],
    additionalStepsAfterExecution: [
      {
        step: "runPHP",
        code: inlinePHP("woocommerce-setup.php", WOOCOMMERCE_SETUP_PHP),
      },
      {
        step: "runPHP",
        code: inlinePHP(
          products.length > 0 ? "import-products.php" : "sample-products.php",
          products.length > 0
            ? generateProductImportScript(products)
            : SAMPLE_PRODUCTS_PHP,
        ),
      },
      ...additionalSteps,
    ],
  };
}
```

- [ ] **Step 10: Run the focused tests and typecheck**

```bash
pnpm exec vitest run test/blueprint.test.ts
pnpm typecheck
```

Expected: all Blueprint tests pass and TypeScript reports no errors.

- [ ] **Step 11: Rebuild the checked-in default Blueprint**

```bash
pnpm run build:blueprint
```

Expected: `blueprint.json` starts with `"version": 2`, contains native v2 fields, and has no top-level `steps`.

- [ ] **Step 12: Commit native v1/v2 generation**

```bash
git add src/blueprint/types.ts src/blueprint/generator.ts src/blueprint/build-blueprint.ts test/blueprint.test.ts blueprint.json
git commit -m "feat: generate Blueprint v2 by default"
```

---

### Task 3: Add auto-detection and same-version merging

**Files:**

- Create: `src/blueprint/merge.ts`
- Create: `test/blueprint-merge.test.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: parsed custom JSON as `unknown`, optional requested version, generated `BlueprintV1 | BlueprintV2`.
- Produces: `detectBlueprintVersion(value): 1 | 2`, `resolveBlueprintVersion(custom, requested): 1 | 2`, and `mergeBlueprints(base, custom): Blueprint` with same-version enforcement.

- [ ] **Step 1: Write failing version-detection tests**

Create `test/blueprint-merge.test.ts` with:

```ts
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

  it("rejects a requested version that conflicts with the custom file", () => {
    expect(() => resolveBlueprintVersion({ version: 2 }, 1)).toThrow(
      "Requested Blueprint v1 conflicts with custom Blueprint v2",
    );
  });
});
```

- [ ] **Step 2: Write failing v1 and v2 merge tests**

Add tests that assert:

```ts
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
  const v1 = { steps: [] };
  const v2 = { version: 2 as const };
  expect(() => mergeBlueprints(v1, v2)).toThrow(
    "Cannot merge Blueprint v1 with Blueprint v2",
  );
});
```

- [ ] **Step 3: Run the merge tests and verify the module is missing**

```bash
pnpm exec vitest run test/blueprint-merge.test.ts
```

Expected: FAIL because `src/blueprint/merge.ts` does not exist.

- [ ] **Step 4: Implement detection and selection**

Create `src/blueprint/merge.ts` with a record guard and these rules:

```ts
export function detectBlueprintVersion(value: unknown): BlueprintVersion {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Blueprint must be a JSON object");
  }
  if (!("version" in value)) return 1;
  if ((value as { version?: unknown }).version === 2) return 2;
  throw new Error(
    `Unsupported Blueprint version: ${JSON.stringify((value as { version?: unknown }).version)}`,
  );
}

export function resolveBlueprintVersion(
  custom: unknown | undefined,
  requested?: BlueprintVersion,
): BlueprintVersion {
  const detected =
    custom === undefined ? undefined : detectBlueprintVersion(custom);
  if (requested && detected && requested !== detected) {
    throw new Error(
      `Requested Blueprint v${requested} conflicts with custom Blueprint v${detected}`,
    );
  }
  return requested ?? detected ?? 2;
}
```

- [ ] **Step 5: Implement exhaustive same-version merging**

Add private `mergeBlueprintsV1` and `mergeBlueprintsV2` functions. Preserve the current v1 merge logic. For v2:

```ts
function mergeBlueprintsV2(
  base: BlueprintV2,
  custom: BlueprintV2,
): BlueprintV2 {
  return {
    ...base,
    ...custom,
    version: 2,
    applicationOptions: custom.applicationOptions
      ? {
          "wordpress-playground": {
            ...base.applicationOptions?.["wordpress-playground"],
            ...custom.applicationOptions["wordpress-playground"],
          },
        }
      : base.applicationOptions,
    siteOptions: custom.siteOptions
      ? { ...base.siteOptions, ...custom.siteOptions }
      : base.siteOptions,
    constants: custom.constants
      ? { ...base.constants, ...custom.constants }
      : base.constants,
    postTypes: custom.postTypes
      ? { ...base.postTypes, ...custom.postTypes }
      : base.postTypes,
    fonts: custom.fonts ? { ...base.fonts, ...custom.fonts } : base.fonts,
    plugins: appendWhenCustom(base.plugins, custom.plugins),
    themes: appendWhenCustom(base.themes, custom.themes),
    muPlugins: appendWhenCustom(base.muPlugins, custom.muPlugins),
    content: appendWhenCustom(base.content, custom.content),
    media: appendWhenCustom(base.media, custom.media),
    users: appendWhenCustom(base.users, custom.users),
    roles: appendWhenCustom(base.roles, custom.roles),
    additionalStepsAfterExecution: appendWhenCustom(
      base.additionalStepsAfterExecution,
      custom.additionalStepsAfterExecution,
    ),
  };
}
```

`appendWhenCustom` returns the base array unchanged when the custom field is absent, and otherwise returns `[...(base ?? []), ...custom]`.

- [ ] **Step 6: Export the merge API and run tests**

Add this to `src/index.ts`:

```ts
export * from "./blueprint/merge";
```

Run:

```bash
pnpm exec vitest run test/blueprint-merge.test.ts
pnpm typecheck
```

Expected: all merge tests pass and TypeScript reports no errors.

- [ ] **Step 7: Commit detection and merging**

```bash
git add src/blueprint/merge.ts src/index.ts test/blueprint-merge.test.ts
git commit -m "feat: auto-detect Blueprint versions"
```

---

### Task 4: Integrate v1/v2 selection into the CLI and remove dead mount state

**Files:**

- Modify: `src/cli/index.ts`
- Modify: `test/cli.smoke.test.ts`

**Interfaces:**

- Consumes: `--blueprint-version=1|2`, optional custom JSON, `resolveBlueprintVersion`, `mergeBlueprints`, and pass-through Playground arguments.
- Produces: v2 default CLI runs, auto-detected custom v1/v2 runs, mismatch diagnostics, unchanged mount forwarding, updated help.

- [ ] **Step 1: Add failing help and validation smoke tests**

Extend `test/cli.smoke.test.ts`:

```ts
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
```

Factor the existing repeated spawn/output collection in the test into a local `runCli(args)` helper returning `{ exitCode, stdout, stderr, combinedOutput }` without changing the existing assertions.

- [ ] **Step 2: Add a failing custom-version mismatch smoke test**

Write a v1 JSON object to a temporary file and run:

```ts
const result = await runCli([
  "server",
  `--blueprint=${blueprintPath}`,
  "--blueprint-version=2",
]);
expect(result.exitCode).toBe(1);
expect(result.combinedOutput).toContain(
  "Requested Blueprint v2 conflicts with custom Blueprint v1",
);
```

Ensure the test removes its temporary directory in `finally`.

- [ ] **Step 3: Run smoke tests and verify the new behavior fails**

```bash
pnpm run build
pnpm exec vitest run test/cli.smoke.test.ts
```

Expected: the new assertions fail because the flag is undocumented and currently forwarded to Playground.

- [ ] **Step 4: Parse the wc-now version option without forwarding it**

In `src/cli/index.ts`:

```ts
let requestedBlueprintVersion: BlueprintVersion | undefined;
```

Handle the argument before the generic pass-through branch:

```ts
} else if (arg.startsWith("--blueprint-version=")) {
	const value = arg.split("=")[1];
	if (value !== "1" && value !== "2") {
		throw new Error(
			`Blueprint version must be 1 or 2; received ${value}`,
		);
	}
	requestedBlueprintVersion = Number(value) as BlueprintVersion;
```

Do not append this wc-now-only option to `playgroundArgs`.

- [ ] **Step 5: Load and detect custom JSON before generation**

Replace the current generate-then-read order with:

```ts
let customBlueprint: Blueprint | undefined;
if (customBlueprintPath) {
  const resolvedPath = resolve(customBlueprintPath);
  if (!existsSync(resolvedPath)) {
    console.error(`❌ Blueprint file not found: ${customBlueprintPath}`);
    process.exit(1);
  }
  customBlueprint = JSON.parse(readFileSync(resolvedPath, "utf-8"));
}

const blueprintVersion = resolveBlueprintVersion(
  customBlueprint,
  requestedBlueprintVersion,
);
```

Generate with `blueprintVersion`, fetch/transform products as today, regenerate with the same version when products are found, then merge `customBlueprint` last.

- [ ] **Step 6: Remove dead mount collection while preserving forwarding**

Delete:

```ts
const mounts: string[] = [];
```

Change the mount branch to:

```ts
} else if (arg.startsWith("--mount=")) {
	playgroundArgs.push(arg);
```

No other mount behavior changes.

- [ ] **Step 7: Remove the local merge function and update help**

Import `mergeBlueprints`, `resolveBlueprintVersion`, and `BlueprintVersion` from the Blueprint modules. Delete the old local `mergeBlueprints` implementation.

Add help text:

```text
  --blueprint-version=<1|2>  Generated Blueprint version (default: 2; custom files auto-detected)
  --auto-mount               Automatically mount the current directory as a plugin/theme
```

Retain `--autoMount` as an accepted alias in parsing, but show canonical kebab-case in examples.

- [ ] **Step 8: Build and run smoke tests**

```bash
pnpm run build
pnpm exec vitest run test/cli.smoke.test.ts
```

Expected: all smoke tests pass, including invalid-version and mismatch exits.

- [ ] **Step 9: Commit the CLI integration**

```bash
git add src/cli/index.ts test/cli.smoke.test.ts
git commit -m "feat: select Blueprint versions in CLI"
```

---

### Task 5: Fix Store API trailing-slash normalization

**Files:**

- Create: `test/wc-public-api-client.test.ts`
- Modify: `src/wc-public-api/client.ts`

**Interfaces:**

- Consumes: store base URLs with or without one trailing slash.
- Produces: one canonical request URL with `/wp-json/wc/store/v1` appended exactly once.

- [ ] **Step 1: Write the failing URL regression test**

Create `test/wc-public-api-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { WCStoreApiClient } from "../src/wc-public-api/client";

describe("WCStoreApiClient URL normalization", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["https://example.com", "https://example.com/"])(
    "requests the canonical Store API URL for %s",
    async (storeUrl) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response([], {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-WP-Total": "0",
            "X-WP-TotalPages": "0",
          },
        }),
      );

      await new WCStoreApiClient(storeUrl).getProducts({
        page: 1,
        per_page: 10,
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://example.com/wp-json/wc/store/v1/products?page=1&per_page=10",
        expect.any(Object),
      );
    },
  );
});
```

- [ ] **Step 2: Run the regression test and verify only the trailing-slash case fails**

```bash
pnpm exec vitest run test/wc-public-api-client.test.ts
```

Expected: one case passes and `https://example.com/` fails with a double slash before `wp-json`.

- [ ] **Step 3: Correct the regex**

In `src/wc-public-api/client.ts`, replace:

```ts
this.baseUrl = storeUrl.replace(/\/$core/, "");
```

with:

```ts
this.baseUrl = storeUrl.replace(/\/$/, "");
```

- [ ] **Step 4: Run the regression and full unit suites**

```bash
pnpm exec vitest run test/wc-public-api-client.test.ts
pnpm test
```

Expected: both URL cases and all unit/smoke tests pass.

- [ ] **Step 5: Commit the Store API fix**

```bash
git add src/wc-public-api/client.ts test/wc-public-api-client.test.ts
git commit -m "fix: normalize Store API base URLs"
```

---

### Task 6: Update the v2 example, README, and release notes

**Files:**

- Modify: `examples/custom-blueprint.json`
- Modify: `test/blueprint.test.ts`
- Modify: `readme.md`
- Create: `.changeset/playground-v2-default.md`

**Interfaces:**

- Consumes: implemented CLI flags, auto-detection rules, v1/v2 generator API, and v2 schema fields.
- Produces: maintained v2 example, documentation matching runtime behavior, and a major Changeset for the default-output/API change.

- [ ] **Step 1: Add a failing maintained-example regression test**

In `test/blueprint.test.ts`, import `readFileSync` and add:

```ts
it("keeps the custom example on v2 without standalone plugin activation", () => {
  const example = JSON.parse(
    readFileSync(
      new URL("../examples/custom-blueprint.json", import.meta.url),
      "utf8",
    ),
  );

  expect(example.version).toBe(2);
  expect(example.plugins).toContain("productbird");
  expect(example.additionalStepsAfterExecution ?? []).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ step: "activatePlugin" }),
    ]),
  );
});
```

- [ ] **Step 2: Run the focused test and verify the v1 example fails it**

```bash
pnpm exec vitest run test/blueprint.test.ts
```

Expected: FAIL because the example has no `version: 2` and contains standalone `activatePlugin`.

- [ ] **Step 3: Convert the custom example to native v2**

Use this structure while retaining its Amsterdam/EUR settings and custom mu-plugin content:

```json
{
  "$schema": "https://playground.wordpress.net/blueprint-schema.json",
  "version": 2,
  "applicationOptions": {
    "wordpress-playground": {
      "landingPage": "/wp-admin/admin.php?page=wc-admin"
    }
  },
  "phpVersion": "8.2",
  "wordpressVersion": "6.4",
  "plugins": ["wordpress-seo", "productbird"],
  "siteOptions": {
    "woocommerce_currency": "EUR",
    "woocommerce_default_country": "NL",
    "woocommerce_store_city": "Amsterdam"
  },
  "muPlugins": [
    {
      "filename": "custom-tweaks.php",
      "content": "<?php\n// Custom tweaks for development\nadd_filter('woocommerce_admin_features', function($features) {\n    $features[] = 'analytics';\n    $features[] = 'remote-inbox-notifications';\n    return $features;\n});"
    }
  ]
}
```

- [ ] **Step 4: Rewrite README Blueprint documentation**

Update `readme.md` to include all of these exact behavior points:

- Requirements show Node.js `>=20.18.0`.
- Features say native Blueprint v2 generation plus v1 compatibility.
- Basic usage says v2 is the default.
- Options include `--blueprint-version=<1|2>` with default 2 and canonical `--auto-mount` plus the legacy alias note.
- Custom Blueprint documentation says `version: 2` selects v2 and an absent version selects v1; an explicit conflicting flag is an error.
- Replace the current v1 JSON example with the maintained v2 field names.
- Document v2 merge fields separately from retained v1 merge semantics.
- Default configuration says v2 uses `plugins`, `siteOptions`, `muPlugins`, and `additionalStepsAfterExecution`; v1 uses install steps when explicitly selected.
- Programmatic examples show the default v2 return and `{ blueprintVersion: 1 }` opt-in.
- The options table explains that `additionalSteps` is version-specific.
- Testing documentation says integration covers default v2 and auto-detected custom v1 boot paths.

- [ ] **Step 5: Add the major Changeset**

Create `.changeset/playground-v2-default.md`:

```md
---
"wc-now": major
---

Upgrade WordPress Playground to 3.1.45 and generate native Blueprint v2 by default. Blueprint v1 remains available with `blueprintVersion: 1`, and custom Blueprint files are auto-detected by version. Also fix Store API trailing-slash URLs, preserve mount forwarding while removing dead CLI state, and modernize the custom Blueprint example.
```

- [ ] **Step 6: Run tests, typecheck, and documentation formatting checks**

```bash
pnpm exec vitest run test/blueprint.test.ts
pnpm typecheck
pnpm exec prettier --check readme.md examples/custom-blueprint.json .changeset/playground-v2-default.md
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit examples and documentation**

```bash
git add examples/custom-blueprint.json test/blueprint.test.ts readme.md .changeset/playground-v2-default.md
git commit -m "docs: describe Blueprint v2 defaults"
```

---

### Task 7: Prove mount forwarding and both Blueprint boot paths

**Files:**

- Modify: `test/cli.integration.test.ts`
- Create: `test/test-plugin/mounted.txt`

**Interfaces:**

- Consumes: built CLI, default v2 Blueprint generation, custom versionless v1 JSON, `--mount=` pass-through, Playground 3.1.45 runtime.
- Produces: end-to-end evidence that default v2 boots WooCommerce, mounts reach the VFS, and legacy custom v1 files still boot.

- [ ] **Step 1: Add a mount fixture and failing end-to-end assertion**

Create `test/test-plugin/mounted.txt` containing:

```text
wc-now mount forwarding works
```

Pass this argument to the default integration server:

```ts
const mountPath = join(__dirname, "test-plugin");
`--mount=${mountPath}:/wordpress/wp-content/plugins/test-plugin`;
```

After the server responds, assert:

```ts
const mountedResponse = await fetch(
  `${serverUrl}/wp-content/plugins/test-plugin/mounted.txt`,
);
expect(mountedResponse.status).toBe(200);
expect(await mountedResponse.text()).toContain("wc-now mount forwarding works");
```

- [ ] **Step 2: Make the custom integration Blueprint an explicit versionless v1 fixture**

Keep the existing custom object versionless and include a v1 step:

```ts
const customBlueprint = {
  preferredVersions: { php: "8.2" },
  steps: [
    {
      step: "setSiteOptions",
      options: { blogname: "Test WooCommerce Store" },
    },
  ],
};
```

Do not pass `--blueprint-version`; successful boot proves auto-detection chose v1.

- [ ] **Step 3: Build with the final dependency graph**

```bash
pnpm run build
```

Expected: Vite and declaration generation pass, `build:blueprint` writes v2 `blueprint.json`, and only the existing empty `blueprint/types` chunk warning may appear.

- [ ] **Step 4: Run the integration suite and investigate any v2 runtime failure before changing code**

```bash
pnpm test:integration
```

Expected: both the default v2 WooCommerce boot and versionless custom v1 boot pass; the mount fixture returns HTTP 200. If v2 fails, capture the full Playground output, identify the unsupported field or PHP/runtime boundary, add the smallest focused regression test, then change only the responsible generator mapping.

- [ ] **Step 5: Commit integration coverage**

```bash
git add test/cli.integration.test.ts test/test-plugin/mounted.txt
git commit -m "test: cover v2 and legacy v1 Playground boots"
```

---

### Task 8: Run final verification and review the complete change

**Files:**

- Modify: source, test, JSON, Markdown, and Changeset files changed in Tasks 1-7 when the configured formatter reports a difference
- Add: `docs/superpowers/plans/2026-07-17-playground-3.1.45-blueprint-v2.md`

**Interfaces:**

- Consumes: complete implementation and approved design spec.
- Produces: fresh evidence for formatting, lint, unit tests, typechecking, build, integration, package contents, and requirement coverage.

- [ ] **Step 1: Apply project formatting to changed source files**

```bash
pnpm exec biome format --write src test
pnpm exec prettier --write readme.md examples/custom-blueprint.json .changeset/playground-v2-default.md docs/superpowers/plans/2026-07-17-playground-3.1.45-blueprint-v2.md
```

- [ ] **Step 2: Run static verification**

```bash
pnpm lint
pnpm typecheck
```

Expected: both commands exit 0 with no errors.

- [ ] **Step 3: Run all unit and smoke tests fresh**

```bash
pnpm test
```

Expected: every unit and smoke test passes with zero failures.

- [ ] **Step 4: Run the production build fresh**

```bash
pnpm run build
```

Expected: exit code 0, declarations are emitted, and `blueprint.json` is regenerated as v2.

- [ ] **Step 5: Run the real integration suite fresh**

```bash
pnpm test:integration
```

Expected: default v2 WooCommerce boot, mount forwarding, and auto-detected custom v1 boot all pass.

- [ ] **Step 6: Inspect the published package payload**

```bash
pnpm pack --dry-run
```

Expected: package payload contains `dist`, v2 `blueprint.json`, `readme.md`/`README.md` as npm reports it, and license files; it does not contain test fixtures or temporary Blueprint files.

- [ ] **Step 7: Review requirements and diff**

```bash
git diff --check HEAD~6
git status --short
git log --oneline -8
```

Then verify line-by-line:

- dependency and lock resolve 3.1.45 with a caret range;
- Node engine is 20.18.0 or newer;
- default generator and checked-in Blueprint are v2;
- explicit generator v1 and custom-file v1 auto-detection remain functional;
- custom v2 files merge natively;
- invalid/mismatched versions fail clearly;
- mount collector is gone and mount pass-through is end-to-end tested;
- Store API trailing slash has a red-green regression test;
- maintained example has no standalone activation;
- README and Changeset describe the public change.

- [ ] **Step 8: Commit formatting, plan, or verification-only adjustments**

If Step 1 changed tracked implementation files or the plan is still untracked:

```bash
git add src test readme.md examples/custom-blueprint.json blueprint.json package.json pnpm-lock.yaml .changeset/playground-v2-default.md docs/superpowers/plans/2026-07-17-playground-3.1.45-blueprint-v2.md
git commit -m "chore: finalize Playground v2 upgrade"
```

If only the plan is untracked, commit just the plan with the same message. If there are no remaining changes, do not create an empty commit.
