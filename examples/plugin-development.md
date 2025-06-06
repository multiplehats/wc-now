# Plugin Development with wc-now

This guide shows how to use `wc-now` for WordPress plugin development, especially WooCommerce extensions.

## Quick Start

### Method 1: Auto-Mount (Recommended)

When you're inside a plugin directory, simply run:

```bash
cd my-awesome-plugin
npx wc-now server --autoMount
```

This will:
1. Automatically detect that you're in a plugin directory
2. Mount your plugin to `/wordpress/wp-content/plugins/my-awesome-plugin`
3. Activate the plugin automatically
4. Start WordPress with WooCommerce pre-installed

### Method 2: Manual Mount

You can also manually specify where to mount your plugin:

```bash
npx wc-now server --mount=/path/to/my-plugin:/wordpress/wp-content/plugins/my-plugin
```

## Example: Developing a WooCommerce Extension

Let's say you're developing a WooCommerce shipping method plugin:

```bash
# Navigate to your plugin directory
cd ~/projects/wc-custom-shipping

# Start the development server
npx wc-now server --autoMount
```

Your plugin structure might look like:
```
wc-custom-shipping/
├── wc-custom-shipping.php
├── includes/
│   └── class-shipping-method.php
├── assets/
│   ├── css/
│   └── js/
└── readme.txt
```

The `--autoMount` flag will:
- Detect the plugin header in `wc-custom-shipping.php`
- Mount the entire directory as a plugin
- Activate it automatically
- Give you a WordPress site with WooCommerce ready to test

## Working with Multiple Plugins

If you need to test multiple plugins together:

```bash
npx wc-now server \
  --mount=/path/to/plugin-1:/wordpress/wp-content/plugins/plugin-1 \
  --mount=/path/to/plugin-2:/wordpress/wp-content/plugins/plugin-2 \
  --autoMount
```

The `--autoMount` will handle the current directory, while `--mount` adds additional plugins.

## Theme Development

The same approach works for themes:

```bash
cd my-woocommerce-theme
npx wc-now server --autoMount
```

If your directory contains a `style.css` with a valid theme header, it will be:
- Mounted to `/wordpress/wp-content/themes/my-woocommerce-theme`
- Activated automatically

## Full WordPress Development

If you're working on a complete WordPress installation:

```bash
cd my-wordpress-site
npx wc-now server --autoMount
```

When the current directory contains `wp-admin`, `wp-includes`, and `wp-content`, the tool will:
- Mount your files appropriately
- Skip the WordPress installation step
- Use your existing WordPress setup

## Tips for Plugin Development

1. **Hot Reload**: Changes to your PHP files are reflected immediately - just refresh the browser
2. **Debug Mode**: WooCommerce and WordPress debug modes are enabled by default
3. **Query Monitor**: Included by default for debugging
4. **Sample Data**: WooCommerce sample products are imported automatically

## Common Scenarios

### Testing with Specific PHP/WordPress Versions

```bash
npx wc-now server --autoMount --php=7.4 --wp=6.3
```

### Testing with Production Data

```bash
npx wc-now server --autoMount --source-url=https://mystore.com
```

This will clone products from your production store for realistic testing.

### Custom Blueprint for Complex Setups

Create a `blueprint.json`:
```json
{
  "steps": [
    {
      "step": "installPlugin",
      "pluginZipFile": {
        "resource": "wordpress.org/plugins",
        "slug": "woocommerce-subscriptions"
      }
    }
  ]
}
```

Then run:
```bash
npx wc-now server --autoMount --blueprint=blueprint.json
```

## Troubleshooting

### Plugin Not Detected

Make sure your main plugin file has a valid plugin header:
```php
<?php
/**
 * Plugin Name: My Plugin
 * Description: Description here
 * Version: 1.0.0
 */
```

### Changes Not Reflected

The mounted directories use your local filesystem directly, so changes should be immediate. If not:
1. Check for PHP syntax errors
2. Clear browser cache
3. Check the browser console for JavaScript errors

### Port Already in Use

Use a different port:
```bash
npx wc-now server --autoMount --port=9401
```