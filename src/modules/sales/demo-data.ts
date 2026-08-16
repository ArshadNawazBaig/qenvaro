import { getDemoCustomers } from "@/modules/customers/demo-data";
import { demoProducts } from "@/modules/products/demo-data";
import type { SaleCatalogQuery, SaleWorkspace } from "./schemas";

export function getDemoSaleWorkspace(query: SaleCatalogQuery): SaleWorkspace {
  const needle = query.q.toLowerCase();
  const products = demoProducts
    .filter(
      (product) =>
        product.status === "active" &&
        (!needle ||
          product.name.toLowerCase().includes(needle) ||
          product.sku.toLowerCase().includes(needle)),
    )
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
  const start = (query.page - 1) * query.pageSize;
  return {
    store: { id: "demo-store", code: "DT", name: "Downtown" },
    currency: "USD",
    locale: "en-US",
    catalog: {
      total: products.length,
      page: query.page,
      pageSize: query.pageSize,
      items: products.slice(start, start + query.pageSize).map((product) => {
        const inventoryTracking = product.stock !== null;
        return {
          productId: product.id,
          variantId: `${product.id}_default`,
          productName: product.name,
          variantName: "Default",
          sku: product.sku,
          category: product.category,
          priceMinor: product.priceMinor,
          taxRateBps: 0,
          currency: product.currency,
          inventoryTracking,
          quantity: product.stock,
          levelVersion: inventoryTracking ? 1 : 0,
        };
      }),
    },
    customers: getDemoCustomers()
      .filter((customer) => customer.status === "active")
      .map((customer) => ({
        id: customer.id,
        code: customer.code,
        name: customer.name,
        company: customer.company,
      })),
  };
}
