import { z } from "zod";
import { currencyCodes } from "@/config/currencies";

const currencyCodeSchema = z.enum(currencyCodes);

export const MAX_BUSINESS_LOGO_BYTES = 2 * 1024 * 1024;
export const BUSINESS_LOGO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export interface BusinessLogo {
  publicId: string;
  assetId: string;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);
const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid IANA timezone.");

export const businessSettingsSchema = z
  .object({
    businessName: z.string().trim().min(2).max(140),
    legalName: z.string().trim().max(180),
    supportEmail: z.string().trim().email().max(254).or(z.literal("")),
    phone: z.string().trim().max(32),
    address: z.string().trim().max(500),
    locale: z.string().trim().min(2).max(35),
    timezone: timezoneSchema,
    currency: currencyCodeSchema,
    expectedVersion: z.number().int().min(1),
  })
  .strict();

export const operationSettingsSchema = z
  .object({
    defaultTaxRateBps: z.number().int().min(0).max(100_000),
    pricesIncludeTax: z.boolean(),
    receiptPrefix: z
      .string()
      .trim()
      .min(1)
      .max(12)
      .regex(/^[A-Za-z0-9-]+$/),
    returnPrefix: z
      .string()
      .trim()
      .min(1)
      .max(12)
      .regex(/^[A-Za-z0-9-]+$/),
    purchasePrefix: z
      .string()
      .trim()
      .min(1)
      .max(12)
      .regex(/^[A-Za-z0-9-]+$/),
    expensePrefix: z
      .string()
      .trim()
      .min(1)
      .max(12)
      .regex(/^[A-Za-z0-9-]+$/),
    allowNegativeStock: z.boolean(),
    expectedVersion: z.number().int().min(1),
  })
  .strict();

export const createStoreSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    code: z
      .string()
      .trim()
      .min(2)
      .max(12)
      .transform((value) => value.toUpperCase())
      .refine(
        (value) => /^[A-Z0-9-]+$/.test(value),
        "Use letters, numbers, and hyphens only.",
      ),
    timezone: timezoneSchema,
    address: z.string().trim().max(500),
  })
  .strict();
export const updateStoreSchema = createStoreSchema.extend({
  storeId: idSchema,
  expectedVersion: z.number().int().min(1),
});
export const archiveStoreSchema = z
  .object({
    storeId: idSchema,
    expectedVersion: z.number().int().min(1),
  })
  .strict();

export const dataRequestSchema = z
  .object({
    type: z.enum(["export", "deletion"]),
    confirmation: z.string().trim().max(120),
  })
  .strict()
  .superRefine((input, context) => {
    const expected =
      input.type === "deletion" ? "REQUEST DELETION" : "REQUEST EXPORT";
    if (input.confirmation !== expected)
      context.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: `Enter ${expected} to confirm.`,
      });
  });

export type BusinessSettingsInput = z.infer<typeof businessSettingsSchema>;
export type OperationSettingsInput = z.infer<typeof operationSettingsSchema>;
export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
export type ArchiveStoreInput = z.infer<typeof archiveStoreSchema>;
export type DataRequestInput = z.infer<typeof dataRequestSchema>;

export interface StoreSettingsItem extends CreateStoreInput {
  id: string;
  status: "active" | "archived";
  version: number;
  createdAt: string;
}

export interface TenantSettingsProjection {
  businessName: string;
  businessLogo: BusinessLogo | null;
  legalName: string;
  supportEmail: string;
  phone: string;
  address: string;
  locale: string;
  timezone: string;
  currency: string;
  planKey: string;
  version: number;
  operationSettings: {
    defaultTaxRateBps: number;
    pricesIncludeTax: boolean;
    receiptPrefix: string;
    returnPrefix: string;
    purchasePrefix: string;
    expensePrefix: string;
    allowNegativeStock: boolean;
    version: number;
  };
  integrations: {
    googleOAuth: boolean;
    stripe: boolean;
    cloudinary: boolean;
    email: boolean;
  };
  stores: StoreSettingsItem[];
  storeLimit: number | null;
  pendingDataRequests: {
    id: string;
    type: "export" | "deletion";
    status: string;
    requestedAt: string;
  }[];
}
