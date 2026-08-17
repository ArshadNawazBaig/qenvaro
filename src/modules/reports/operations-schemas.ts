import { z } from "zod";

export const operationsReportRangeSchema = z
  .enum(["30d", "90d", "365d"])
  .catch("90d");

export const operationsReportQuerySchema = z.object({
  range: operationsReportRangeSchema,
  store: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^(all|[A-Za-z0-9:_-]+)$/)
    .catch("all"),
});

export type OperationsReportRange = z.infer<typeof operationsReportRangeSchema>;
export type OperationsReportQuery = z.infer<typeof operationsReportQuerySchema>;
