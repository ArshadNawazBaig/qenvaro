import { z } from "zod";

export const customerStatusSchema = z.enum(["active", "archived"]);

export const customerIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);

const optionalEmailSchema = z
  .string()
  .trim()
  .max(254)
  .refine(
    (value) => value === "" || z.string().email().safeParse(value).success,
    "Enter a valid email address.",
  )
  .transform((value) => value.toLowerCase());

const optionalPhoneSchema = z
  .string()
  .trim()
  .max(32)
  .refine(
    (value) => value === "" || /^[+()\-\.\s0-9]+$/.test(value),
    "Enter a valid phone number.",
  );

const optionalCountryCodeSchema = z
  .string()
  .trim()
  .max(2)
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => value === "" || /^[A-Z]{2}$/.test(value),
    "Use a two-letter country code.",
  );

export const customerFieldsSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    company: z.string().trim().max(120),
    email: optionalEmailSchema,
    phone: optionalPhoneSchema,
    address: z
      .object({
        line1: z.string().trim().max(120),
        line2: z.string().trim().max(120),
        city: z.string().trim().max(80),
        region: z.string().trim().max(80),
        postalCode: z.string().trim().max(32),
        countryCode: optionalCountryCodeSchema,
      })
      .strict(),
    notes: z.string().trim().max(1_000),
  })
  .strict();

export const createCustomerSchema = customerFieldsSchema;

export const updateCustomerSchema = customerFieldsSchema.extend({
  customerId: customerIdSchema,
  expectedVersion: z.number().int().min(1),
});

export const archiveCustomerSchema = z
  .object({
    customerId: customerIdSchema,
    expectedVersion: z.number().int().min(1),
  })
  .strict();

export const customerListQuerySchema = z.object({
  q: z.string().trim().max(120).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(50).catch(10),
  status: z.enum(["all", "active", "archived"]).catch("all"),
  sort: z.enum(["name", "createdAt", "updatedAt"]).catch("name"),
  direction: z.enum(["asc", "desc"]).catch("asc"),
});

export type CustomerStatus = z.infer<typeof customerStatusSchema>;
export type CustomerFields = z.infer<typeof customerFieldsSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ArchiveCustomerInput = z.infer<typeof archiveCustomerSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export type CustomerAddress = CustomerFields["address"];

export interface CustomerListItem extends CustomerFields {
  id: string;
  code: string;
  status: CustomerStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function normalizeCustomerValue(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeCustomerPhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") && digits ? `+${digits}` : digits;
}

export function createCustomerCode(customerId: string): string {
  return `C-${customerId.slice(-8).toUpperCase()}`;
}
