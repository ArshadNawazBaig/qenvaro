import { demoProducts } from "./demo-data";
import {
  productListQuerySchema,
  type ProductListItem,
  type ProductListQuery,
} from "./schemas";

export interface ProductPageResult {
  items: ProductListItem[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  query: ProductListQuery;
  categories: string[];
}

function stockMatches(
  product: ProductListItem,
  stock: ProductListQuery["stock"],
): boolean {
  if (stock === "all") return true;
  if (stock === "service") return product.stock === null;
  if (stock === "out") return product.stock === 0;
  if (stock === "low")
    return (
      product.stock !== null &&
      product.stock > 0 &&
      product.stock <= product.reorderLevel
    );
  return product.stock !== null && product.stock > product.reorderLevel;
}

export function queryDemoProducts(
  rawQuery: Record<string, string | string[] | undefined>,
): ProductPageResult {
  const query = productListQuerySchema.parse(rawQuery);
  const search = query.q.toLocaleLowerCase();
  const filtered = demoProducts.filter((product) => {
    const searchable =
      `${product.name} ${product.sku} ${product.slug}`.toLocaleLowerCase();
    return (
      (!search || searchable.includes(search)) &&
      (query.status === "all" || product.status === query.status) &&
      (query.category === "all" || product.category === query.category) &&
      stockMatches(product, query.stock)
    );
  });

  const direction = query.direction === "asc" ? 1 : -1;
  filtered.sort((left, right) => {
    const values: Record<
      ProductListQuery["sort"],
      [string | number, string | number]
    > = {
      name: [left.name, right.name],
      price: [left.priceMinor, right.priceMinor],
      stock: [
        left.stock ?? Number.MAX_SAFE_INTEGER,
        right.stock ?? Number.MAX_SAFE_INTEGER,
      ],
      revenue: [left.revenueMinor, right.revenueMinor],
      updatedAt: [left.id, right.id],
    };
    const [a, b] = values[query.sort];
    return (a < b ? -1 : a > b ? 1 : 0) * direction;
  });

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const start = (page - 1) * query.pageSize;
  return {
    items: filtered.slice(start, start + query.pageSize),
    page,
    pageSize: query.pageSize,
    total,
    pageCount,
    query: { ...query, page },
    categories: [
      ...new Set(demoProducts.map((product) => product.category)),
    ].sort(),
  };
}
