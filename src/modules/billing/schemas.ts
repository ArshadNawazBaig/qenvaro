import { z } from "zod";

export const checkoutSchema = z.object({
  plan: z.enum(["starter", "growth", "business"]),
  interval: z.enum(["monthly", "annual"]),
});

export const billingActionStateSchema = z.object({
  status: z.enum(["idle", "error", "success"]),
  message: z.string(),
});

export type BillingActionState = z.infer<typeof billingActionStateSchema>;
