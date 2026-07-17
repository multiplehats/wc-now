# wc-now

A development tool that boots a **WordPress + WooCommerce** environment on top of the official [WordPress Playground CLI](https://www.npmjs.com/package/@wp-playground/cli). It generates a native Blueprint v2 with sensible WooCommerce defaults, sample products (or products cloned from a live store), and development-friendly settings, then hands it off to `@wp-playground/cli` to run. Blueprint v1 remains available for existing workflows.

> **Note:** wc-now is built on `@wp-playground/cli`, **not** `wp-now`. Earlier versions wrapped `wp-now`; that is no longer the case.

## Features

- 🚀 **Quick start** — a WooCommerce dev environment in one command
- 🛍️ **Pre-configured WooCommerce** — currency, store address, payments, taxes, and more set out of the box
- 📦 **Product import** — clone products from any WooCommerce store's Store API, or fall back to built-in sample products
- 🎨 **Blueprint v2 by default** — native v2 generation with automatic v1/v2 custom Blueprint detection
- 🐛 **Debug mode** — `WP_DEBUG` and friends pre-configured for development
- 🧩 **Programmatic API** — generate blueprints and query the WooCommerce Store API from your own code

## Requirements

- **Node.js** ≥ 20.18.0
- **pnpm** ≥ 9 (or npm)

## Installation

Run it directly, no install required:

```bash
npx wc-now start
```

Or install globally:

```bash
npm install -g wc-now
# or
pnpm add -g wc-now
```

## Usage

### Basic usage

Start a WooCommerce playground with the defaults:

```bash
npx wc-now start
```

This generates a WooCommerce Blueprint v2, writes it to a temporary file, and launches WordPress Playground CLI 3.1.45 or newer with:

- WordPress (latest) and PHP 8.0
- WooCommerce installed and activated
- WooCommerce configured with sensible defaults (see [Default configuration](#default-configuration))
- Sample products imported
- Pretty permalinks (`/%postname%/`)
- Debug mode enabled

The playground runs in the **foreground** — press `Ctrl+C` to stop it. The temporary blueprint file is cleaned up on exit.

### Commands

```
npx wc-now [command] [options]
```

| Command          | Description                                                    |
| ---------------- | -------------------------------------------------------------- |
| `start`          | Start a playground with WooCommerce defaults (default command) |
| `server`         | Start the Playground server                                    |
| `build-snapshot` | Passed through to the WordPress Playground CLI                 |
| `run-blueprint`  | Passed through to the WordPress Playground CLI                 |

If no command is given, `start` is used.

### Options

| Option                       | Default                | Description                                                                                 |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `--blueprint=<path>`         | –                      | Path to a custom blueprint JSON to **merge** with the WooCommerce defaults                  |
| `--source-url=<url>`         | –                      | Clone products (up to 10) from a WooCommerce store's Store API instead of using sample data |
| `--site-name=<name>`         | `My WooCommerce Store` | Store / site title                                                                          |
| `--port=<number>`            | `9400`                 | Port to serve on                                                                            |
| `--php=<version>`            | `8.0`                  | PHP version                                                                                 |
| `--wp=<version>`             | `latest`               | WordPress version                                                                           |
| `--blueprint-version=<1\|2>` | `2`                    | Generated Blueprint version; custom files are auto-detected                                 |
| `--mount=<paths>`            | –                      | Passed through to the WordPress Playground CLI                                              |
| `--auto-mount`               | –                      | Passed through to the WordPress Playground CLI (`server`); `--autoMount` remains an alias   |

Any other flags are passed through **unchanged** to the underlying `@wp-playground/cli`. Refer to the [WordPress Playground CLI docs](https://wordpress.github.io/wordpress-playground/) for the full list.

### Clone products from an existing store

Import products from any WooCommerce store with the Store API enabled:

```bash
npx wc-now start --source-url=https://example-store.com
```

This fetches up to 10 products from the source store and imports them with their names, descriptions, prices (regular and sale), categories, images, stock status, and SKUs. If the fetch fails or returns nothing, wc-now falls back to the built-in sample products.

### Custom Blueprints

Merge your own blueprint with the WooCommerce defaults:

```bash
npx wc-now start --blueprint=my-custom-blueprint.json
```

wc-now detects the format before generating its WooCommerce base:

- A custom file with `"version": 2` is merged with native v2 defaults.
- A versionless custom file is treated as v1 and merged with native v1 defaults, preserving existing files automatically.
- `--blueprint-version=1` or `--blueprint-version=2` explicitly selects a format when no custom file is supplied. If the flag conflicts with a custom file, wc-now exits with an error instead of mixing formats.

For v2, resource arrays such as `plugins`, `themes`, `muPlugins`, and `content` are appended in base-then-custom order. `additionalStepsAfterExecution` is appended, while `siteOptions`, `constants`, `applicationOptions`, `postTypes`, and `fonts` are shallow-merged with custom values winning. Runtime versions and other scalar fields are overridden when present.

V1 retains the previous merge behavior: `plugins`, `themes`, and `steps` append; `siteOptions`, `constants`, `features`, and `preferredVersions` shallow-merge; `phpExtensionBundles` concatenate and de-duplicate; and custom `landingPage` and `login` values override the defaults.

Example custom blueprint:

```json
{
  "$schema": "https://playground.wordpress.net/blueprint-schema.json",
  "version": 2,
  "phpVersion": "8.2",
  "wordpressVersion": "6.5",
  "plugins": ["wordpress-seo"],
  "siteOptions": {
    "woocommerce_currency": "EUR"
  },
  "applicationOptions": {
    "wordpress-playground": {
      "landingPage": "/wp-admin/plugins.php"
    }
  },
  "additionalStepsAfterExecution": [
    {
      "step": "runPHP",
      "code": {
        "filename": "custom.php",
        "content": "<?php update_option('my_custom_option', true);"
      }
    }
  ]
}
```

In v2, plugin slugs in `plugins` install and activate declaratively. In v1, prefer `installPlugin` with `"options": { "activate": true }` rather than a standalone `activatePlugin` step; wc-now's v1 output avoids the standalone step as well.

## Default configuration

### Included plugins

- **WooCommerce** — installed and activated through v2's declarative `plugins` field (or v1 `installPlugin` with `activate: true` when v1 is selected)

Additional plugins can be added through a custom blueprint or the programmatic `additionalPlugins` option.

### WooCommerce settings

Applied through v2's declarative `siteOptions` field or a v1 `setSiteOptions` step:

- Currency: **USD**
- Store address: 123 Main St, New York, `US:NY`, 10001
- Weight unit: `lbs`, dimension unit: `in`
- Taxes, coupons, reviews (with star ratings), and stock management: **enabled**
- Payment methods enabled: **Cheque, Cash on Delivery, Bank Transfer (BACS)**
- Guest checkout, checkout login reminder, and account registration (with auto-generated username/password): **enabled**
- Onboarding wizard: skipped; usage tracking: off

### Development settings

Applied through inline v2 `muPlugins` or v1 `writeFile` steps:

- `WP_DEBUG`: `true`
- `WP_DEBUG_LOG`: `true`
- `WP_DEBUG_DISPLAY`: `false`
- `SCRIPT_DEBUG`: `true`
- `WP_ENVIRONMENT_TYPE`: `development`

A helper mu-plugin also forces the admin bar on, disables core auto-update checks, and adds an admin notice indicating the WooCommerce-defaults playground is running.

## Programmatic usage

Everything is exported from the package root, including the Store API client:

```javascript
import {
  generateWooCommerceBlueprint,
  transformWooCommerceProducts,
  WCStoreApiClient,
} from "wc-now";

// Generate a native Blueprint v2 (the default)
const blueprintV2 = generateWooCommerceBlueprint({
  siteName: "My Store",
  php: "8.2",
  wp: "latest",
  additionalPlugins: ["wordpress-seo"],
  products: [], // ProductImport[]
});

// Opt into native Blueprint v1 for an existing workflow
const blueprintV1 = generateWooCommerceBlueprint({
  blueprintVersion: 1,
  siteName: "My Store",
});

// Query a live WooCommerce store's Store API
const client = new WCStoreApiClient("https://example-store.com");
const response = await client.getProducts({ per_page: 20 });
const products = transformWooCommerceProducts(response.data);
```

The Store API client is also available from the `wc-now/wc-public-api` subpath export:

```javascript
import { WCStoreApiClient } from "wc-now/wc-public-api";
```

### `generateWooCommerceBlueprint(options)`

Options are shared between both formats except for the version-specific `additionalSteps` type:

| Option              | Default                | Description                                                                                                      |
| ------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `blueprintVersion`  | `2`                    | Output format; set to `1` for native v1                                                                          |
| `siteName`          | `My WooCommerce Store` | Site title                                                                                                       |
| `products`          | `[]`                   | Products to import (`ProductImport[]`)                                                                           |
| `landingPage`       | `/wp-admin/`           | Landing page after boot                                                                                          |
| `php`               | `8.0`                  | PHP version                                                                                                      |
| `wp`                | `latest`               | WordPress version                                                                                                |
| `additionalPlugins` | `[]`                   | Extra plugin slugs to install and activate                                                                       |
| `additionalSteps`   | `[]`                   | V2 steps appended to `additionalStepsAfterExecution`, or v1 steps appended to `steps` when `blueprintVersion: 1` |

The package exports `BlueprintV1`, `BlueprintV2`, `BlueprintV1Step`, and `BlueprintV2Step` types. The default overload returns `BlueprintV2`; the `{ blueprintVersion: 1 }` overload returns `BlueprintV1`.

### `WCStoreApiClient`

`new WCStoreApiClient(storeUrl)` targets the WooCommerce Store API (`/wp-json/wc/store/v1`). Available methods include:

- `getProducts({ page?, per_page? })`, `getProduct(idOrSlug)`, `getProductVariations(params?)`
- `getProductCategories(params?)`, `getProductTags(params?)`, `getProductReviews(productId?, params?)`
- `getProductAttributes()`, `getProductAttribute(id)`, `getProductAttributeTerms(id, params?)`
- `getProductCollectionData(params?)`
- Async generators that page through everything: `getAllProducts()`, `getAllProductCategories()`, `getAllProductTags()`, `getAllProductReviews()`

## Testing

```bash
# Unit tests
pnpm test

# Build first, then run integration tests (they start a real playground)
pnpm build
pnpm test:integration

# Everything: unit → build → integration
pnpm test:all

# Watch mode
pnpm test:watch
```

The suite covers v1/v2 Blueprint generation and merging, product transforms, and Store API URL normalization (unit); CLI help and version-selection errors against the built `dist` output (smoke); and full `server` boots for the default v2 path and an auto-detected custom v1 file (integration). Integration tests require a build first and are marked flaky in CI.

## Development

```bash
pnpm build        # vite build + regenerate blueprint.json
pnpm typecheck    # tsc --noEmit
pnpm lint         # biome lint
pnpm format       # biome format --write
```

Releases are managed with [Changesets](https://github.com/changesets/changesets) and published to npm on push to `main`.

## Contributing

Contributions are welcome — please open an issue or pull request.

## License

ISC
