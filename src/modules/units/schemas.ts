import { z } from "zod";

export const unitStatusSchema = z.enum(["active", "archived"]);

export const unitIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);

const unitNameSchema = z.string().trim().min(2).max(60);
const unitSymbolSchema = z.string().trim().min(1).max(16);
const unitDescriptionSchema = z.string().trim().max(240);

export const createUnitSchema = z
  .object({
    name: unitNameSchema,
    symbol: unitSymbolSchema,
    description: unitDescriptionSchema,
  })
  .strict();

export const updateUnitSchema = createUnitSchema.extend({
  unitId: unitIdSchema,
  expectedVersion: z.number().int().min(1),
});

export const archiveUnitSchema = z
  .object({
    unitId: unitIdSchema,
    expectedVersion: z.number().int().min(1),
  })
  .strict();

export const unitListQuerySchema = z.object({
  q: z.string().trim().max(120).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(50).catch(10),
  status: z.enum(["all", "active", "archived"]).catch("all"),
  sort: z.enum(["name", "products", "updatedAt"]).catch("name"),
  direction: z.enum(["asc", "desc"]).catch("asc"),
});

export type UnitStatus = z.infer<typeof unitStatusSchema>;
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type ArchiveUnitInput = z.infer<typeof archiveUnitSchema>;
export type UnitListQuery = z.infer<typeof unitListQuerySchema>;

export interface UnitOption {
  id: string;
  name: string;
  symbol: string;
}

export interface UnitListItem extends UnitOption {
  slug: string;
  description: string;
  status: UnitStatus;
  isDefault: boolean;
  activeProductCount: number;
  totalProductCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function normalizeUnitValue(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function createUnitSlug(name: string, unitId: string): string {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 44);
  return `${base || "unit"}-${unitId.slice(-8)}`;
}
