import type { UnitListItem, UnitListQuery, UnitOption } from "./schemas";
import { unitListQuerySchema } from "./schemas";

const demoUnits: UnitListItem[] = [
  {
    id: "uom_demo_each",
    name: "Each",
    symbol: "ea",
    slug: "each-demoeach",
    description: "Individually counted products.",
    status: "active",
    isDefault: true,
    activeProductCount: 12,
    totalProductCount: 12,
    version: 1,
    createdAt: "2026-01-08T09:00:00.000Z",
    updatedAt: "2026-08-12T14:30:00.000Z",
  },
  {
    id: "uom_demo_box",
    name: "Box",
    symbol: "box",
    slug: "box-demo-box",
    description: "Products stocked and sold as a complete box.",
    status: "active",
    isDefault: false,
    activeProductCount: 3,
    totalProductCount: 3,
    version: 1,
    createdAt: "2026-02-05T09:00:00.000Z",
    updatedAt: "2026-07-18T10:30:00.000Z",
  },
  {
    id: "uom_demo_kg",
    name: "Kilogram",
    symbol: "kg",
    slug: "kilogram-demo-kg",
    description: "Weight-based catalog reference unit.",
    status: "active",
    isDefault: false,
    activeProductCount: 0,
    totalProductCount: 0,
    version: 1,
    createdAt: "2026-03-11T09:00:00.000Z",
    updatedAt: "2026-06-08T11:15:00.000Z",
  },
];

export function getDemoUnitOptions(): UnitOption[] {
  return demoUnits
    .filter((unit) => unit.status === "active")
    .map(({ id, name, symbol }) => ({ id, name, symbol }));
}

export function queryDemoUnits(
  raw: Record<string, string | string[] | undefined>,
): { items: UnitListItem[]; total: number; query: UnitListQuery } {
  const query = unitListQuerySchema.parse(raw);
  const search = query.q.toLowerCase();
  const filtered = demoUnits.filter(
    (unit) =>
      (query.status === "all" || unit.status === query.status) &&
      (!search ||
        unit.name.toLowerCase().includes(search) ||
        unit.symbol.toLowerCase().includes(search) ||
        unit.description.toLowerCase().includes(search)),
  );
  filtered.sort((left, right) => {
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
  const start = (query.page - 1) * query.pageSize;
  return {
    items: filtered.slice(start, start + query.pageSize),
    total: filtered.length,
    query,
  };
}
