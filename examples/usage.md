# Usage Examples

## Basic Usage

Start a WooCommerce playground with all defaults:

```bash
npx wc-now start
```

## Custom PHP and WordPress Versions

```bash
npx wc-now start --php=7.4 --wp=6.3
```

## Clone Products from an Existing Store

```bash
npx wc-now start --source-url=https://demo.woothemes.com --site-name="My Demo Store"
```

## Use a Custom Blueprint

Create a `my-blueprint.json` file:

```json
{
  "preferredVersions": {
    "php": "8.2"
  },
  "plugins": [
    "wordpress-seo",
    "woocommerce-pdf-invoices-packing-slips"
  ],
  "steps": [
    {
      "step": "setSiteOptions",
      "options": {
        "woocommerce_currency": "EUR",
        "woocommerce_default_country": "DE"
      }
    }
  ]
}
```

Then run:

```bash
npx wc-now start --blueprint=my-blueprint.json
```

## Start in a Specific Directory

```bash
npx wc-now start --path=/path/to/my/plugin
```

## Skip Browser Opening

```bash
npx wc-now start --skip-browser
```

## Use a Custom Port

```bash
npx wc-now start --port=8080
```

## Programmatic Usage

```javascript
import { generateWooCommerceBlueprint } from 'wc-now';
import { WCStoreApiClient } from 'wc-now/wc-public-api';

async function createCustomPlayground() {
  // Fetch products from a live store
  const client = new WCStoreApiClient('https://example-store.com');
  const response = await client.getProducts({ per_page: 20 });

  // Generate blueprint with those products
  const blueprint = generateWooCommerceBlueprint({
    siteName: 'Development Store',
    products: transformWooCommerceProducts(response.data),
    additionalPlugins: ['wordpress-seo'],
    php: '8.2'
  });

  // Save the blueprint
  fs.writeFileSync('custom-blueprint.json', JSON.stringify(blueprint, null, 2));
}
```

## Advanced Blueprint Example

Here's a more complex blueprint that sets up a complete development environment:

```json
{
  "$schema": "https://playground.wordpress.net/blueprint-schema.json",
  "landingPage": "/wp-admin/admin.php?page=wc-admin&path=%2Fanalytics%2Foverview",
  "preferredVersions": {
    "php": "8.2",
    "wp": "6.4"
  },
  "plugins": [
    "wordpress-seo",
    "woocommerce-subscriptions",
    "woocommerce-memberships",
    "mailpoet"
  ],
  "steps": [
    {
      "step": "setSiteOptions",
      "options": {
        "woocommerce_currency": "GBP",
        "woocommerce_default_country": "GB",
        "woocommerce_store_city": "London",
        "woocommerce_store_address": "221B Baker Street",
        "woocommerce_store_postcode": "NW1 6XE"
      }
    },
    {
      "step": "writeFile",
      "path": "/wordpress/wp-content/mu-plugins/dev-helpers.php",
      "data": "<?php\n// Enable all WooCommerce features\nadd_filter('woocommerce_admin_features', function($features) {\n    return array_merge($features, [\n        'analytics',\n        'coupons',\n        'customer-effort-score-tracks',\n        'import-products-task',\n        'experimental-fashion-sample-products',\n        'shipping-smart-defaults',\n        'shipping-setting-tour',\n        'homescreen',\n        'marketing',\n        'mobile-app-banner',\n        'navigation',\n        'onboarding',\n        'onboarding-tasks',\n        'remote-inbox-notifications',\n        'remote-free-extensions',\n        'payment-gateway-suggestions',\n        'shipping-label-banner',\n        'subscriptions',\n        'store-alerts',\n        'transient-notices',\n        'woo-mobile-welcome',\n        'wc-pay-promotion',\n        'wc-pay-welcome-page'\n    ]);\n});\n\n// Auto-login as admin\nadd_action('init', function() {\n    if (!is_user_logged_in()) {\n        $user = get_user_by('login', 'admin');\n        if ($user) {\n            wp_set_current_user($user->ID);\n            wp_set_auth_cookie($user->ID);\n        }\n    }\n});"
    },
    {
      "step": "runSQL",
      "sql": "INSERT INTO wp_users (user_login, user_pass, user_nicename, user_email, user_status, display_name) VALUES ('developer', MD5('developer'), 'developer', 'dev@example.com', 0, 'Developer');"
    }
  ]
}
```