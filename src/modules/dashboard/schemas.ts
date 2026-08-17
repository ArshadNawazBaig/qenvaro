import { z } from "zod";

export const dashboardRangeSchema = z
  .enum(["7d", "30d", "90d", "120d"])
  .catch("7d");

export const dashboardQuerySchema = z.object({
  range: dashboardRangeSchema,
});

export type DashboardRange = z.infer<typeof dashboardRangeSchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export interface DashboardTrendPoint {
  date: string;
  label: string;
  netSalesMinor: number;
  grossProfitMinor: number | null;
  completedSales: number;
}

export interface DashboardStorePerformance {
  storeId: string;
  storeCode: string;
  storeName: string;
  netSalesMinor: number;
  completedSales: number;
  sharePercent: number;
}

export type DashboardActivityTone = "primary" | "success" | "warning" | "muted";

export interface DashboardActivityItem {
  id: string;
  action: string;
  title: string;
  summary: string;
  occurredAt: string;
  tone: DashboardActivityTone;
}

export interface DashboardSalesSummary {
  netSalesMinor: number;
  grossProfitMinor: number | null;
  completedSales: number;
  averageOrderMinor: number;
  marginPercent: number | null;
  changePercent: number | null;
}

export interface DashboardOverview {
  businessName: string;
  firstName: string;
  teamMemberCount: number | null;
  currency: string;
  locale: string;
  timezone: string;
  range: DashboardRange;
  rangeLabel: string;
  asOf: string;
  periodStart: string;
  periodEnd: string;
  activeStore: { id: string; code: string; name: string } | null;
  canViewSales: boolean;
  canViewActivity: boolean;
  sales: DashboardSalesSummary;
  trend: DashboardTrendPoint[];
  stores: DashboardStorePerformance[];
  activity: DashboardActivityItem[];
}
