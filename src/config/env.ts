import "server-only";
import { z } from "zod";

const optionalString = z.string().trim().min(1).optional();
const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
    MONGODB_URI: optionalString,
    MONGODB_DATABASE: z.string().trim().min(1).default("qenvaro"),
    BETTER_AUTH_SECRET: optionalString,
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    SUPER_ADMIN_EMAILS: z.string().default(""),
    EMAIL_PROVIDER: z.enum(["log", "smtp", "resend"]).default("log"),
    EMAIL_FROM: z.string().default("Qenvaro <hello@example.com>"),
    RESEND_API_KEY: optionalString,
    SMTP_HOST: z.string().trim().min(1).default("127.0.0.1"),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    STRIPE_STARTER_MONTHLY_PRICE_ID: optionalString,
    STRIPE_STARTER_ANNUAL_PRICE_ID: optionalString,
    STRIPE_GROWTH_MONTHLY_PRICE_ID: optionalString,
    STRIPE_GROWTH_ANNUAL_PRICE_ID: optionalString,
    STRIPE_BUSINESS_MONTHLY_PRICE_ID: optionalString,
    STRIPE_BUSINESS_ANNUAL_PRICE_ID: optionalString,
    ALLOW_DEV_BILLING_BYPASS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    STORAGE_PROVIDER: z.enum(["filesystem", "s3"]).default("filesystem"),
    S3_ENDPOINT: optionalString,
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    PUBLIC_ASSET_URL: optionalString,
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
  })
  .superRefine((value, context) => {
    const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";
    if (value.NODE_ENV !== "production" || isNextBuild) return;
    if (value.ALLOW_DEV_BILLING_BYPASS) {
      context.addIssue({
        code: "custom",
        message: "Development billing bypass cannot run in production.",
      });
    }
    for (const key of ["MONGODB_URI", "BETTER_AUTH_SECRET"] as const) {
      if (!value[key])
        context.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required in production.`,
        });
    }
    if (value.BETTER_AUTH_SECRET && value.BETTER_AUTH_SECRET.length < 32) {
      context.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: "BETTER_AUTH_SECRET must be at least 32 characters.",
      });
    }
  });

export const env = envSchema.parse(process.env);
export const superAdminEmails = new Set(
  env.SUPER_ADMIN_EMAILS.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
