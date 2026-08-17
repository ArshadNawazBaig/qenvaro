import { z } from "zod";

export const reportsOverviewRangeSchema = z.enum(["30d", "90d"]).catch("30d");

export const reportsOverviewQuerySchema = z.object({
  range: reportsOverviewRangeSchema,
  store: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^(all|[A-Za-z0-9:_-]+)$/)
    .catch("all"),
});

export type ReportsOverviewRange = z.infer<typeof reportsOverviewRangeSchema>;
export type ReportsOverviewQuery = z.infer<typeof reportsOverviewQuerySchema>;
