import { z } from "zod";
import { moneySchema } from "@/lib/money";
import { productTagIdsSchema, type TagOption } from "@/modules/tags/schemas";
import type {
  ProductOptionGroup,
  ProductVariantItem,
} from "@/modules/variants/schemas";
import type { ProductImageItem } from "@/modules/product-images/schemas";
import { unitIdSchema, type UnitOption } from "@/modules/units/schemas";

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
  unitId: unitIdSchema,
  type: productTypeSchema,
  price: moneySchema,
  cost: moneySchema,
  reorderLevel: z.int().min(0).max(1_000_000).default(0),
  inventoryTracking: z.boolean().default(true),
  status: productStatusSchema.default("draft"),
});

export const createSimpleProductInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    subtitle: z.string().trim().max(160).optional(),
    description: z.string().trim().max(4_000).optional(),
    sku: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/),
    barcode: z.string().trim().max(64).optional(),
    category: z.string().trim().min(2).max(80),
    unitId: unitIdSchema.optional(),
    type: z.enum(["simple", "service"]).default("simple"),
    priceMinor: z.number().int().min(0).max(1_000_000_000),
    costMinor: z.number().int().min(0).max(1_000_000_000).optional(),
    openingStock: z.number().int().min(0).max(1_000_000),
    reorderLevel: z.number().int().min(0).max(1_000_000).default(5),
    inventoryTracking: z.boolean().default(true),
    status: z.enum(["draft", "active"]).default("active"),
    tagIds: productTagIdsSchema.default([]),
  })
  .strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreateSimpleProductInput = z.input<
  typeof createSimpleProductInputSchema
>;
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
    description: z.string().trim().max(4_000).optional(),
    sku: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/),
    barcode: z.string().trim().max(64).optional(),
    category: z.string().trim().min(2).max(80),
    unitId: unitIdSchema.optional(),
    priceMinor: z.number().int().min(0).max(1_000_000_000),
    costMinor: z.number().int().min(0).max(1_000_000_000).optional(),
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

export const bulkProductStatusSchema = z
  .object({
    productIds: z.array(productIdSchema).min(1).max(50),
    status: z.enum(["active", "archived"]),
  })
  .strict()
  .transform((input) => ({
    ...input,
    productIds: [...new Set(input.productIds)],
  }));

export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type ArchiveProductInput = z.infer<typeof archiveProductSchema>;
export type BulkProductStatusInput = z.input<typeof bulkProductStatusSchema>;

export interface ProductStoreOption {
  id: string;
  code: string;
  name: string;
}

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
  primaryImage: Pick<
    ProductImageItem,
    "url" | "altText" | "width" | "height"
  > | null;
}

export interface ProductDetail extends ProductListItem {
  type: "simple" | "variant" | "service";
  description: string;
  barcode: string | null;
  costMinor: number;
  inventoryTracking: boolean;
  unitId: string | null;
  unit: UnitOption | null;
  tags: TagOption[];
  version: number;
  createdAt: string;
  updatedAt: string;
  images: ProductImageItem[];
  optionGroups: ProductOptionGroup[];
  variants: ProductVariantItem[];
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
  store: z.string().trim().min(1).max(120).catch("all"),
  stock: z.enum(["all", "in-stock", "low", "out", "service"]).catch("all"),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
