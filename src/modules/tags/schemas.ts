import { z } from "zod";

export const tagStatusSchema = z.enum(["active", "archived"]);
export const tagColorSchema = z.enum([
  "slate",
  "blue",
  "emerald",
  "amber",
  "violet",
  "rose",
]);

export const tagIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);

const tagNameSchema = z.string().trim().min(2).max(60);
const tagDescriptionSchema = z.string().trim().max(240);

export const createTagSchema = z
  .object({
    name: tagNameSchema,
    description: tagDescriptionSchema,
    color: tagColorSchema,
  })
  .strict();

export const updateTagSchema = z
  .object({
    tagId: tagIdSchema,
    expectedVersion: z.number().int().min(1),
    name: tagNameSchema,
    description: tagDescriptionSchema,
    color: tagColorSchema,
  })
  .strict();

export const archiveTagSchema = z
  .object({
    tagId: tagIdSchema,
    expectedVersion: z.number().int().min(1),
  })
  .strict();

export const productTagIdsSchema = z
  .array(tagIdSchema)
  .max(20)
  .transform((tagIds) => [...new Set(tagIds)]);

export const tagListQuerySchema = z.object({
  q: z.string().trim().max(120).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(50).catch(10),
  status: z.enum(["all", "active", "archived"]).catch("all"),
  sort: z.enum(["name", "products", "updatedAt"]).catch("name"),
  direction: z.enum(["asc", "desc"]).catch("asc"),
});

export type TagStatus = z.infer<typeof tagStatusSchema>;
export type TagColor = z.infer<typeof tagColorSchema>;
export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
export type ArchiveTagInput = z.infer<typeof archiveTagSchema>;
export type TagListQuery = z.infer<typeof tagListQuerySchema>;

export interface TagOption {
  id: string;
  name: string;
  color: TagColor;
}

export interface TagListItem extends TagOption {
  slug: string;
  description: string;
  status: TagStatus;
  activeProductCount: number;
  totalProductCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function normalizeTagName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function createTagSlug(name: string, tagId: string): string {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 44);
  return `${base || "tag"}-${tagId.slice(-8)}`;
}
