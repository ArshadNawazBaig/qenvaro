import {
  tagListQuerySchema,
  type TagListItem,
  type TagOption,
} from "./schemas";

const demoTags: readonly TagListItem[] = [
  {
    id: "tag_featured",
    name: "Featured",
    slug: "featured-demo",
    description: "Highlighted catalog products",
    color: "blue",
    status: "active",
    activeProductCount: 4,
    totalProductCount: 4,
    version: 1,
    createdAt: "2026-01-08T09:00:00.000Z",
    updatedAt: "2026-08-12T14:30:00.000Z",
  },
  {
    id: "tag_new_arrival",
    name: "New arrival",
    slug: "new-arrival-demo",
    description: "Recently added products",
    color: "emerald",
    status: "active",
    activeProductCount: 3,
    totalProductCount: 3,
    version: 1,
    createdAt: "2026-02-11T09:00:00.000Z",
    updatedAt: "2026-08-14T10:20:00.000Z",
  },
  {
    id: "tag_low_margin",
    name: "Low margin",
    slug: "low-margin-demo",
    description: "Products requiring pricing review",
    color: "amber",
    status: "active",
    activeProductCount: 2,
    totalProductCount: 2,
    version: 1,
    createdAt: "2026-03-18T09:00:00.000Z",
    updatedAt: "2026-08-10T08:15:00.000Z",
  },
  {
    id: "tag_seasonal",
    name: "Seasonal",
    slug: "seasonal-demo",
    description: "Time-bound merchandising group",
    color: "violet",
    status: "active",
    activeProductCount: 2,
    totalProductCount: 3,
    version: 1,
    createdAt: "2026-04-01T09:00:00.000Z",
    updatedAt: "2026-08-09T16:45:00.000Z",
  },
];

export function getDemoTags(): TagListItem[] {
  return demoTags.map((tag) => ({ ...tag }));
}

export function getDemoTagOptions(): TagOption[] {
  return demoTags
    .filter((tag) => tag.status === "active")
    .map(({ id, name, color }) => ({ id, name, color }));
}

export function queryDemoTags(
  rawQuery: Record<string, string | string[] | undefined>,
): { items: TagListItem[]; total: number } {
  const query = tagListQuerySchema.parse(rawQuery);
  const search = query.q.toLocaleLowerCase();
  const filtered = demoTags.filter(
    (tag) =>
      (query.status === "all" || tag.status === query.status) &&
      (!search ||
        `${tag.name} ${tag.slug} ${tag.description}`
          .toLocaleLowerCase()
          .includes(search)),
  );
  const direction = query.direction === "asc" ? 1 : -1;
  filtered.sort((left, right) => {
    const values = {
      name: [left.name, right.name],
      products: [left.activeProductCount, right.activeProductCount],
      updatedAt: [left.updatedAt, right.updatedAt],
    } as const;
    const [a, b] = values[query.sort];
    return (a < b ? -1 : a > b ? 1 : 0) * direction;
  });
  const start = (query.page - 1) * query.pageSize;
  return {
    items: filtered
      .slice(start, start + query.pageSize)
      .map((tag) => ({ ...tag })),
    total: filtered.length,
  };
}
