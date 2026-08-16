import { z } from "zod";

export const planKeySchema = z.enum([
  "starter",
  "growth",
  "business",
  "enterprise",
]);
export type PlanKey = z.infer<typeof planKeySchema>;

export type PlanFeature =
  | "catalog"
  | "inventory"
  | "sales"
  | "customers"
  | "employees"
  | "basicReports"
  | "purchasing"
  | "payroll"
  | "csvImportExport"
  | "advancedReports"
  | "customRoles"
  | "advancedAudit"
  | "multiStoreReports"
  | "advancedExports"
  | "futureApi";

export interface PlanDefinition {
  key: PlanKey;
  name: string;
  description: string;
  monthlyPriceMinor: number | null;
  annualPriceMinor: number | null;
  currency: "USD";
  limits: {
    stores: number | null;
    members: number | null;
    products: number | null;
  };
  features: ReadonlySet<PlanFeature>;
}

const baseFeatures: PlanFeature[] = [
  "catalog",
  "inventory",
  "sales",
  "customers",
  "employees",
  "basicReports",
];

export const plans: Record<PlanKey, PlanDefinition> = {
  starter: {
    key: "starter",
    name: "Starter",
    description: "The essentials for one focused location.",
    monthlyPriceMinor: 2900,
    annualPriceMinor: 29000,
    currency: "USD",
    limits: { stores: 1, members: 5, products: 1_000 },
    features: new Set(baseFeatures),
  },
  growth: {
    key: "growth",
    name: "Growth",
    description: "Multi-location operations for growing teams.",
    monthlyPriceMinor: 7900,
    annualPriceMinor: 79000,
    currency: "USD",
    limits: { stores: 3, members: 25, products: 10_000 },
    features: new Set([
      ...baseFeatures,
      "purchasing",
      "payroll",
      "csvImportExport",
      "advancedReports",
    ]),
  },
  business: {
    key: "business",
    name: "Business",
    description: "Governance and scale for established operators.",
    monthlyPriceMinor: 17900,
    annualPriceMinor: 179000,
    currency: "USD",
    limits: { stores: 10, members: 100, products: 100_000 },
    features: new Set([
      ...baseFeatures,
      "purchasing",
      "payroll",
      "csvImportExport",
      "advancedReports",
      "customRoles",
      "advancedAudit",
      "multiStoreReports",
      "advancedExports",
      "futureApi",
    ]),
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    description: "Contract limits, controls, and infrastructure.",
    monthlyPriceMinor: null,
    annualPriceMinor: null,
    currency: "USD",
    limits: { stores: null, members: null, products: null },
    features: new Set([
      ...baseFeatures,
      "purchasing",
      "payroll",
      "csvImportExport",
      "advancedReports",
      "customRoles",
      "advancedAudit",
      "multiStoreReports",
      "advancedExports",
      "futureApi",
    ]),
  },
};

export function hasPlanFeature(plan: PlanKey, feature: PlanFeature): boolean {
  return plans[plan].features.has(feature);
}

export function assertUsageAvailable(
  plan: PlanKey,
  resource: keyof PlanDefinition["limits"],
  currentUsage: number,
  increment = 1,
): void {
  const limit = plans[plan].limits[resource];
  if (limit !== null && currentUsage + increment > limit) {
    throw new PlanLimitError(resource, limit);
  }
}

export class PlanLimitError extends Error {
  constructor(
    public readonly resource: keyof PlanDefinition["limits"],
    public readonly limit: number,
  ) {
    super(`The plan limit for ${resource} is ${limit}.`);
    this.name = "PlanLimitError";
  }
}
