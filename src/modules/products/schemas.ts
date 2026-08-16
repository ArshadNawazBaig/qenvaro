import { z } from "zod";
import { moneySchema } from "@/lib/money";
import { productTagIdsSchema, type TagOption } from "@/modules/tags/schemas";

export const productStatusSchema = z.enum(["draft", "active", "archived"]);
export const productTypeSchema = z.enum(["simple", "variant", "service"]);

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(4_000).default(""),
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/),
  barcode: z.string().trim().max(64).optional(),
  categoryId: z.string().trim().min(1),
  type: productTypeSchema,
  price: moneySchema,
  cost: moneySchema,
  reorderLevel: z.int().min(0).max(1_000_000).default(0),
  inventoryTracking: z.boolean().default(true),
  status: productStatusSchema.default("draft"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type ProductStatus = z.infer<typeof productStatusSchema>;

const productIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);

export const updateProductSchema = z
  .object({
    productId: productIdSchema,
    expectedVersion: z.number().int().min(1),
    name: z.string().trim().min(2).max(120),
    subtitle: z.string().trim().max(160),
    sku: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/),
    category: z.string().trim().min(2).max(80),
    priceMinor: z.number().int().min(0).max(1_000_000_000),
    reorderLevel: z.number().int().min(0).max(1_000_000),
    status: z.enum(["draft", "active"]),
    tagIds: productTagIdsSchema.default([]),
  })
  .strict();

export const archiveProductSchema = z
  .object({
    productId: productIdSchema,
    expectedVersion: z.number().int().min(1),
  })
  .strict();

export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type ArchiveProductInput = z.infer<typeof archiveProductSchema>;

export interface ProductListItem {
  id: string;
  name: string;
  subtitle: string;
  sku: string;
  slug: string;
  priceMinor: number;
  currency: string;
  stock: number | null;
  reorderLevel: number;
  category: string;
  tagIds: string[];
  status: ProductStatus;
  views: number;
  revenueMinor: number;
  imageTone: "sky" | "ink" | "mint" | "sand" | "berry" | "slate";
}

export interface ProductDetail extends ProductListItem {
  tags: TagOption[];
  version: number;
  createdAt: string;
  updatedAt: string;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    priceMinor: number;
    currency: string;
  }>;
  inventory: Array<{
    storeId: string;
    storeName: string;
    storeCode: string;
    quantity: number;
  }>;
}

export const productListQuerySchema = z.object({
  q: z.string().trim().max(120).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(50).catch(8),
  sort: z
    .enum(["name", "price", "stock", "revenue", "updatedAt"])
    .catch("revenue"),
  direction: z.enum(["asc", "desc"]).catch("desc"),
  status: z.enum(["all", "draft", "active", "archived"]).catch("all"),
  category: z.string().trim().max(80).catch("all"),
  tag: z.string().trim().max(120).catch("all"),
  stock: z.enum(["all", "in-stock", "low", "out", "service"]).catch("all"),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
