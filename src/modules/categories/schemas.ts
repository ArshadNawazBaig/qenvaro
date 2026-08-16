import { z } from "zod";

export const categoryStatusSchema = z.enum(["active", "archived"]);

const categoryIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);

const categoryNameSchema = z.string().trim().min(2).max(80);
const categoryDescriptionSchema = z.string().trim().max(500);

export const createCategorySchema = z
  .object({
    name: categoryNameSchema,
    description: categoryDescriptionSchema,
  })
  .strict();

export const updateCategorySchema = z
  .object({
    categoryId: categoryIdSchema,
    expectedVersion: z.number().int().min(1),
    name: categoryNameSchema,
    description: categoryDescriptionSchema,
  })
  .strict();

export const archiveCategorySchema = z
  .object({
    categoryId: categoryIdSchema,
    expectedVersion: z.number().int().min(1),
  })
  .strict();

export const categoryListQuerySchema = z.object({
  q: z.string().trim().max(120).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(50).catch(10),
  status: z.enum(["all", "active", "archived"]).catch("all"),
  sort: z.enum(["name", "products", "updatedAt"]).catch("name"),
  direction: z.enum(["asc", "desc"]).catch("asc"),
});

export type CategoryStatus = z.infer<typeof categoryStatusSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ArchiveCategoryInput = z.infer<typeof archiveCategorySchema>;
export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;

export interface CategoryListItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: CategoryStatus;
  activeProductCount: number;
  totalProductCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function normalizeCategoryName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function createCategorySlug(name: string, categoryId: string): string {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return `${base || "category"}-${categoryId.slice(-8)}`;
}
