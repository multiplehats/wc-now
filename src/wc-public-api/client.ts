import type {
	PublicWooCommerceProduct,
	WooCommercePagination,
	WooCommerceProductAttribute,
	WooCommerceProductAttributeTerm,
	WooCommerceProductCategory,
	WooCommerceProductCollectionData,
	WooCommerceProductReview,
	WooCommerceTag,
} from "./types.js";

type PaginationParams = {
	page?: number;
	per_page?: number;
};

type CategoryParams = PaginationParams & {
	hide_empty?: boolean;
	parent?: number;
	order?: "asc" | "desc";
	orderby?: "name" | "slug" | "count" | "id";
};

type AttributeTermParams = PaginationParams & {
	order?: "asc" | "desc";
	orderby?: "name" | "slug" | "menu_order" | "id";
	hide_empty?: boolean;
};

// Create a specific type for paginated responses
export type WCStoreApiPaginatedResponse<T> = {
	data?: T;
	status: number;
	headers?: Headers;
	pagination: WooCommercePagination; // No longer optional
	error?: string;
};

// Keep the original type for non-paginated endpoints
type WCStoreApiResponse<T> = {
	data?: T;
	status: number;
	headers?: Headers;
};

export class WCStoreApiClient {
	private baseUrl: string;
	private apiPath = "/wp-json/wc/store/v1";

	constructor(storeUrl: string) {
		// Remove trailing slash if present
		this.baseUrl = storeUrl.replace(/\/$core/, "");
	}

	private async fetch<T>(
		endpoint: string,
		options: RequestInit = {},
	): Promise<WCStoreApiResponse<T> | WCStoreApiPaginatedResponse<T>> {
		const url = `${this.baseUrl}${this.apiPath}${endpoint}`;

		try {
			const response = await fetch(url, {
				...options,
				headers: {
					"Content-Type": "application/json",
					...options.headers,
				},
			});

			const data = await response.json();

			// Extract pagination information from headers
			const total = Number.parseInt(
				response.headers.get("X-WP-Total") || "0",
				10,
			);
			const totalPages = Number.parseInt(
				response.headers.get("X-WP-TotalPages") || "0",
				10,
			);

			// Parse Link header for next/prev pages
			const linkHeader = response.headers.get("Link");
			const links = linkHeader?.split(",").reduce(
				(acc, link) => {
					const matches = link.match(/<(.+)>;\s*rel="([^"]+)"/);
					if (matches?.[1] && matches?.[2]) {
						const [, url, rel] = matches;
						const pageMatch = url.match(/[?&]page=(\d+)/);
						if (pageMatch?.[1]) {
							acc[rel] = Number.parseInt(pageMatch[1], 10);
						}
					}
					return acc;
				},
				{} as Record<string, number>,
			);

			return {
				data,
				status: response.status,
				headers: response.headers,
				pagination: {
					total,
					totalPages,
					nextPage: links?.next,
					prevPage: links?.prev,
				},
			} as WCStoreApiPaginatedResponse<T>;
		} catch (error) {
			console.error("WCStoreApiClient fetch error:", error);

			return {
				status: 500,
				error:
					error instanceof Error ? error.message : "Unknown error occurred",
				pagination: { total: 0, totalPages: 0 },
			};
		}
	}

	async getProducts(
		params?: PaginationParams,
	): Promise<WCStoreApiPaginatedResponse<PublicWooCommerceProduct[]>> {
		const queryParams = new URLSearchParams({
			page: (params?.page || 1).toString(),
			per_page: (params?.per_page || 10).toString(),
		}).toString();

		const endpoint = `/products${queryParams ? `?${queryParams}` : ""}`;
		return this.fetch<PublicWooCommerceProduct[]>(endpoint) as Promise<
			WCStoreApiPaginatedResponse<PublicWooCommerceProduct[]>
		>;
	}

	/**
	 * Get a single product by ID or slug
	 * @see https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/src/StoreApi/docs/products.md
	 */
	async getProduct(
		idOrSlug: number | string,
	): Promise<WCStoreApiResponse<PublicWooCommerceProduct>> {
		const endpoint = `/products/${idOrSlug}`;
		return this.fetch<PublicWooCommerceProduct>(endpoint) as Promise<
			WCStoreApiResponse<PublicWooCommerceProduct>
		>;
	}

	/**
	 * Get product variations
	 * @see https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/src/StoreApi/docs/products.md
	 */
	async getProductVariations(
		params?: PaginationParams & { type?: "variation" },
	): Promise<WCStoreApiPaginatedResponse<PublicWooCommerceProduct[]>> {
		const queryParams = new URLSearchParams({
			page: (params?.page || 1).toString(),
			per_page: (params?.per_page || 10).toString(),
			type: "variation",
		}).toString();

		const endpoint = `/products${queryParams ? `?${queryParams}` : ""}`;
		return this.fetch<PublicWooCommerceProduct[]>(endpoint) as Promise<
			WCStoreApiPaginatedResponse<PublicWooCommerceProduct[]>
		>;
	}

	async *getAllProducts(
		perPage = 100,
	): AsyncGenerator<PublicWooCommerceProduct[], void, unknown> {
		let currentPage = 1;
		let hasNextPage = true;

		while (hasNextPage) {
			const response = await this.getProducts({
				page: currentPage,
				per_page: perPage,
			});

			if (!response.data) {
				break;
			}

			yield response.data;

			hasNextPage = currentPage < response.pagination.totalPages;
			currentPage++;
		}
	}

	/**
	 * Get product categories
	 * @see https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/src/StoreApi/docs/product-categories.md
	 */
	async getProductCategories(
		params?: CategoryParams,
	): Promise<WCStoreApiPaginatedResponse<WooCommerceProductCategory[]>> {
		const queryParams = new URLSearchParams();
		if (params?.page) queryParams.set("page", params.page.toString());
		if (params?.per_page)
			queryParams.set("per_page", params.per_page.toString());
		if (params?.hide_empty !== undefined)
			queryParams.set("hide_empty", params.hide_empty.toString());
		if (params?.parent !== undefined)
			queryParams.set("parent", params.parent.toString());
		if (params?.order) queryParams.set("order", params.order);
		if (params?.orderby) queryParams.set("orderby", params.orderby);

		const endpoint = `/products/categories${queryParams.toString() ? `?${queryParams}` : ""}`;
		return this.fetch<WooCommerceProductCategory[]>(endpoint) as Promise<
			WCStoreApiPaginatedResponse<WooCommerceProductCategory[]>
		>;
	}

	/**
	 * Get all product categories (paginated)
	 */
	async *getAllProductCategories(
		perPage = 100,
	): AsyncGenerator<WooCommerceProductCategory[], void, unknown> {
		let currentPage = 1;
		let hasNextPage = true;

		while (hasNextPage) {
			const response = await this.getProductCategories({
				page: currentPage,
				per_page: perPage,
				hide_empty: false,
			});

			if (!response.data) {
				break;
			}

			yield response.data;

			hasNextPage = currentPage < response.pagination.totalPages;
			currentPage++;
		}
	}

	/**
	 * Get product reviews
	 * @see https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/src/StoreApi/docs/product-reviews.md
	 */
	async getProductReviews(
		productId?: number,
		params?: PaginationParams,
	): Promise<WCStoreApiPaginatedResponse<WooCommerceProductReview[]>> {
		const queryParams = new URLSearchParams({
			page: (params?.page || 1).toString(),
			per_page: (params?.per_page || 10).toString(),
		});

		if (productId) {
			queryParams.set("product_id", productId.toString());
		}

		const endpoint = `/products/reviews${queryParams.toString() ? `?${queryParams}` : ""}`;
		return this.fetch<WooCommerceProductReview[]>(endpoint) as Promise<
			WCStoreApiPaginatedResponse<WooCommerceProductReview[]>
		>;
	}

	/**
	 * Get product tags
	 * @see https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/src/StoreApi/docs/product-tags.md
	 */
	async getProductTags(
		params?: PaginationParams,
	): Promise<WCStoreApiPaginatedResponse<WooCommerceTag[]>> {
		const queryParams = new URLSearchParams({
			page: (params?.page || 1).toString(),
			per_page: (params?.per_page || 10).toString(),
		}).toString();

		const endpoint = `/products/tags${queryParams ? `?${queryParams}` : ""}`;
		return this.fetch<WooCommerceTag[]>(endpoint) as Promise<
			WCStoreApiPaginatedResponse<WooCommerceTag[]>
		>;
	}

	/**
	 * Get product attributes
	 * @see https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/src/StoreApi/docs/product-attributes.md
	 */
	async getProductAttributes(): Promise<
		WCStoreApiResponse<WooCommerceProductAttribute[]>
	> {
		const endpoint = "/products/attributes";
		return this.fetch<WooCommerceProductAttribute[]>(endpoint) as Promise<
			WCStoreApiResponse<WooCommerceProductAttribute[]>
		>;
	}

	/**
	 * Get product attribute by ID
	 */
	async getProductAttribute(
		attributeId: number,
	): Promise<WCStoreApiResponse<WooCommerceProductAttribute>> {
		const endpoint = `/products/attributes/${attributeId}`;
		return this.fetch<WooCommerceProductAttribute>(endpoint) as Promise<
			WCStoreApiResponse<WooCommerceProductAttribute>
		>;
	}

	/**
	 * Get product attribute terms
	 * @see https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/src/StoreApi/docs/product-attribute-terms.md
	 */
	async getProductAttributeTerms(
		attributeId: number,
		params?: AttributeTermParams,
	): Promise<WCStoreApiPaginatedResponse<WooCommerceProductAttributeTerm[]>> {
		const queryParams = new URLSearchParams();
		if (params?.page) queryParams.set("page", params.page.toString());
		if (params?.per_page)
			queryParams.set("per_page", params.per_page.toString());
		if (params?.order) queryParams.set("order", params.order);
		if (params?.orderby) queryParams.set("orderby", params.orderby);
		if (params?.hide_empty !== undefined)
			queryParams.set("hide_empty", params.hide_empty.toString());

		const endpoint = `/products/attributes/${attributeId}/terms${queryParams.toString() ? `?${queryParams}` : ""}`;
		return this.fetch<WooCommerceProductAttributeTerm[]>(endpoint) as Promise<
			WCStoreApiPaginatedResponse<WooCommerceProductAttributeTerm[]>
		>;
	}

	/**
	 * Get product collection data
	 * @see https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/src/StoreApi/docs/product-collection-data.md
	 */
	async getProductCollectionData(params?: {
		calculate_price_range?: boolean;
		calculate_stock_status_counts?: boolean;
		calculate_attribute_counts?: Array<{
			taxonomy: string;
			query_type: string;
		}>;
		calculate_rating_counts?: boolean;
	}): Promise<WCStoreApiResponse<WooCommerceProductCollectionData>> {
		const queryParams = new URLSearchParams();
		if (params?.calculate_price_range !== undefined) {
			queryParams.set(
				"calculate_price_range",
				params.calculate_price_range.toString(),
			);
		}
		if (params?.calculate_stock_status_counts !== undefined) {
			queryParams.set(
				"calculate_stock_status_counts",
				params.calculate_stock_status_counts.toString(),
			);
		}
		if (params?.calculate_rating_counts !== undefined) {
			queryParams.set(
				"calculate_rating_counts",
				params.calculate_rating_counts.toString(),
			);
		}
		if (params?.calculate_attribute_counts) {
			params.calculate_attribute_counts.forEach((attr, index) => {
				queryParams.set(
					`calculate_attribute_counts[${index}][taxonomy]`,
					attr.taxonomy,
				);
				queryParams.set(
					`calculate_attribute_counts[${index}][query_type]`,
					attr.query_type,
				);
			});
		}

		const endpoint = `/products/collection-data${queryParams.toString() ? `?${queryParams}` : ""}`;
		return this.fetch<WooCommerceProductCollectionData>(endpoint) as Promise<
			WCStoreApiResponse<WooCommerceProductCollectionData>
		>;
	}

	/**
	 * Get all product tags (paginated)
	 */
	async *getAllProductTags(
		perPage = 100,
	): AsyncGenerator<WooCommerceTag[], void, unknown> {
		let currentPage = 1;
		let hasNextPage = true;

		while (hasNextPage) {
			const response = await this.getProductTags({
				page: currentPage,
				per_page: perPage,
			});

			if (!response.data) {
				break;
			}

			yield response.data;

			hasNextPage = currentPage < response.pagination.totalPages;
			currentPage++;
		}
	}

	/**
	 * Get all reviews for all products (paginated)
	 */
	async *getAllProductReviews(
		perPage = 100,
	): AsyncGenerator<WooCommerceProductReview[], void, unknown> {
		let currentPage = 1;
		let hasNextPage = true;

		while (hasNextPage) {
			const response = await this.getProductReviews(undefined, {
				page: currentPage,
				per_page: perPage,
			});

			if (!response.data) {
				break;
			}

			yield response.data;

			hasNextPage = currentPage < response.pagination.totalPages;
			currentPage++;
		}
	}
}
