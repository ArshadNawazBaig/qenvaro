import { z } from "zod";

const idSchema = z
  .string()
  .trim()
  .min(3)
  .max(128)
  .regex(/^[A-Za-z0-9_:-]+$/);
export const suspendTenantSchema = z
  .object({
    tenantId: idSchema,
    expectedVersion: z.number().int().min(1),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export const reactivateTenantSchema = z
  .object({
    tenantId: idSchema,
    expectedVersion: z.number().int().min(1),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export const supportGrantSchema = z
  .object({
    tenantId: idSchema,
    reason: z.string().trim().min(15).max(500),
    durationMinutes: z.number().int().min(15).max(120),
  })
  .strict();
export const revokeSupportGrantSchema = z
  .object({ grantId: idSchema, reason: z.string().trim().min(10).max(500) })
  .strict();
export const featureFlagSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/),
    description: z.string().trim().min(5).max(240),
    defaultEnabled: z.boolean(),
  })
  .strict();
export const tenantFlagOverrideSchema = z
  .object({ flagId: idSchema, tenantId: idSchema, enabled: z.boolean() })
  .strict();
export const announcementSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    message: z.string().trim().min(10).max(1000),
    severity: z.enum(["info", "success", "warning", "critical"]),
    href: z
      .string()
      .trim()
      .max(240)
      .refine(
        (value) => value === "" || value.startsWith("/"),
        "Use a relative application path.",
      ),
    durationDays: z.number().int().min(1).max(90),
  })
  .strict();
export const archivePlatformRecordSchema = z
  .object({ recordId: idSchema })
  .strict();
export const banPlatformUserSchema = z
  .object({
    userId: idSchema,
    reason: z.string().trim().min(10).max(500),
    durationDays: z.number().int().min(1).max(365),
  })
  .strict();
export const unbanPlatformUserSchema = z
  .object({ userId: idSchema, reason: z.string().trim().min(10).max(500) })
  .strict();

export type SuspendTenantInput = z.infer<typeof suspendTenantSchema>;
export type ReactivateTenantInput = z.infer<typeof reactivateTenantSchema>;
export type SupportGrantInput = z.infer<typeof supportGrantSchema>;
export type RevokeSupportGrantInput = z.infer<typeof revokeSupportGrantSchema>;
export type FeatureFlagInput = z.infer<typeof featureFlagSchema>;
export type TenantFlagOverrideInput = z.infer<typeof tenantFlagOverrideSchema>;
export type AnnouncementInput = z.infer<typeof announcementSchema>;
export type BanPlatformUserInput = z.infer<typeof banPlatformUserSchema>;
export type UnbanPlatformUserInput = z.infer<typeof unbanPlatformUserSchema>;
