import { demoProducts } from "@/modules/products/demo-data";
import type {
  CategoryListItem,
  CategoryListQuery,
} from "@/modules/categories/schemas";

export function getDemoCategories(): CategoryListItem[] {
  const counts = new Map<string, { active: number; total: number }>();
  for (const product of demoProducts) {
    const current = counts.get(product.category) ?? { active: 0, total: 0 };
    current.total += 1;
    if (product.status === "active" || product.status === "draft")
      current.active += 1;
    counts.set(product.category, current);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, count], index) => ({
      id: `cat_demo_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      description:
        index % 2 === 0
          ? `Demo taxonomy for ${name.toLowerCase()} catalog items.`
          : "",
      status: "active",
      activeProductCount: count.active,
      totalProductCount: count.total,
      version: 1,
      createdAt: "2026-01-08T09:00:00.000Z",
      updatedAt: "2026-08-12T14:30:00.000Z",
    }));
}

export function queryDemoCategories(query: CategoryListQuery): {
  items: CategoryListItem[];
  total: number;
} {
  const needle = query.q.toLowerCase();
  const items = getDemoCategories().filter(
    (category) =>
      (query.status === "all" || category.status === query.status) &&
      (!needle ||
        category.name.toLowerCase().includes(needle) ||
        category.description.toLowerCase().includes(needle) ||
        category.slug.includes(needle)),
  );
  items.sort((left, right) => {
    const direction = query.direction === "asc" ? 1 : -1;
    if (query.sort === "products")
      return (
        (left.activeProductCount - right.activeProductCount) * direction ||
        left.name.localeCompare(right.name)
      );
    if (query.sort === "updatedAt")
      return (
        left.updatedAt.localeCompare(right.updatedAt) * direction ||
        left.name.localeCompare(right.name)
      );
    return left.name.localeCompare(right.name) * direction;
  });
  return {
    items: items.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    ),
    total: items.length,
  };
}
