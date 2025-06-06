# WordPress WooCommerce Playground

A powerful development tool that extends [wp-now](https://www.npmjs.com/package/@wp-now/wp-now) with WooCommerce-specific defaults and features. This package provides a streamlined way to spin up WordPress environments with WooCommerce pre-configured, including sample products, development tools, and the ability to clone products from existing stores.

## Features

- 🚀 **Quick Start**: Get a WooCommerce development environment running in seconds
- 🛍️ **Pre-configured WooCommerce**: Includes sensible defaults for WooCommerce settings
- 📦 **Product Import**: Clone products from any existing WooCommerce store
- 🔧 **Developer Tools**: Includes Query Monitor for debugging
- 🎨 **Blueprint Support**: Merge custom blueprints with our defaults
- 🐛 **Debug Mode**: WordPress debug constants pre-configured for development

## Installation

You don't need to install this package globally. Use it directly with npx:

```bash
npx wc-now start
```

Or install globally:

```bash
npm install -g wc-now
```

## Usage

### Basic Usage

Start a WooCommerce playground with default settings:

```bash
npx wc-now start
```

This will:
- Install WordPress (latest version) with PHP 8.0
- Install and activate WooCommerce
- Configure WooCommerce with sensible defaults
- Import sample products
- Install Query Monitor for debugging
- Set up pretty permalinks
- Enable debug mode

### Clone Products from an Existing Store

Import products from any WooCommerce store that has the REST API enabled:

```bash
npx wc-now start --source-url=https://example-store.com
```

This will fetch up to 10 products from the source store and import them with their:
- Names and descriptions
- Prices (regular and sale)
- Categories
- Images
- Stock status
- SKUs

### Custom Blueprint

Merge your own blueprint with our defaults:

```bash
npx wc-now start --blueprint=my-custom-blueprint.json
```

Your custom blueprint will be merged with our defaults, allowing you to:
- Add additional plugins or themes
- Override settings
- Add custom steps
- Change PHP/WordPress versions

Example custom blueprint:

```json
{
  "preferredVersions": {
    "php": "7.4",
    "wp": "6.3"
  },
  "plugins": [
    "woocommerce-subscriptions",
    "woocommerce-memberships"
  ],
  "steps": [
    {
      "step": "installPlugin",
      "pluginData": {
        "resource": "wordpress.org/plugins",
        "slug": "wordpress-seo"
      }
    }
  ]
}
```

### All Options

```bash
npx wc-now start [options]

Additional Options:
  --blueprint=<path>     Path to a custom blueprint.json to merge with defaults
  --source-url=<url>     URL of a WooCommerce store to clone products from
  --site-name=<name>     Name for the WooCommerce store (default: "My WooCommerce Store")

All wp-now options are also supported:
  --path=<path>          Path to the WordPress project
  --php=<version>        PHP version (default: 8.0)
  --wp=<version>         WordPress version (default: latest)
  --port=<port>          Port number (default: 8881)
  --reset                Reset the WordPress installation
  --skip-browser         Skip opening the browser
```

## Default Configuration

### Included Plugins

- **WooCommerce** - The core e-commerce plugin
- **Query Monitor** - Debugging and performance monitoring

### WooCommerce Settings

- Currency: USD
- Country: United States (New York)
- Tax calculations enabled
- Coupons enabled
- Guest checkout enabled
- Account registration enabled
- Stock management enabled
- All payment methods enabled (Check, COD, Bank Transfer)

### Development Settings

- `WP_DEBUG`: true
- `WP_DEBUG_LOG`: true
- `WP_DEBUG_DISPLAY`: false
- `SCRIPT_DEBUG`: true
- `WP_ENVIRONMENT_TYPE`: 'development'

## Programmatic Usage

You can also use this package programmatically:

```javascript
import { generateWooCommerceBlueprint, transformWooCommerceProducts } from 'wc-now';
import { WCStoreApiClient } from 'wc-now/wc-public-api';

// Generate a blueprint
const blueprint = generateWooCommerceBlueprint({
  siteName: 'My Store',
  php: '8.2',
  wp: '6.4',
  additionalPlugins: ['wordpress-seo'],
  products: [] // Your product data
});

// Fetch products from a store
const client = new WCStoreApiClient('https://example-store.com');
const response = await client.getProducts({ per_page: 20 });
const products = transformWooCommerceProducts(response.data);
```

## Blueprint Structure

The generated blueprint includes:

1. **Plugin Installation**: WooCommerce and development tools
2. **Plugin Activation**: All plugins are automatically activated
3. **Permalinks**: Pretty permalinks are configured
4. **Site Options**: All WooCommerce settings are configured
5. **Debug Constants**: Development constants are defined
6. **Product Import**: Either from source URL or default sample data
7. **Helper Scripts**: MU-plugins for development assistance

## Testing

This package includes comprehensive tests:

```bash
# Run unit tests
npm test

# Run integration tests (requires building first)
npm run build
npm run test:integration

# Run all tests
npm run test:all

# Run tests in watch mode
npm run test:watch
```

### Test Structure

- **Unit Tests**: Test blueprint generation and product transformation
- **Smoke Tests**: Verify CLI functionality without starting a server
- **Integration Tests**: Test the full CLI by starting an actual wp-now instance

## Requirements

- Node.js 20 or higher
- npm or pnpm

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC