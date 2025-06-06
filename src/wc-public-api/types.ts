export type WooCommercePagination = {
	total: number;
	totalPages: number;
	nextPage?: number;
	prevPage?: number;
};

type WooCommercePrice = {
	price: string;
	regular_price: string;
	sale_price: string;
	price_range: null;
	currency_code: string;
	currency_symbol: string;
	currency_minor_unit: number;
	currency_decimal_separator: string;
	currency_thousand_separator: string;
	currency_prefix: string;
	currency_suffix: string;
};

type WooCommerceImage = {
	id: number;
	src: string;
	thumbnail: string;
	srcset: string;
	sizes: string;
	name: string;
	alt: string | null;
};

type WooCommerceCategory = {
	id: number;
	name: string;
	slug: string;
	link: string;
};

type WooCommerceAttributeTerm = {
	id: number;
	name: string;
	slug: string;
};

type WooCommerceAttribute = {
	id: number;
	name: string;
	taxonomy: string;
	has_variations: boolean;
	terms: WooCommerceAttributeTerm[];
};

type WooCommerceVariationAttribute = {
	name: string;
	value: string | null;
};

type WooCommerceVariation = {
	id: number;
	attributes: WooCommerceVariationAttribute[];
};

type WooCommerceAddToCart = {
	text: string;
	description: string;
	url: string;
	minimum: number;
	maximum: number;
	multiple_of: number;
};

export type PublicWooCommerceProduct = {
	id: number;
	name: string;
	slug: string;
	parent: number;
	type: string;
	variation: string;
	permalink: string;
	sku: string;
	short_description: string;
	description: string | "";
	on_sale: boolean;
	prices: WooCommercePrice;
	price_html: string;
	average_rating: string;
	review_count: number;
	images: WooCommerceImage[];
	categories: WooCommerceCategory[];
	tags: WooCommerceTag[];
	attributes: WooCommerceAttribute[];
	variations: WooCommerceVariation[];
	has_options: boolean;
	is_purchasable: boolean;
	is_in_stock: boolean;
	is_on_backorder: boolean;
	low_stock_remaining: number;
	sold_individually: boolean;
	add_to_cart: WooCommerceAddToCart;
	extensions: Record<string, string | number | boolean | null | undefined>;
};

// Product Category type
export type WooCommerceProductCategory = {
	id: number;
	name: string;
	slug: string;
	parent: number;
	description: string;
	display: string;
	image: WooCommerceImage | null;
	menu_order: number;
	count: number;
	permalink: string;
	_links: {
		self: Array<{ href: string }>;
		collection: Array<{ href: string }>;
	};
};

// Product Tag type
export type WooCommerceTag = {
	id: number;
	name: string;
	slug: string;
	description: string;
	count: number;
	_links: {
		self: Array<{ href: string }>;
		collection: Array<{ href: string }>;
	};
};

// Product Review type
export type WooCommerceProductReview = {
	id: number;
	date_created: string;
	date_created_gmt: string;
	product_id: number;
	product_name: string;
	product_permalink: string;
	status: string;
	reviewer: string;
	reviewer_email: string;
	review: string;
	rating: number;
	verified: boolean;
	reviewer_avatar_urls: {
		"24": string;
		"48": string;
		"96": string;
	};
	_links: {
		self: Array<{ href: string }>;
		collection: Array<{ href: string }>;
		up: Array<{ href: string }>;
	};
};

// Product Attribute type (for the attributes endpoint)
export type WooCommerceProductAttribute = {
	id: number;
	name: string;
	slug: string;
	type: string;
	order_by: string;
	has_archives: boolean;
	_links: {
		self: Array<{ href: string }>;
		collection: Array<{ href: string }>;
	};
};

// Product Attribute Term type
export type WooCommerceProductAttributeTerm = {
	id: number;
	name: string;
	slug: string;
	description: string;
	menu_order: number;
	count: number;
	_links: {
		self: Array<{ href: string }>;
		collection: Array<{ href: string }>;
	};
};

// Product Collection Data type
export type WooCommerceProductCollectionData = {
	price_range: {
		min_price: string;
		max_price: string;
		currency_code: string;
		currency_symbol: string;
		currency_minor_unit: number;
		currency_decimal_separator: string;
		currency_thousand_separator: string;
		currency_prefix: string;
		currency_suffix: string;
	} | null;
	attribute_counts: Array<{
		term: number;
		count: number;
	}> | null;
	stock_status_counts: {
		instock: number;
		outofstock: number;
		onbackorder: number;
	} | null;
	rating_counts: Array<{
		rating: number;
		count: number;
	}> | null;
};
