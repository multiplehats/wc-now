import { afterEach, describe, expect, it, vi } from "vitest";
import { WCStoreApiClient } from "../src/wc-public-api/client";

describe("WCStoreApiClient URL normalization", () => {
	afterEach(() => vi.restoreAllMocks());

	it.each(["https://example.com", "https://example.com/"])(
		"requests the canonical Store API URL for %s",
		async (storeUrl) => {
			const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
				new Response(JSON.stringify([]), {
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
