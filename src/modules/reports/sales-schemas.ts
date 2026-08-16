import { z } from "zod";
import type { SalePaymentMethod } from "@/modules/sales/schemas";

export const salesReportRangeSchema = z.enum(["7d", "30d", "90d"]).catch("30d");

export const salesReportQuerySchema = z.object({
  range: salesReportRangeSchema,
  store: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^(all|[A-Za-z0-9:_-]+)$/)
    .catch("all"),
  page: z.coerce.number().int().min(1).max(100).catch(1),
  pageSize: z.coerce.number().int().min(5).max(25).catch(10),
});

export type SalesReportRange = z.infer<typeof salesReportRangeSchema>;
export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;

export interface SalesReportTrendPoint {
  date: string;
  label: string;
  grossSalesMinor: number;
  discountMinor: number;
  returnNetMinor: number;
  refundTotalMinor: number;
  netSalesMinor: number;
  taxMinor: number;
  grossProfitMinor: number | null;
  completedSales: number;
  completedReturns: number;
  unitsSold: number;
  unitsReturned: number;
}

export interface SalesReportSummary {
  grossSalesMinor: number;
  discountMinor: number;
  returnNetMinor: number;
  refundTotalMinor: number;
  netSalesMinor: number;
  taxMinor: number;
  grossProfitMinor: number | null;
  completedSales: number;
  completedReturns: number;
  unitsSold: number;
  unitsReturned: number;
  averageOrderMinor: number;
  marginPercent: number | null;
}

export interface SalesReportMethodMix {
  method: SalePaymentMethod;
  count: number;
  amountMinor: number;
  sharePercent: number;
}

export interface SalesReportStoreOption {
  id: string;
  code: string;
  name: string;
}

export interface SalesReportStoreContribution extends SalesReportStoreOption {
  grossSalesMinor: number;
  returnNetMinor: number;
  netSalesMinor: number;
  completedSales: number;
  completedReturns: number;
  sharePercent: number;
}

export interface SalesReportProductContribution {
  productId: string;
  productName: string;
  unitsSold: number;
  unitsReturned: number;
  grossSalesMinor: number;
  returnNetMinor: number;
  netSalesMinor: number;
  grossProfitMinor: number | null;
}

export interface SalesReportTransaction {
  id: string;
  type: "sale" | "return";
  reference: string;
  relatedReference: string;
  saleId: string;
  storeId: string;
  storeName: string;
  customerName: string;
  amountMinor: number;
  netAmountMinor: number;
  occurredAt: string;
}

export interface SalesReportOverview {
  businessName: string;
  currency: string;
  locale: string;
  timezone: string;
  range: SalesReportRange;
  rangeLabel: string;
  asOf: string;
  periodStart: string;
  periodEnd: string;
  selectedStoreId: string;
  stores: SalesReportStoreOption[];
  summary: SalesReportSummary;
  trend: SalesReportTrendPoint[];
  paymentMethods: SalesReportMethodMix[];
  refundMethods: SalesReportMethodMix[];
  storeContribution: SalesReportStoreContribution[];
  productContribution: SalesReportProductContribution[];
  transactions: {
    items: SalesReportTransaction[];
    total: number;
    page: number;
    pageSize: number;
  };
}
