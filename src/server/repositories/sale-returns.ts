import "server-only";
import type { Filter } from "mongodb";
import { safeCurrency } from "@/config/currencies";
import { requirePermission } from "@/modules/permissions/permissions";
import {
  projectReturnableSaleLines,
  type PreviousSaleReturnAllocation,
  type ReturnableSaleLineSnapshot,
} from "@/modules/sales/return-policy";
import type {
  SaleHistoryItem,
  SaleReturnHistoryItem,
  SaleReturnReason,
  SaleReturnReceipt,
  SaleReturnReceiptLine,
  SaleReturnWorkspace,
  SalesHistoryQuery,
  SalesHistoryResult,
} from "@/modules/sales/return-schemas";
import type { SalePaymentMethod } from "@/modules/sales/schemas";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

interface ReturnProfileDocument {
  tenantId: string;
  businessName: string;
  currency: string;
  locale: string;
  timezone: string;
}

interface ReturnStoreDocument {
  _id: string;
  tenantId: string;
  code: string;
  name: string;
  status?: "active" | "archived";
  deletedAt?: Date;
}

interface ReturnSaleDocument {
  _id: string;
  tenantId: string;
  storeId: string;
  receiptNumber: string;
  customer: { id: string; code: string; name: string } | null;
  status: "completed" | "voided";
  currency: string;
  lines: ReturnableSaleLineSnapshot[];
  totalMinor: number;
  returnedTotalMinor?: number;
  completedAt: Date;
}

interface SaleHistoryDocument extends ReturnSaleDocument {
  returnedTotalMinor?: number;
}

interface CompletedReturnDocument {
  _id: string;
  tenantId: string;
  storeId: string;
  saleId: string;
  originalReceiptNumber: string;
  returnNumber: string;
  status: "completed";
  reason: SaleReturnReason;
  refundMethod: SalePaymentMethod;
  currency: string;
  lines: Array<PreviousSaleReturnAllocation & SaleReturnReceiptLine>;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  note: string;
  completedAt: Date;
}

interface RefundDocument {
  _id: string;
  tenantId: string;
  saleId: string;
  returnId: string;
  method: SalePaymentMethod;
  amountMinor: number;
  status: "recorded";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function unitCount(lines: readonly { quantity: number }[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export class SaleReturnRepository {
  async history(
    context: TenantContext,
    query: SalesHistoryQuery,
  ): Promise<SalesHistoryResult> {
    requirePermission(context.permissions, "sale:read");
    const database = await getDatabase();
    const allowedStoreIds = [...context.allowedStoreIds];
    const profile = await database
      .collection<ReturnProfileDocument>("tenantProfiles")
      .findOne(
        { tenantId: context.tenantId },
        { projection: { currency: 1, locale: 1, timezone: 1 } },
      );
    if (!profile) throw new Error("The sales history profile is missing.");
    if (allowedStoreIds.length === 0)
      return {
        items: [],
        total: 0,
        page: query.page,
        pageSize: query.pageSize,
        currency: safeCurrency(profile.currency),
        locale: safeLocale(profile.locale),
        timezone: safeTimezone(profile.timezone),
      };
    const search = query.q
      ? {
          $or: [
            {
              receiptNumber: {
                $regex: escapeRegex(query.q),
                $options: "i",
              },
            },
            {
              "customer.name": {
                $regex: escapeRegex(query.q),
                $options: "i",
              },
            },
            {
              "customer.code": {
                $regex: escapeRegex(query.q),
                $options: "i",
              },
            },
          ],
        }
      : {};
    const filter: Filter<SaleHistoryDocument> = {
      tenantId: context.tenantId,
      storeId: { $in: allowedStoreIds },
      status: { $in: ["completed", "voided"] },
      ...search,
    };
    const [sales, total, stores] = await Promise.all([
      database
        .collection<SaleHistoryDocument>("sales")
        .find(filter, {
          projection: {
            storeId: 1,
            receiptNumber: 1,
            customer: 1,
            currency: 1,
            lines: 1,
            totalMinor: 1,
            returnedTotalMinor: 1,
            completedAt: 1,
            status: 1,
          },
        })
        .sort({ completedAt: -1, _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .toArray(),
      database.collection<SaleHistoryDocument>("sales").countDocuments(filter),
      database
        .collection<ReturnStoreDocument>("stores")
        .find(
          { tenantId: context.tenantId, _id: { $in: allowedStoreIds } },
          { projection: { name: 1 } },
        )
        .toArray(),
    ]);
    const storeById = new Map(
      stores.map((store) => [String(store._id), store.name]),
    );
    const items: SaleHistoryItem[] = sales.map((sale) => ({
      id: String(sale._id),
      receiptNumber: sale.receiptNumber,
      storeName: storeById.get(sale.storeId) ?? "Historical store",
      customerName: sale.customer?.name ?? "Walk-in customer",
      lineCount: sale.lines.length,
      unitCount: unitCount(sale.lines),
      currency: safeCurrency(sale.currency || profile.currency),
      totalMinor: sale.totalMinor,
      returnedTotalMinor: sale.returnedTotalMinor ?? 0,
      status: sale.status,
      completedAt: sale.completedAt.toISOString(),
    }));
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      currency: safeCurrency(profile.currency),
      locale: safeLocale(profile.locale),
      timezone: safeTimezone(profile.timezone),
    };
  }

  async workspace(
    context: TenantContext,
    saleId: string,
  ): Promise<SaleReturnWorkspace | null> {
    requirePermission(context.permissions, "sale:refund");
    const database = await getDatabase();
    const sale = await database
      .collection<ReturnSaleDocument>("sales")
      .findOne({
        _id: saleId,
        tenantId: context.tenantId,
        storeId: { $in: [...context.allowedStoreIds] },
        status: "completed",
      });
    if (!sale) return null;
    const [profile, store, receipt, returns] = await Promise.all([
      database
        .collection<ReturnProfileDocument>("tenantProfiles")
        .findOne(
          { tenantId: context.tenantId },
          { projection: { currency: 1, locale: 1, timezone: 1 } },
        ),
      database.collection<ReturnStoreDocument>("stores").findOne(
        {
          _id: sale.storeId,
          tenantId: context.tenantId,
          status: "active",
          deletedAt: { $exists: false },
        },
        { projection: { code: 1, name: 1 } },
      ),
      database.collection("receipts").findOne({
        tenantId: context.tenantId,
        saleId: sale._id,
        receiptNumber: sale.receiptNumber,
        status: "issued",
        $or: [{ entityType: "sale" }, { entityType: { $exists: false } }],
      }),
      database
        .collection<CompletedReturnDocument>("returns")
        .find({
          tenantId: context.tenantId,
          saleId: sale._id,
          storeId: sale.storeId,
          status: "completed",
        })
        .sort({ completedAt: -1, _id: -1 })
        .toArray(),
    ]);
    if (!profile || !store || !receipt || sale.lines.length === 0) return null;
    const trackedVariantIds = sale.lines
      .filter((line) => line.inventoryTracking)
      .map((line) => line.variantId);
    const levels =
      trackedVariantIds.length === 0
        ? []
        : await database
            .collection<{
              tenantId: string;
              storeId: string;
              variantId: string;
              version?: number;
            }>("inventoryLevels")
            .find(
              {
                tenantId: context.tenantId,
                storeId: sale.storeId,
                variantId: { $in: trackedVariantIds },
              },
              { projection: { variantId: 1, version: 1 } },
            )
            .toArray();
    const lines = projectReturnableSaleLines(
      sale.lines,
      returns.flatMap((item) => item.lines),
      new Map(levels.map((level) => [level.variantId, level.version ?? 1])),
    );
    const previousReturns: SaleReturnHistoryItem[] = returns.map((item) => ({
      id: String(item._id),
      returnNumber: item.returnNumber,
      reason: item.reason,
      refundMethod: item.refundMethod,
      totalMinor: item.totalMinor,
      unitCount: unitCount(item.lines),
      completedAt: item.completedAt.toISOString(),
    }));
    const returnedTotalMinor = previousReturns.reduce(
      (sum, item) => sum + item.totalMinor,
      0,
    );
    return {
      sale: {
        id: String(sale._id),
        receiptNumber: sale.receiptNumber,
        completedAt: sale.completedAt.toISOString(),
        customerName: sale.customer?.name ?? "Walk-in customer",
        totalMinor: sale.totalMinor,
      },
      store: {
        id: String(store._id),
        code: store.code,
        name: store.name,
      },
      currency: safeCurrency(sale.currency || profile.currency),
      locale: safeLocale(profile.locale),
      timezone: safeTimezone(profile.timezone),
      lines,
      previousReturns,
      returnedTotalMinor,
      remainingTotalMinor: Math.max(0, sale.totalMinor - returnedTotalMinor),
    };
  }

  async receipt(
    context: TenantContext,
    saleId: string,
    returnId: string,
  ): Promise<SaleReturnReceipt | null> {
    requirePermission(context.permissions, "sale:read");
    const database = await getDatabase();
    const sale = await database
      .collection<ReturnSaleDocument>("sales")
      .findOne({
        _id: saleId,
        tenantId: context.tenantId,
        storeId: { $in: [...context.allowedStoreIds] },
        status: "completed",
      });
    if (!sale) return null;
    const returned = await database
      .collection<CompletedReturnDocument>("returns")
      .findOne({
        _id: returnId,
        tenantId: context.tenantId,
        saleId: sale._id,
        storeId: sale.storeId,
        status: "completed",
      });
    if (!returned) return null;
    const [profile, store, receipt, refund] = await Promise.all([
      database
        .collection<ReturnProfileDocument>("tenantProfiles")
        .findOne({ tenantId: context.tenantId }),
      database
        .collection<ReturnStoreDocument>("stores")
        .findOne({ _id: sale.storeId, tenantId: context.tenantId }),
      database.collection("receipts").findOne({
        tenantId: context.tenantId,
        saleId: sale._id,
        returnId: returned._id,
        receiptNumber: returned.returnNumber,
        entityType: "return",
        status: "issued",
      }),
      database.collection<RefundDocument>("refunds").findOne({
        tenantId: context.tenantId,
        saleId: sale._id,
        returnId: returned._id,
        status: "recorded",
      }),
    ]);
    if (!profile || !store || !receipt || !refund) return null;
    return {
      id: String(returned._id),
      returnNumber: returned.returnNumber,
      originalSaleId: String(sale._id),
      originalReceiptNumber: sale.receiptNumber,
      businessName: profile.businessName,
      store: { id: String(store._id), code: store.code, name: store.name },
      customerName: sale.customer?.name ?? "Walk-in customer",
      status: "completed",
      reason: returned.reason,
      note: returned.note,
      currency: safeCurrency(returned.currency || profile.currency),
      locale: safeLocale(profile.locale),
      timezone: safeTimezone(profile.timezone),
      lines: returned.lines.map((line) => ({
        lineId: line.lineId,
        saleLineId: line.saleLineId,
        productName: line.productName,
        variantName: line.variantName,
        sku: line.sku,
        quantity: line.quantity,
        subtotalMinor: line.subtotalMinor,
        discountMinor: line.discountMinor,
        taxMinor: line.taxMinor,
        lineTotalMinor: line.lineTotalMinor,
      })),
      subtotalMinor: returned.subtotalMinor,
      discountMinor: returned.discountMinor,
      taxMinor: returned.taxMinor,
      totalMinor: returned.totalMinor,
      refund: {
        id: String(refund._id),
        method: refund.method,
        amountMinor: refund.amountMinor,
        status: refund.status,
      },
      completedAt: returned.completedAt.toISOString(),
    };
  }
}
