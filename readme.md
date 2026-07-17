# wc-now

A development tool that boots a **WordPress + WooCommerce** environment on top of the official [WordPress Playground CLI](https://www.npmjs.com/package/@wp-playground/cli). It generates a WooCommerce-ready [blueprint](https://wordpress.github.io/wordpress-playground/blueprints/) with sensible defaults, sample products (or products cloned from a live store), and development-friendly settings, then hands it off to `@wp-playground/cli` to run.

> **Note:** wc-now is built on `@wp-playground/cli`, **not** `wp-now`. Earlier versions wrapped `wp-now`; that is no longer the case.

## Features

- 🚀 **Quick start** — a WooCommerce dev environment in one command
- 🛍️ **Pre-configured WooCommerce** — currency, store address, payments, taxes, and more set out of the box
- 📦 **Product import** — clone products from any WooCommerce store's Store API, or fall back to built-in sample products
- 🎨 **Blueprint merging** — merge your own Playground blueprint with the WooCommerce defaults
- 🐛 **Debug mode** — `WP_DEBUG` and friends pre-configured for development
- 🧩 **Programmatic API** — generate blueprints and query the WooCommerce Store API from your own code

## Requirements

- **Node.js** ≥ 20
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

This generates a WooCommerce blueprint, writes it to a temporary file, and launches the WordPress Playground CLI with:

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

| Command | Description |
| --- | --- |
| `start` | Start a playground with WooCommerce defaults (default command) |
| `server` | Start the Playground server |
| `build-snapshot` | Passed through to the WordPress Playground CLI |
| `run-blueprint` | Passed through to the WordPress Playground CLI |

If no command is given, `start` is used.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `--blueprint=<path>` | – | Path to a custom blueprint JSON to **merge** with the WooCommerce defaults |
| `--source-url=<url>` | – | Clone products (up to 10) from a WooCommerce store's Store API instead of using sample data |
| `--site-name=<name>` | `My WooCommerce Store` | Store / site title |
| `--port=<number>` | `9400` | Port to serve on |
| `--php=<version>` | `8.0` | PHP version |
| `--wp=<version>` | `latest` | WordPress version |
| `--mount=<paths>` | – | Passed through to the WordPress Playground CLI |
| `--autoMount` | – | Passed through to the WordPress Playground CLI (`server`) |

Any other flags are passed through **unchanged** to the underlying `@wp-playground/cli`. Refer to the [WordPress Playground CLI docs](https://wordpress.github.io/wordpress-playground/) for the full list.

### Clone products from an existing store

Import products from any WooCommerce store with the Store API enabled:

```bash
npx wc-now start --source-url=https://example-store.com
```

This fetches up to 10 products from the source store and imports them with their names, descriptions, prices (regular and sale), categories, images, stock status, and SKUs. If the fetch fails or returns nothing, wc-now falls back to the built-in sample products.

### Custom blueprint

Merge your own blueprint with the WooCommerce defaults:

```bash
npx wc-now start --blueprint=my-custom-blueprint.json
```

Your blueprint is merged on top of the generated defaults: `plugins`, `themes`, and `steps` are **appended**; `siteOptions`, `constants`, `features`, and `preferredVersions` are shallow-merged; `phpExtensionBundles` are concatenated and de-duplicated; `landingPage` and `login` are overridden if you set them.

Example custom blueprint:

```json
{
  "preferredVersions": {
    "php": "8.2",
    "wp": "6.5"
  },
  "plugins": ["wordpress-seo"],
  "steps": [
    {
      "step": "installPlugin",
      "pluginData": {
        "resource": "wordpress.org/plugins",
        "slug": "wordpress-seo"
      },
      "options": { "activate": true }
    }
  ]
}
```

> **Tip:** Prefer activating plugins with `installPlugin` + `"options": { "activate": true }` rather than a standalone `activatePlugin` step. In `@wp-playground/cli` v3 the standalone step can fail on a missing log file and abort the whole blueprint; wc-now's own defaults avoid it for this reason.

## Default configuration

### Included plugins

- **WooCommerce** — installed and activated (via `installPlugin` with `activate: true`)

Additional plugins can be added through a custom blueprint or the programmatic `additionalPlugins` option.

### WooCommerce settings

Applied via a `setSiteOptions` step:

- Currency: **USD**
- Store address: 123 Main St, New York, `US:NY`, 10001
- Weight unit: `lbs`, dimension unit: `in`
- Taxes, coupons, reviews (with star ratings), and stock management: **enabled**
- Payment methods enabled: **Cheque, Cash on Delivery, Bank Transfer (BACS)**
- Guest checkout, checkout login reminder, and account registration (with auto-generated username/password): **enabled**
- Onboarding wizard: skipped; usage tracking: off

### Development settings

Applied via a `mu-plugins/debug-config.php` helper:

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

// Generate a blueprint (all options optional)
const blueprint = generateWooCommerceBlueprint({
  siteName: "My Store",
  php: "8.2",
  wp: "latest",
  additionalPlugins: ["wordpress-seo"],
  products: [], // ProductImport[]
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

All options are optional:

| Option | Default | Description |
| --- | --- | --- |
| `siteName` | `My WooCommerce Store` | Site title |
| `products` | `[]` | Products to import (`ProductImport[]`) |
| `landingPage` | `/wp-admin/` | Landing page after boot |
| `php` | `8.0` | PHP version |
| `wp` | `latest` | WordPress version |
| `additionalPlugins` | `[]` | Extra plugin slugs to install and activate |
| `additionalSteps` | `[]` | Extra blueprint steps appended to the end |

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

The suite covers blueprint generation and product transforms (unit), CLI help/error handling against the built `dist` output (smoke), and a full boot of the `server` command hitting `wp-admin` (integration). Integration tests require a build first and are marked flaky in CI.

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
