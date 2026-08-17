import { z } from "zod";
import { currencyCodes } from "@/config/currencies";

const currencyCodeSchema = z.enum(currencyCodes);

export const selfServePlanKeySchema = z.enum(["starter", "growth", "business"]);

export const onboardingSchema = z.object({
  businessName: z.string().trim().min(2).max(100),
  businessSlug: z
    .string()
    .trim()
    .min(3)
    .max(48)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and single hyphens.",
    ),
  storeName: z.string().trim().min(2).max(100),
  storeCode: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .transform((value) => value.toUpperCase())
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z0-9_-]+$/,
          "Use letters, numbers, dashes, or underscores.",
        ),
    ),
  planKey: selfServePlanKeySchema,
  currency: currencyCodeSchema,
  locale: z.enum(["en-US", "en-GB", "ur-PK"]),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid IANA timezone."),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
