import "server-only";
import type { Document, Filter } from "mongodb";
import { requirePermission } from "@/modules/permissions/permissions";
import {
  buildMethodMix,
  buildStoreContribution,
  completeSalesReportTrend,
  salesReportPeriod,
  summarizeSalesReport,
  type SalesReportDailyReturnRow,
  type SalesReportDailySaleRow,
  type SalesReportStoreRow,
} from "@/modules/reports/sales-policy";
import type {
  SalesReportOverview,
  SalesReportProductContribution,
  SalesReportQuery,
  SalesReportStoreOption,
  SalesReportTransaction,
} from "@/modules/reports/sales-schemas";
import type { SalePaymentMethod } from "@/modules/sales/schemas";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

interface SalesReportProfileDocument {
  tenantId: string;
  businessName: string;
  currency: string;
  locale: string;
  timezone: string;
}

interface SalesReportStoreDocument {
  _id: string;
  tenantId: string;
  code: string;
  name: string;
  status: "active" | "archived";
  deletedAt?: Date;
}

interface SalesReportSaleDocument {
  _id: string;
  tenantId: string;
  storeId: string;
  status: "completed";
  completedAt: Date;
}

interface SalesReportReturnDocument {
  _id: string;
  tenantId: string;
  storeId: string;
  status: "completed";
  completedAt: Date;
}

interface SalesFacetResult {
  daily: SalesReportDailySaleRow[];
  stores: SalesReportStoreRow[];
  products: SalesProductRow[];
}

interface ReturnFacetResult {
  daily: SalesReportDailyReturnRow[];
  stores: SalesReportStoreRow[];
  products: ReturnProductRow[];
}

interface SalesProductRow {
  productId: string;
  productName: string;
  unitsSold: number;
  grossSalesMinor: number;
  netSalesMinor: number;
  grossProfitMinor: number;
  lineCount: number;
  profitLineCount: number;
}

interface ReturnProductRow {
  productId: string;
  productName: string;
  unitsReturned: number;
  returnNetMinor: number;
  grossProfitReversalMinor: number;
  lineCount: number;
  profitLineCount: number;
}

interface MethodMixRow {
  method: SalePaymentMethod;
  count: number;
  amountMinor: number;
}

interface TransactionFacetResult {
  items: Array<{
    id: string;
    type: "sale" | "return";
    reference: string;
    relatedReference: string;
    saleId: string;
    storeId: string;
    customerName: string;
    amountMinor: number;
    netAmountMinor: number;
    occurredAt: Date;
  }>;
  total: Array<{ count: number }>;
}

function safeCurrency(value: string): string {
  return /^[A-Z]{3}$/.test(value) ? value : "USD";
}

function safeLocale(value: string): string {
  try {
    new Intl.NumberFormat(value).format(1);
    return value;
  } catch {
    return "en-US";
  }
}

function safeTimezone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return "UTC";
  }
}

function knownNumber(field: string): Document {
  return {
    $cond: [
      {
        $in: [{ $type: field }, ["int", "long", "double", "decimal"]],
      },
      1,
      0,
    ],
  };
}

function dateExpression(field: string, timezone: string): Document {
  return {
    $dateToString: { date: field, format: "%Y-%m-%d", timezone },
  };
}

function mergeProductContribution(
  saleRows: readonly SalesProductRow[],
  returnRows: readonly ReturnProductRow[],
): SalesReportProductContribution[] {
  const sales = new Map(saleRows.map((row) => [row.productId, row]));
  const returns = new Map(returnRows.map((row) => [row.productId, row]));
  const productIds = new Set([...sales.keys(), ...returns.keys()]);
  return [...productIds]
    .map((productId) => {
      const sold = sales.get(productId);
      const returned = returns.get(productId);
      const profitComplete =
        (sold?.lineCount ?? 0) === (sold?.profitLineCount ?? 0) &&
        (returned?.lineCount ?? 0) === (returned?.profitLineCount ?? 0);
      const grossSalesMinor = sold?.grossSalesMinor ?? 0;
      const returnNetMinor = returned?.returnNetMinor ?? 0;
      return {
        productId,
        productName:
          sold?.productName ?? returned?.productName ?? "Historical product",
        unitsSold: sold?.unitsSold ?? 0,
        unitsReturned: returned?.unitsReturned ?? 0,
        grossSalesMinor,
        returnNetMinor,
        netSalesMinor: (sold?.netSalesMinor ?? 0) - returnNetMinor,
        grossProfitMinor: profitComplete
          ? (sold?.grossProfitMinor ?? 0) -
            (returned?.grossProfitReversalMinor ?? 0)
          : null,
      };
    })
    .sort(
      (left, right) =>
        right.netSalesMinor - left.netSalesMinor ||
        right.grossSalesMinor - left.grossSalesMinor ||
        left.productName.localeCompare(right.productName),
    )
    .slice(0, 8);
}

function emptyOverview(
  profile: SalesReportProfileDocument,
  query: SalesReportQuery,
  stores: SalesReportStoreOption[],
  now: Date,
): SalesReportOverview {
  const timezone = safeTimezone(profile.timezone);
  const locale = safeLocale(profile.locale);
  const period = salesReportPeriod(query.range, timezone, now);
  const trend = completeSalesReportTrend(period, [], [], locale, timezone);
  return {
    businessName: profile.businessName,
    currency: safeCurrency(profile.currency),
    locale,
    timezone,
    range: query.range,
    rangeLabel: period.label,
    asOf: now.toISOString(),
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    selectedStoreId: query.store,
    stores,
    summary: summarizeSalesReport(trend),
    trend,
    paymentMethods: [],
    refundMethods: [],
    storeContribution: buildStoreContribution(stores, [], []),
    productContribution: [],
    transactions: {
      items: [],
      total: 0,
      page: query.page,
      pageSize: query.pageSize,
    },
  };
}

export class SalesReportRepository {
  async overview(
    context: TenantContext,
    query: SalesReportQuery,
    now = new Date(),
  ): Promise<SalesReportOverview> {
    requirePermission(context.permissions, "report:read");
    const database = await getDatabase();
    const [profile, storeDocuments] = await Promise.all([
      database.collection<SalesReportProfileDocument>("tenantProfiles").findOne(
        { tenantId: context.tenantId },
        {
          projection: {
            businessName: 1,
            currency: 1,
            locale: 1,
            timezone: 1,
          },
        },
      ),
      database
        .collection<SalesReportStoreDocument>("stores")
        .find(
          {
            tenantId: context.tenantId,
            _id: { $in: [...context.allowedStoreIds] },
            status: "active",
            deletedAt: { $exists: false },
          },
          { projection: { code: 1, name: 1 } },
        )
        .sort({ name: 1, _id: 1 })
        .limit(100)
        .toArray(),
    ]);
    if (!profile) throw new Error("The sales report profile is missing.");
    const stores = storeDocuments.map((store) => ({
      id: String(store._id),
      code: store.code,
      name: store.name,
    }));
    const selectedStores =
      query.store === "all"
        ? stores
        : stores.filter((store) => store.id === query.store);
    if (query.store !== "all" && selectedStores.length !== 1)
      throw new Error("The selected report store is unavailable.");
    if (selectedStores.length === 0)
      return emptyOverview(profile, query, stores, now);

    const timezone = safeTimezone(profile.timezone);
    const locale = safeLocale(profile.locale);
    const currency = safeCurrency(profile.currency);
    const period = salesReportPeriod(query.range, timezone, now);
    const storeIds = selectedStores.map((store) => store.id);
    const saleFilter: Filter<SalesReportSaleDocument> = {
      tenantId: context.tenantId,
      storeId: { $in: storeIds },
      status: "completed",
      completedAt: { $gte: period.start, $lt: period.end },
    };
    const returnFilter: Filter<SalesReportReturnDocument> = {
      tenantId: context.tenantId,
      storeId: { $in: storeIds },
      status: "completed",
      completedAt: { $gte: period.start, $lt: period.end },
    };
    const [saleFacets, returnFacets, paymentRows, refundRows, eventFacets] =
      await Promise.all([
        database
          .collection<SalesReportSaleDocument>("sales")
          .aggregate<SalesFacetResult>([
            { $match: saleFilter },
            {
              $facet: {
                daily: [
                  {
                    $group: {
                      _id: dateExpression("$completedAt", timezone),
                      grossSalesMinor: { $sum: "$subtotalMinor" },
                      discountMinor: { $sum: "$discountMinor" },
                      netSalesMinor: { $sum: "$netTotalMinor" },
                      taxMinor: { $sum: "$taxMinor" },
                      grossProfitMinor: {
                        $sum: { $ifNull: ["$grossProfitMinor", 0] },
                      },
                      completedSales: { $sum: 1 },
                      unitsSold: { $sum: { $sum: "$lines.quantity" } },
                      profitRecordCount: {
                        $sum: knownNumber("$grossProfitMinor"),
                      },
                    },
                  },
                  {
                    $project: {
                      _id: 0,
                      date: "$_id",
                      grossSalesMinor: 1,
                      discountMinor: 1,
                      netSalesMinor: 1,
                      taxMinor: 1,
                      grossProfitMinor: 1,
                      completedSales: 1,
                      unitsSold: 1,
                      profitRecordCount: 1,
                    },
                  },
                ],
                stores: [
                  {
                    $group: {
                      _id: "$storeId",
                      grossSalesMinor: { $sum: "$subtotalMinor" },
                      netSalesMinor: { $sum: "$netTotalMinor" },
                      completedSales: { $sum: 1 },
                    },
                  },
                  {
                    $project: {
                      _id: 0,
                      storeId: "$_id",
                      grossSalesMinor: 1,
                      netSalesMinor: 1,
                      completedSales: 1,
                    },
                  },
                ],
                products: [
                  { $sort: { completedAt: 1, _id: 1 } },
                  { $unwind: "$lines" },
                  {
                    $group: {
                      _id: "$lines.productId",
                      productName: { $last: "$lines.productName" },
                      unitsSold: { $sum: "$lines.quantity" },
                      grossSalesMinor: { $sum: "$lines.subtotalMinor" },
                      netSalesMinor: {
                        $sum: {
                          $subtract: [
                            "$lines.subtotalMinor",
                            "$lines.discountMinor",
                          ],
                        },
                      },
                      grossProfitMinor: {
                        $sum: { $ifNull: ["$lines.grossProfitMinor", 0] },
                      },
                      lineCount: { $sum: 1 },
                      profitLineCount: {
                        $sum: knownNumber("$lines.grossProfitMinor"),
                      },
                    },
                  },
                  { $sort: { netSalesMinor: -1, _id: 1 } },
                  { $limit: 50 },
                  {
                    $project: {
                      _id: 0,
                      productId: "$_id",
                      productName: 1,
                      unitsSold: 1,
                      grossSalesMinor: 1,
                      netSalesMinor: 1,
                      grossProfitMinor: 1,
                      lineCount: 1,
                      profitLineCount: 1,
                    },
                  },
                ],
              },
            },
          ])
          .next(),
        database
          .collection<SalesReportReturnDocument>("returns")
          .aggregate<ReturnFacetResult>([
            { $match: returnFilter },
            {
              $facet: {
                daily: [
                  {
                    $group: {
                      _id: dateExpression("$completedAt", timezone),
                      returnNetMinor: { $sum: "$netTotalMinor" },
                      refundTotalMinor: { $sum: "$totalMinor" },
                      returnTaxMinor: { $sum: "$taxMinor" },
                      grossProfitReversalMinor: {
                        $sum: {
                          $ifNull: ["$grossProfitReversalMinor", 0],
                        },
                      },
                      completedReturns: { $sum: 1 },
                      unitsReturned: { $sum: { $sum: "$lines.quantity" } },
                      profitRecordCount: {
                        $sum: knownNumber("$grossProfitReversalMinor"),
                      },
                    },
                  },
                  {
                    $project: {
                      _id: 0,
                      date: "$_id",
                      returnNetMinor: 1,
                      refundTotalMinor: 1,
                      returnTaxMinor: 1,
                      grossProfitReversalMinor: 1,
                      completedReturns: 1,
                      unitsReturned: 1,
                      profitRecordCount: 1,
                    },
                  },
                ],
                stores: [
                  {
                    $group: {
                      _id: "$storeId",
                      returnNetMinor: { $sum: "$netTotalMinor" },
                      completedReturns: { $sum: 1 },
                    },
                  },
                  {
                    $project: {
                      _id: 0,
                      storeId: "$_id",
                      returnNetMinor: 1,
                      completedReturns: 1,
                    },
                  },
                ],
                products: [
                  { $sort: { completedAt: 1, _id: 1 } },
                  { $unwind: "$lines" },
                  {
                    $group: {
                      _id: "$lines.productId",
                      productName: { $last: "$lines.productName" },
                      unitsReturned: { $sum: "$lines.quantity" },
                      returnNetMinor: { $sum: "$lines.netTotalMinor" },
                      grossProfitReversalMinor: {
                        $sum: {
                          $ifNull: ["$lines.grossProfitReversalMinor", 0],
                        },
                      },
                      lineCount: { $sum: 1 },
                      profitLineCount: {
                        $sum: knownNumber("$lines.grossProfitReversalMinor"),
                      },
                    },
                  },
                  { $sort: { returnNetMinor: -1, _id: 1 } },
                  { $limit: 50 },
                  {
                    $project: {
                      _id: 0,
                      productId: "$_id",
                      productName: 1,
                      unitsReturned: 1,
                      returnNetMinor: 1,
                      grossProfitReversalMinor: 1,
                      lineCount: 1,
                      profitLineCount: 1,
                    },
                  },
                ],
              },
            },
          ])
          .next(),
        database
          .collection("salePayments")
          .aggregate<MethodMixRow>([
            {
              $match: {
                tenantId: context.tenantId,
                storeId: { $in: storeIds },
                status: "recorded",
                recordedAt: { $gte: period.start, $lt: period.end },
              },
            },
            {
              $group: {
                _id: "$method",
                count: { $sum: 1 },
                amountMinor: { $sum: "$appliedMinor" },
              },
            },
            {
              $project: { _id: 0, method: "$_id", count: 1, amountMinor: 1 },
            },
          ])
          .toArray(),
        database
          .collection("refunds")
          .aggregate<MethodMixRow>([
            {
              $match: {
                tenantId: context.tenantId,
                storeId: { $in: storeIds },
                status: "recorded",
                recordedAt: { $gte: period.start, $lt: period.end },
              },
            },
            {
              $group: {
                _id: "$method",
                count: { $sum: 1 },
                amountMinor: { $sum: "$amountMinor" },
              },
            },
            {
              $project: { _id: 0, method: "$_id", count: 1, amountMinor: 1 },
            },
          ])
          .toArray(),
        database
          .collection<SalesReportSaleDocument>("sales")
          .aggregate<TransactionFacetResult>([
            { $match: saleFilter },
            {
              $project: {
                _id: 0,
                id: "$_id",
                type: { $literal: "sale" },
                reference: "$receiptNumber",
                relatedReference: { $literal: "" },
                saleId: "$_id",
                storeId: 1,
                customerName: {
                  $ifNull: ["$customer.name", "Walk-in customer"],
                },
                amountMinor: "$totalMinor",
                netAmountMinor: "$netTotalMinor",
                occurredAt: "$completedAt",
              },
            },
            {
              $unionWith: {
                coll: "returns",
                pipeline: [
                  { $match: returnFilter },
                  {
                    $project: {
                      _id: 0,
                      id: "$_id",
                      type: { $literal: "return" },
                      reference: "$returnNumber",
                      relatedReference: "$originalReceiptNumber",
                      saleId: 1,
                      storeId: 1,
                      customerName: { $literal: "Original sale" },
                      amountMinor: "$totalMinor",
                      netAmountMinor: "$netTotalMinor",
                      occurredAt: "$completedAt",
                    },
                  },
                ],
              },
            },
            { $sort: { occurredAt: -1, id: -1 } },
            {
              $facet: {
                items: [
                  { $skip: (query.page - 1) * query.pageSize },
                  { $limit: query.pageSize },
                ],
                total: [{ $count: "count" }],
              },
            },
          ])
          .next(),
      ]);

    const sales = saleFacets ?? { daily: [], stores: [], products: [] };
    const returns = returnFacets ?? { daily: [], stores: [], products: [] };
    const trend = completeSalesReportTrend(
      period,
      sales.daily,
      returns.daily,
      locale,
      timezone,
    );
    const storeById = new Map(stores.map((store) => [store.id, store]));
    const events: SalesReportTransaction[] = (eventFacets?.items ?? []).map(
      (event) => ({
        ...event,
        id: String(event.id),
        saleId: String(event.saleId),
        storeId: String(event.storeId),
        storeName:
          storeById.get(String(event.storeId))?.name ?? "Historical store",
        occurredAt: event.occurredAt.toISOString(),
      }),
    );
    return {
      businessName: profile.businessName,
      currency,
      locale,
      timezone,
      range: query.range,
      rangeLabel: period.label,
      asOf: now.toISOString(),
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      selectedStoreId: query.store,
      stores,
      summary: summarizeSalesReport(trend),
      trend,
      paymentMethods: buildMethodMix(paymentRows),
      refundMethods: buildMethodMix(refundRows),
      storeContribution: buildStoreContribution(
        selectedStores,
        sales.stores,
        returns.stores,
      ),
      productContribution: mergeProductContribution(
        sales.products,
        returns.products,
      ),
      transactions: {
        items: events,
        total: eventFacets?.total[0]?.count ?? 0,
        page: query.page,
        pageSize: query.pageSize,
      },
    };
  }
}
