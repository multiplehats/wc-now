import type { Blueprint, BlueprintStep } from "./types";
import type { PublicWooCommerceProduct } from "../wc-public-api";

export interface ProductImport {
	name: string;
	description: string;
	short_description: string;
	price: string;
	regular_price: string;
	sale_price: string;
	sku: string;
	stock_status: string;
	categories: string[];
	images: string[];
	attributes: Array<{
		id: number;
		name: string;
		taxonomy: string;
		has_variations: boolean;
		terms: Array<{
			id: number;
			name: string;
			slug: string;
		}>;
	}>;
	variations: Array<{
		id: number;
		attributes: Array<{
			name: string;
			value: string | null;
		}>;
	}>;
}

export interface BlueprintGeneratorOptions {
	siteName?: string;
	products?: ProductImport[];
	landingPage?: string;
	php?: string;
	wp?: string;
	additionalPlugins?: string[];
	additionalSteps?: BlueprintStep[];
}

// Helper function to escape PHP strings
function escapePHP(str: string): string {
	return str.replace(/'/g, "\\'");
}

// Generate the product import PHP script
function generateProductImportScript(products: ProductImport[]): string {
	const productsPhpArray = products
		.map((product) => {
			return `array(
        'name' => '${escapePHP(product.name)}',
        'description' => '${escapePHP(product.description)}',
        'short_description' => '${escapePHP(product.short_description)}',
        'regular_price' => '${escapePHP(product.regular_price)}',
        'sale_price' => '${escapePHP(product.sale_price)}',
        'sku' => '${escapePHP(product.sku)}',
        'stock_status' => '${escapePHP(product.stock_status)}',
        'categories' => array(${product.categories.map((cat) => `'${escapePHP(cat)}'`).join(", ")}),
        'images' => array(${product.images.map((img) => `'${escapePHP(img)}'`).join(", ")})
      )`;
		})
		.join(",\n");

	return `<?php
// Ensure WordPress is loaded
if (!defined('ABSPATH')) {
    // Try to load WordPress - this handles different environments
    if (file_exists('/wordpress/wp-load.php')) {
        require_once('/wordpress/wp-load.php');
    } elseif (file_exists(dirname(__FILE__) . '/../../wp-load.php')) {
        require_once(dirname(__FILE__) . '/../../wp-load.php');
    } elseif (file_exists(dirname(__FILE__) . '/../../../wp-load.php')) {
        require_once(dirname(__FILE__) . '/../../../wp-load.php');
    } else {
        error_log('Could not find wp-load.php');
        exit(1);
    }
}

// Wait for WooCommerce to be fully loaded
if (!class_exists('WC_Product')) {
    error_log('WooCommerce is not active, skipping product import');
    exit(0);
}

// Include WordPress media functions
require_once(ABSPATH . 'wp-admin/includes/media.php');
require_once(ABSPATH . 'wp-admin/includes/file.php');
require_once(ABSPATH . 'wp-admin/includes/image.php');

// Function to download and attach image to product
function attach_product_image($image_url, $product_id, $set_as_featured = true) {
    if (empty($image_url)) {
        return false;
    }

    // Download image from URL
    $tmp = download_url($image_url);

    if (is_wp_error($tmp)) {
        error_log('Failed to download image: ' . $tmp->get_error_message());
        return false;
    }

    // Get the filename from the URL
    $file_array = array();
    $file_array['name'] = basename($image_url);
    $file_array['tmp_name'] = $tmp;

    // If the URL doesn't have a proper extension, try to determine it
    if (!preg_match('/\\.(jpg|jpeg|png|gif|webp)$/i', $file_array['name'])) {
        $file_info = wp_check_filetype_and_ext($tmp, $file_array['name']);
        if ($file_info['ext']) {
            $file_array['name'] = 'product-image-' . $product_id . '.' . $file_info['ext'];
        }
    }

    // Upload the image
    $attachment_id = media_handle_sideload($file_array, $product_id);

    // Check for errors
    if (is_wp_error($attachment_id)) {
        @unlink($file_array['tmp_name']);
        error_log('Failed to create attachment: ' . $attachment_id->get_error_message());
        return false;
    }

    // Set as featured image if requested
    if ($set_as_featured) {
        set_post_thumbnail($product_id, $attachment_id);
    }

    return $attachment_id;
}

$products_data = array(
${productsPhpArray}
);

$imported_count = 0;
$images_imported = 0;

foreach ($products_data as $product_data) {
    try {
        $product = new WC_Product_Simple();

        $product->set_name($product_data['name']);
        $product->set_description($product_data['description']);
        $product->set_short_description($product_data['short_description']);
        $product->set_regular_price($product_data['regular_price']);

        if (!empty($product_data['sale_price'])) {
            $product->set_sale_price($product_data['sale_price']);
        }

        if (!empty($product_data['sku'])) {
            $product->set_sku($product_data['sku']);
        }

        $product->set_stock_status($product_data['stock_status']);

        // Set categories
        if (!empty($product_data['categories'])) {
            $category_ids = array();
            foreach ($product_data['categories'] as $category_name) {
                $term = get_term_by('name', $category_name, 'product_cat');
                if (!$term) {
                    $term = wp_insert_term($category_name, 'product_cat');
                    if (!is_wp_error($term)) {
                        $category_ids[] = $term['term_id'];
                    }
                } else {
                    $category_ids[] = $term->term_id;
                }
            }
            $product->set_category_ids($category_ids);
        }

        // Save the product first to get the ID
        $product_id = $product->save();
        if ($product_id) {
            $imported_count++;

            // Import images
            if (!empty($product_data['images'])) {
                $gallery_ids = array();
                $is_first = true;

                foreach ($product_data['images'] as $image_url) {
                    if (empty($image_url)) continue;

                    // Set first image as featured, others as gallery
                    $attachment_id = attach_product_image($image_url, $product_id, $is_first);

                    if ($attachment_id && !$is_first) {
                        $gallery_ids[] = $attachment_id;
                    }

                    if ($attachment_id) {
                        $images_imported++;
                    }

                    $is_first = false;

                    // Limit to 5 images per product to avoid timeout
                    if (count($gallery_ids) >= 4) {
                        break;
                    }
                }

                // Set gallery images
                if (!empty($gallery_ids)) {
                    $product = wc_get_product($product_id);
                    $product->set_gallery_image_ids($gallery_ids);
                    $product->save();
                }
            }
        }
    } catch (Exception $e) {
        error_log('Failed to import product: ' . $e->getMessage());
    }
}

echo "Successfully imported $imported_count products with $images_imported images!";
?>`;
}

// Generate the default WooCommerce blueprint
export function generateWooCommerceBlueprint(
	options: BlueprintGeneratorOptions = {},
): Blueprint {
	const {
		siteName = "My WooCommerce Store",
		products = [],
		landingPage = "/wp-admin/",
		php = "8.0",
		wp = "latest",
		additionalPlugins = [],
		additionalSteps = [],
	} = options;

	const blueprint: Blueprint = {
		$schema: "https://playground.wordpress.net/blueprint-schema.json",
		landingPage,
		login: true,
		preferredVersions: {
			php,
			wp,
		},
		phpExtensionBundles: ["kitchen-sink"],
		features: {
			networking: true,
		},
		steps: [
			// Install WooCommerce
			{
				step: "installPlugin",
				pluginZipFile: {
					resource: "wordpress.org/plugins",
					slug: "woocommerce",
				},
			},
			// Install additional useful plugins for development
			{
				step: "installPlugin",
				pluginZipFile: {
					resource: "wordpress.org/plugins",
					slug: "query-monitor",
				},
			},
			// Install any additional plugins
			...additionalPlugins.map((plugin) => ({
				step: "installPlugin" as const,
				pluginZipFile: {
					resource: "wordpress.org/plugins" as const,
					slug: plugin,
				},
			})),
			// Activate plugins
			{
				step: "activatePlugin",
				pluginPath: "woocommerce/woocommerce.php",
			},
			{
				step: "activatePlugin",
				pluginPath: "query-monitor/query-monitor.php",
			},
			// Activate additional plugins
			...additionalPlugins.map((plugin) => ({
				step: "activatePlugin" as const,
				pluginPath: `${plugin}/${plugin}.php`,
			})),
			// Create mu-plugins directory first
			{
				step: "mkdir",
				path: "/wp-content/mu-plugins",
			},
			// Set up pretty permalinks
			{
				step: "writeFile",
				path: "/wp-content/mu-plugins/rewrite.php",
				data: `<?php
/* Use pretty permalinks */
add_action( 'after_setup_theme', function() {
    global $wp_rewrite;
    $wp_rewrite->set_permalink_structure('/%postname%/');
    $wp_rewrite->flush_rules();
} );`,
			},
			// Configure WooCommerce settings
			{
				step: "setSiteOptions",
				options: {
					blogname: siteName,
					woocommerce_store_city: "New York",
					woocommerce_store_address: "123 Main St",
					woocommerce_store_postcode: "10001",
					woocommerce_default_country: "US:NY",
					woocommerce_onboarding_profile: {
						skipped: true,
					},
					woocommerce_currency: "USD",
					woocommerce_weight_unit: "lbs",
					woocommerce_dimension_unit: "in",
					woocommerce_allow_tracking: "no",
					woocommerce_cheque_settings: {
						enabled: "yes",
					},
					woocommerce_cod_settings: {
						enabled: "yes",
					},
					woocommerce_bacs_settings: {
						enabled: "yes",
					},
					// Enable tax calculations
					woocommerce_calc_taxes: "yes",
					// Enable coupons
					woocommerce_enable_coupons: "yes",
					// Enable reviews
					woocommerce_enable_reviews: "yes",
					woocommerce_enable_review_rating: "yes",
					// Stock management
					woocommerce_manage_stock: "yes",
					woocommerce_notify_low_stock: "yes",
					woocommerce_notify_no_stock: "yes",
					woocommerce_stock_email_recipient: "admin@example.com",
					woocommerce_notify_low_stock_amount: 2,
					woocommerce_notify_no_stock_amount: 0,
					// Checkout options
					woocommerce_enable_guest_checkout: "yes",
					woocommerce_enable_checkout_login_reminder: "yes",
					woocommerce_enable_signup_and_login_from_checkout: "yes",
					// Account creation
					woocommerce_enable_myaccount_registration: "yes",
					woocommerce_registration_generate_username: "yes",
					woocommerce_registration_generate_password: "yes",
				},
			},
			// Enable debug mode for development
			{
				step: "writeFile",
				path: "/wp-content/mu-plugins/debug-config.php",
				data: `<?php
/**
 * Debug configuration for development
 * Using mu-plugin to ensure these are set after wp-config.php
 */

// Only define constants if they haven't been defined already
if (!defined('WP_DEBUG')) {
    define('WP_DEBUG', true);
}

if (!defined('WP_DEBUG_LOG')) {
    define('WP_DEBUG_LOG', true);
}

if (!defined('WP_DEBUG_DISPLAY')) {
    define('WP_DEBUG_DISPLAY', false);
}

if (!defined('SCRIPT_DEBUG')) {
    define('SCRIPT_DEBUG', true);
}

if (!defined('WP_ENVIRONMENT_TYPE')) {
    define('WP_ENVIRONMENT_TYPE', 'development');
}

// Additional debug helpers
if (WP_DEBUG) {
    // Ensure error reporting is enabled
    error_reporting(E_ALL);
    ini_set('display_errors', 0);
    ini_set('log_errors', 1);

    // Set error log location if not already set
    if (!ini_get('error_log')) {
        ini_set('error_log', WP_CONTENT_DIR . '/debug.log');
    }
}
`,
			},
		],
	};

	// Add product import steps if products are provided
	if (products.length > 0) {
		const steps = blueprint.steps || [];
		steps.push(
			{
				step: "writeFile",
				path: "/wp-content/mu-plugins/import-products.php",
				data: generateProductImportScript(products),
			},
			{
				step: "runPHP",
				code: `<?php require_once(ABSPATH . 'wp-content/mu-plugins/import-products.php'); ?>`,
			},
			{
				step: "runPHP",
				code: `<?php unlink(ABSPATH . 'wp-content/mu-plugins/import-products.php'); ?>`,
			},
		);
		blueprint.steps = steps;
	} else {
		// Import default WooCommerce sample data
		const steps = blueprint.steps || [];
		steps.push({
			step: "runPHP",
			code: `<?php
// This script creates sample WooCommerce products without requiring WXR import
// It runs after WooCommerce is activated and ready

// Ensure WooCommerce is active
if (!class_exists('WC_Product')) {
    echo 'WooCommerce is not active. Skipping product creation.';
    exit(0);
}

// Load required WordPress functions for media handling
require_once(ABSPATH . 'wp-admin/includes/media.php');
require_once(ABSPATH . 'wp-admin/includes/file.php');
require_once(ABSPATH . 'wp-admin/includes/image.php');

// Helper function to download and attach image to product
function attach_product_thumbnail($image_url, $product_id, $filename = '') {
    if (empty($image_url)) {
        return false;
    }

    // Download the image
    $tmp = download_url($image_url);
    if (is_wp_error($tmp)) {
        return false;
    }

    // Set up file array
    $file_array = array(
        'name' => $filename ?: basename($image_url),
        'tmp_name' => $tmp
    );

    // If filename doesn't have an extension, add one based on mime type
    if (!preg_match('/\.(jpg|jpeg|png|gif|webp)$/i', $file_array['name'])) {
        $file_array['name'] = $file_array['name'] . '.jpg';
    }

    // Upload the image and attach it to the product
    $attachment_id = media_handle_sideload($file_array, $product_id);

    // Clean up temp file
    @unlink($tmp);

    if (is_wp_error($attachment_id)) {
        return false;
    }

    // Set as product thumbnail
    set_post_thumbnail($product_id, $attachment_id);

    return $attachment_id;
}

// Sample product data
$sample_products = array(
    array(
        'name' => 'Premium Quality T-Shirt',
        'description' => 'This premium quality t-shirt is made from 100% organic cotton. Comfortable, durable, and stylish.',
        'short_description' => 'Comfortable organic cotton t-shirt',
        'regular_price' => '29.99',
        'sale_price' => '24.99',
        'sku' => 'TSHIRT-001',
        'stock_status' => 'instock',
        'categories' => array('Clothing', 'T-Shirts'),
        'image_url' => 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800',
        'image_name' => 'premium-tshirt.jpg'
    ),
    array(
        'name' => 'Wireless Bluetooth Headphones',
        'description' => 'Experience crystal-clear audio with these premium wireless Bluetooth headphones. Features noise cancellation and 30-hour battery life.',
        'short_description' => 'Premium wireless headphones with noise cancellation',
        'regular_price' => '149.99',
        'sale_price' => '119.99',
        'sku' => 'HEADPHONES-001',
        'stock_status' => 'instock',
        'categories' => array('Electronics', 'Audio'),
        'image_url' => 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
        'image_name' => 'wireless-headphones.jpg'
    ),
    array(
        'name' => 'Organic Coffee Beans - 1kg',
        'description' => 'Premium organic coffee beans sourced from sustainable farms. Medium roast with notes of chocolate and caramel.',
        'short_description' => 'Premium organic coffee beans',
        'regular_price' => '34.99',
        'sale_price' => '',
        'sku' => 'COFFEE-001',
        'stock_status' => 'instock',
        'categories' => array('Food & Beverage', 'Coffee'),
        'image_url' => 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800',
        'image_name' => 'organic-coffee-beans.jpg'
    ),
    array(
        'name' => 'Yoga Mat - Extra Thick',
        'description' => 'Professional-grade yoga mat with extra thickness for maximum comfort. Non-slip surface and eco-friendly materials.',
        'short_description' => 'Extra thick professional yoga mat',
        'regular_price' => '49.99',
        'sale_price' => '39.99',
        'sku' => 'YOGA-MAT-001',
        'stock_status' => 'instock',
        'categories' => array('Sports & Fitness', 'Yoga'),
        'image_url' => 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=800',
        'image_name' => 'yoga-mat.jpg'
    ),
    array(
        'name' => 'Stainless Steel Water Bottle',
        'description' => 'Keep your drinks cold for 24 hours or hot for 12 hours with this premium stainless steel water bottle.',
        'short_description' => 'Insulated stainless steel water bottle',
        'regular_price' => '24.99',
        'sale_price' => '',
        'sku' => 'BOTTLE-001',
        'stock_status' => 'instock',
        'categories' => array('Home & Kitchen', 'Drinkware'),
        'image_url' => 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800',
        'image_name' => 'water-bottle.jpg'
    ),
    array(
        'name' => 'Leather Wallet - RFID Protected',
        'description' => 'Genuine leather wallet with RFID protection. Multiple card slots and bill compartments.',
        'short_description' => 'RFID protected leather wallet',
        'regular_price' => '59.99',
        'sale_price' => '49.99',
        'sku' => 'WALLET-001',
        'stock_status' => 'instock',
        'categories' => array('Accessories', 'Wallets'),
        'image_url' => 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800',
        'image_name' => 'leather-wallet.jpg'
    )
);

// Create product categories first
$default_categories = array(
    'Clothing' => 'Fashion and apparel',
    'Electronics' => 'Electronic devices and accessories',
    'Food & Beverage' => 'Food and drink products',
    'Sports & Fitness' => 'Sports equipment and fitness gear',
    'Home & Kitchen' => 'Home and kitchen essentials',
    'Accessories' => 'Fashion and tech accessories',
    'T-Shirts' => 'Comfortable t-shirts',
    'Audio' => 'Audio equipment',
    'Coffee' => 'Coffee products',
    'Yoga' => 'Yoga equipment',
    'Drinkware' => 'Bottles and cups',
    'Wallets' => 'Wallets and cardholders'
);

foreach ($default_categories as $name => $description) {
    if (!term_exists($name, 'product_cat')) {
        wp_insert_term($name, 'product_cat', array(
            'description' => $description
        ));
    }
}

$created_count = 0;
$failed_count = 0;
$images_attached = 0;

foreach ($sample_products as $product_data) {
    try {
        // Create product
        $product = new WC_Product_Simple();

        $product->set_name($product_data['name']);
        $product->set_description($product_data['description']);
        $product->set_short_description($product_data['short_description']);
        $product->set_regular_price($product_data['regular_price']);

        if (!empty($product_data['sale_price'])) {
            $product->set_sale_price($product_data['sale_price']);
        }

        $product->set_sku($product_data['sku']);
        $product->set_stock_status($product_data['stock_status']);
        $product->set_manage_stock(false);
        $product->set_status('publish');

        // Set categories
        $category_ids = array();
        foreach ($product_data['categories'] as $category_name) {
            $term = get_term_by('name', $category_name, 'product_cat');
            if (!$term) {
                $term_data = wp_insert_term($category_name, 'product_cat');
                if (!is_wp_error($term_data)) {
                    $category_ids[] = $term_data['term_id'];
                }
            } else {
                $category_ids[] = $term->term_id;
            }
        }
        $product->set_category_ids($category_ids);

        // Save product first to get ID
        $product_id = $product->save();

        if ($product_id) {
            $created_count++;

            // Download and attach the image
            if (!empty($product_data['image_url'])) {
                $attachment_id = attach_product_thumbnail(
                    $product_data['image_url'],
                    $product_id,
                    $product_data['image_name']
                );

                if ($attachment_id) {
                    $images_attached++;

                    // Also set it as the product image in WooCommerce
                    $product = wc_get_product($product_id);
                    $product->set_image_id($attachment_id);
                    $product->save();
                }
            }
        }

    } catch (Exception $e) {
        $failed_count++;
        error_log('Failed to create product: ' . $e->getMessage());
    }
}

echo "Sample product import completed. Created $created_count products with $images_attached images attached.";

if ($failed_count > 0) {
    echo " Failed to create $failed_count products.";
}

// Flush rewrite rules to ensure product permalinks work
flush_rewrite_rules();
?>`,
		});
		blueprint.steps = steps;
	}

	// Add any additional custom steps
	if (additionalSteps.length > 0) {
		const steps = blueprint.steps || [];
		steps.push(...additionalSteps);
		blueprint.steps = steps;
	}

	// Add a helpful mu-plugin for development
	const steps = blueprint.steps || [];
	steps.push({
		step: "writeFile",
		path: "/wp-content/mu-plugins/playground-helpers.php",
		data: `<?php
/**
 * WordPress Playground Development Helpers
 */

// Show admin bar for all users
add_filter('show_admin_bar', '__return_true');

// Disable update checks to improve performance
add_filter('automatic_updater_disabled', '__return_true');
remove_action('init', 'wp_schedule_update_checks');

// Add development notice
add_action('admin_notices', function() {
    echo '<div class="notice notice-info"><p>🎮 Running in WordPress Playground with WooCommerce defaults</p></div>';
});

// Log all errors to debug.log
if (WP_DEBUG_LOG) {
    ini_set('log_errors', 1);
    ini_set('error_log', WP_CONTENT_DIR . '/debug.log');
}
`,
	});
	blueprint.steps = steps;

	return blueprint;
}

// Transform WooCommerce API products to our import format
export function transformWooCommerceProducts(
	products: PublicWooCommerceProduct[],
): ProductImport[] {
	return products.map((product) => ({
		name: product.name,
		description: product.description,
		short_description: product.short_description || "",
		price: product.prices?.price || "0",
		regular_price: product.prices?.regular_price || "0",
		sale_price: product.prices?.sale_price || "",
		sku: product.sku || "",
		stock_status: product.is_in_stock ? "instock" : "outofstock",
		categories: product.categories?.map((cat) => cat.name) || [],
		images: product.images?.map((img) => img.src || "").filter(Boolean) || [],
		attributes: product.attributes || [],
		variations: product.variations || [],
	}));
}
