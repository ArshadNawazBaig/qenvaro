import "server-only";
import type { Filter } from "mongodb";
import {
  effectiveStoreAvailability,
  lowStockSeverity,
} from "@/modules/inventory/policy";
import { requirePermission } from "@/modules/permissions/permissions";
import type {
  InventoryMovementItem,
  InventoryMovementType,
  InventoryOverview,
  InventoryVariantOption,
  LowStockAlertItem,
  LowStockAlertPreferences,
  ProductAvailabilityQuery,
  ProductAvailabilityResult,
  StockAdjustmentItem,
  StockAdjustmentReason,
  StockTransferItem,
} from "@/modules/inventory/schemas";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

interface StoreDocument {
  _id: string;
  tenantId: string;
  code: string;
  name: string;
  status: string;
  deletedAt?: Date;
}

interface ProductDocument {
  _id: string;
  tenantId: string;
  name: string;
  sku: string;
  status: "draft" | "active" | "archived";
  inventoryTracking?: boolean;
  reorderLevel?: number;
  allowedStoreIds?: string[];
  deletedAt?: Date;
  version: number;
}

interface VariantDocument {
  _id: string;
  tenantId: string;
  productId: string;
  name: string;
  sku: string;
  status?: "active" | "archived";
  deletedAt?: Date;
}

interface LevelDocument {
  tenantId: string;
  storeId: string;
  variantId: string;
  quantity: number;
  version?: number;
}

interface MovementDocument {
  _id: string;
  tenantId: string;
  storeId: string;
  variantId: string;
  type: InventoryMovementType;
  quantityDelta: number;
  resultingQuantity?: number;
  note?: string;
  occurredAt: Date;
}

interface AdjustmentDocument {
  _id: string;
  tenantId: string;
  storeId: string;
  variantId: string;
  reason: StockAdjustmentReason;
  quantityDelta: number;
  previousQuantity: number;
  newQuantity: number;
  note: string;
  createdAt: Date;
}

interface TransferDocument {
  _id: string;
  tenantId: string;
  transferNumber: string;
  fromStoreId: string;
  toStoreId: string;
  status: "completed";
  lines: Array<{ quantity: number }>;
  note: string;
  createdAt: Date;
}

function productAvailableAtStore(
  product: ProductDocument,
  storeId: string,
): boolean {
  return (
    !product.allowedStoreIds ||
    product.allowedStoreIds.length === 0 ||
    product.allowedStoreIds.includes(storeId)
  );
}

function variantLabel(variant: VariantDocument): string {
  return variant.name === "Default" ? "Default variant" : variant.name;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class InventoryRepository {
  async availability(
    context: TenantContext,
    query: ProductAvailabilityQuery,
  ): Promise<{
    result: ProductAvailabilityResult;
    stores: Array<{ id: string; code: string; name: string }>;
  }> {
    requirePermission(context.permissions, "inventory:read");
    const database = await getDatabase();
    const storeIds = [...context.allowedStoreIds];
    const stores = await database
      .collection<StoreDocument>("stores")
      .find(
        {
          tenantId: context.tenantId,
          _id: { $in: storeIds },
          status: "active",
          deletedAt: { $exists: false },
        },
        { projection: { code: 1, name: 1 } },
      )
      .sort({ name: 1, _id: 1 })
      .toArray();
    const activeStoreIds = stores.map((store) => String(store._id));
    const filter: Filter<ProductDocument> = {
      tenantId: context.tenantId,
      deletedAt: { $exists: false },
    };
    if (query.q) {
      const safe = escapeRegex(query.q);
      filter.$or = [
        { name: { $regex: safe, $options: "i" } },
        { sku: { $regex: safe, $options: "i" } },
      ];
    }
    const [products, total] = await Promise.all([
      database
        .collection<ProductDocument>("products")
        .find(filter)
        .sort({ name: 1, _id: 1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .project<ProductDocument>({
          name: 1,
          sku: 1,
          status: 1,
          allowedStoreIds: 1,
          version: 1,
        })
        .toArray(),
      database.collection<ProductDocument>("products").countDocuments(filter, {
        limit: 100_001,
      }),
    ]);
    const productIds = products.map((product) => String(product._id));
    const variants =
      productIds.length === 0
        ? []
        : await database
            .collection<VariantDocument>("productVariants")
            .find(
              {
                tenantId: context.tenantId,
                productId: { $in: productIds },
                deletedAt: { $exists: false },
              },
              { projection: { productId: 1 } },
            )
            .toArray();
    const variantById = new Map(
      variants.map((variant) => [String(variant._id), variant]),
    );
    const levels =
      variants.length === 0 || activeStoreIds.length === 0
        ? []
        : await database
            .collection<LevelDocument>("inventoryLevels")
            .find(
              {
                tenantId: context.tenantId,
                storeId: { $in: activeStoreIds },
                variantId: { $in: [...variantById.keys()] },
              },
              { projection: { storeId: 1, variantId: 1, quantity: 1 } },
            )
            .toArray();
    const quantityByProductStore = new Map<string, number>();
    for (const level of levels) {
      const variant = variantById.get(level.variantId);
      if (!variant) continue;
      const key = `${variant.productId}:${level.storeId}`;
      quantityByProductStore.set(
        key,
        (quantityByProductStore.get(key) ?? 0) + level.quantity,
      );
    }
    return {
      stores: stores.map((store) => ({
        id: String(store._id),
        code: store.code,
        name: store.name,
      })),
      result: {
        total,
        items: products.map((product) => ({
          productId: String(product._id),
          name: product.name,
          sku: product.sku,
          status: product.status,
          version: product.version,
          availableStoreIds: effectiveStoreAvailability(
            product.allowedStoreIds,
            activeStoreIds,
          ),
          quantities: activeStoreIds.map((storeId) => ({
            storeId,
            quantity:
              quantityByProductStore.get(`${String(product._id)}:${storeId}`) ??
              0,
          })),
        })),
      },
    };
  }

  async lowStockAlerts(context: TenantContext): Promise<{
    preferences: LowStockAlertPreferences;
    store: { id: string; code: string; name: string } | null;
    items: LowStockAlertItem[];
  }> {
    requirePermission(context.permissions, "inventory:read");
    const database = await getDatabase();
    const [overview, profile] = await Promise.all([
      this.overview(context),
      database
        .collection<{
          tenantId: string;
          inventorySettings?: {
            lowStockAlerts?: Partial<LowStockAlertPreferences>;
          };
        }>("tenantProfiles")
        .findOne(
          { tenantId: context.tenantId },
          { projection: { inventorySettings: 1 } },
        ),
    ]);
    const preferences: LowStockAlertPreferences = {
      enabled: profile?.inventorySettings?.lowStockAlerts?.enabled ?? false,
      includeLowStock:
        profile?.inventorySettings?.lowStockAlerts?.includeLowStock ?? true,
      includeOutOfStock:
        profile?.inventorySettings?.lowStockAlerts?.includeOutOfStock ?? true,
      version: profile?.inventorySettings?.lowStockAlerts?.version ?? 1,
    };
    if (!overview.store) return { preferences, store: null, items: [] };
    const activeStore = overview.store;
    const items = overview.rows.flatMap((row) => {
      if (row.productStatus === "archived" || row.variantStatus === "archived")
        return [];
      const severity = lowStockSeverity(
        row.quantity,
        row.reorderLevel,
        preferences,
      );
      return severity
        ? [
            {
              variantId: row.variantId,
              productId: row.productId,
              productName: row.productName,
              variantName: row.variantName,
              sku: row.sku,
              storeId: activeStore.id,
              storeName: activeStore.name,
              storeCode: activeStore.code,
              quantity: row.quantity,
              reorderLevel: row.reorderLevel,
              severity,
            },
          ]
        : [];
    });
    items.sort(
      (left, right) =>
        (left.severity === "out" ? -1 : 1) -
          (right.severity === "out" ? -1 : 1) ||
        left.quantity - right.quantity ||
        left.productName.localeCompare(right.productName),
    );
    return { preferences, store: activeStore, items };
  }

  async options(context: TenantContext): Promise<{
    stores: Array<{ id: string; code: string; name: string }>;
    variants: InventoryVariantOption[];
  }> {
    requirePermission(context.permissions, "inventory:read");
    const database = await getDatabase();
    const allowedStoreIds = [...context.allowedStoreIds];
    const [stores, products, variants, levels] = await Promise.all([
      database
        .collection<StoreDocument>("stores")
        .find(
          {
            tenantId: context.tenantId,
            _id: { $in: allowedStoreIds },
            status: "active",
            deletedAt: { $exists: false },
          },
          { projection: { code: 1, name: 1 } },
        )
        .sort({ name: 1, _id: 1 })
        .toArray(),
      database
        .collection<ProductDocument>("products")
        .find(
          {
            tenantId: context.tenantId,
            inventoryTracking: { $ne: false },
            deletedAt: { $exists: false },
          },
          {
            projection: {
              name: 1,
              status: 1,
              reorderLevel: 1,
              allowedStoreIds: 1,
            },
          },
        )
        .sort({ name: 1, _id: 1 })
        .toArray(),
      database
        .collection<VariantDocument>("productVariants")
        .find(
          { tenantId: context.tenantId, deletedAt: { $exists: false } },
          { projection: { productId: 1, name: 1, sku: 1, status: 1 } },
        )
        .sort({ name: 1, _id: 1 })
        .toArray(),
      allowedStoreIds.length === 0
        ? Promise.resolve([])
        : database
            .collection<LevelDocument>("inventoryLevels")
            .find(
              {
                tenantId: context.tenantId,
                storeId: { $in: allowedStoreIds },
              },
              {
                projection: {
                  storeId: 1,
                  variantId: 1,
                  quantity: 1,
                  version: 1,
                },
              },
            )
            .toArray(),
    ]);
    const productById = new Map(
      products.map((product) => [product._id, product]),
    );
    const levelByVariant = new Map<string, LevelDocument[]>();
    for (const level of levels) {
      const current = levelByVariant.get(level.variantId) ?? [];
      current.push(level);
      levelByVariant.set(level.variantId, current);
    }
    const inventoryVariants = variants
      .flatMap((variant) => {
        const product = productById.get(variant.productId);
        if (!product) return [];
        if (
          !stores.some((store) =>
            productAvailableAtStore(product, String(store._id)),
          )
        )
          return [];
        return [
          {
            variantId: String(variant._id),
            productId: product._id,
            productName: product.name,
            variantName: variantLabel(variant),
            sku: variant.sku,
            productStatus: product.status,
            variantStatus: variant.status ?? "active",
            availableStoreIds: stores
              .filter((store) =>
                productAvailableAtStore(product, String(store._id)),
              )
              .map((store) => String(store._id)),
            levels: (levelByVariant.get(String(variant._id)) ?? []).map(
              (level) => ({
                storeId: level.storeId,
                quantity: level.quantity,
                version: level.version ?? 1,
              }),
            ),
          },
        ];
      })
      .filter(
        (variant) =>
          (variant.productStatus !== "archived" &&
            variant.variantStatus !== "archived") ||
          variant.levels.some((level) => level.quantity !== 0),
      )
      .sort(
        (left, right) =>
          left.productName.localeCompare(right.productName) ||
          left.variantName.localeCompare(right.variantName) ||
          left.variantId.localeCompare(right.variantId),
      );
    return {
      stores: stores.map((store) => ({
        id: String(store._id),
        code: store.code,
        name: store.name,
      })),
      variants: inventoryVariants,
    };
  }

  async overview(context: TenantContext): Promise<InventoryOverview> {
    requirePermission(context.permissions, "inventory:read");
    const { stores, variants } = await this.options(context);
    const store =
      stores.find((candidate) => candidate.id === context.activeStoreId) ??
      null;
    if (!store)
      return {
        store: null,
        rows: [],
        metrics: { trackedSkus: 0, unitsOnHand: 0, lowStock: 0, outOfStock: 0 },
        movements: [],
      };
    const database = await getDatabase();
    const productIds = [
      ...new Set(variants.map((variant) => variant.productId)),
    ];
    const products = await database
      .collection<ProductDocument>("products")
      .find(
        { tenantId: context.tenantId, _id: { $in: productIds } },
        { projection: { reorderLevel: 1, allowedStoreIds: 1 } },
      )
      .toArray();
    const productById = new Map(
      products.map((product) => [product._id, product]),
    );
    const rows = variants.flatMap((variant) => {
      const product = productById.get(variant.productId);
      if (!product || !productAvailableAtStore(product, store.id)) return [];
      const level = variant.levels.find(
        (candidate) => candidate.storeId === store.id,
      );
      return [
        {
          ...variant,
          quantity: level?.quantity ?? 0,
          levelVersion: level?.version ?? 0,
          reorderLevel: product.reorderLevel ?? 0,
        },
      ];
    });
    rows.sort(
      (left, right) =>
        left.quantity - right.quantity ||
        left.productName.localeCompare(right.productName),
    );
    const movementDocuments = await database
      .collection<MovementDocument>("inventoryMovements")
      .find(
        { tenantId: context.tenantId, storeId: store.id },
        {
          projection: {
            variantId: 1,
            type: 1,
            quantityDelta: 1,
            resultingQuantity: 1,
            note: 1,
            occurredAt: 1,
          },
        },
      )
      .sort({ occurredAt: -1, _id: -1 })
      .limit(20)
      .toArray();
    const variantById = new Map(
      variants.map((variant) => [variant.variantId, variant]),
    );
    const movements: InventoryMovementItem[] = movementDocuments.map(
      (movement) => {
        const variant = variantById.get(movement.variantId);
        return {
          id: String(movement._id),
          type: movement.type,
          productName: variant?.productName ?? "Unavailable product",
          variantName: variant?.variantName ?? "Unavailable variant",
          sku: variant?.sku ?? "—",
          quantityDelta: movement.quantityDelta,
          resultingQuantity: movement.resultingQuantity ?? 0,
          note: movement.note ?? "",
          occurredAt: movement.occurredAt.toISOString(),
        };
      },
    );
    return {
      store,
      rows,
      metrics: {
        trackedSkus: rows.length,
        unitsOnHand: rows.reduce((total, row) => total + row.quantity, 0),
        lowStock: rows.filter(
          (row) => row.quantity > 0 && row.quantity <= row.reorderLevel,
        ).length,
        outOfStock: rows.filter((row) => row.quantity <= 0).length,
      },
      movements,
    };
  }

  async adjustments(context: TenantContext): Promise<StockAdjustmentItem[]> {
    requirePermission(context.permissions, "inventory:read");
    const database = await getDatabase();
    const storeIds = [...context.allowedStoreIds];
    const records = await database
      .collection<AdjustmentDocument>("stockAdjustments")
      .find({ tenantId: context.tenantId, storeId: { $in: storeIds } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .toArray();
    const [stores, variants] = await Promise.all([
      database
        .collection<StoreDocument>("stores")
        .find(
          { tenantId: context.tenantId, _id: { $in: storeIds } },
          { projection: { name: 1 } },
        )
        .toArray(),
      database
        .collection<VariantDocument>("productVariants")
        .find(
          {
            tenantId: context.tenantId,
            _id: { $in: records.map((record) => record.variantId) },
          },
          { projection: { productId: 1, name: 1, sku: 1 } },
        )
        .toArray(),
    ]);
    const products = await database
      .collection<ProductDocument>("products")
      .find(
        {
          tenantId: context.tenantId,
          _id: { $in: variants.map((variant) => variant.productId) },
        },
        { projection: { name: 1 } },
      )
      .toArray();
    const storeById = new Map(
      stores.map((store) => [String(store._id), store.name]),
    );
    const variantById = new Map(
      variants.map((variant) => [String(variant._id), variant]),
    );
    const productById = new Map(
      products.map((product) => [product._id, product.name]),
    );
    return records.map((record) => {
      const variant = variantById.get(record.variantId);
      return {
        id: String(record._id),
        storeId: record.storeId,
        storeName: storeById.get(record.storeId) ?? "Unavailable store",
        productName: variant
          ? (productById.get(variant.productId) ?? "Unavailable product")
          : "Unavailable product",
        variantName: variant ? variantLabel(variant) : "Unavailable variant",
        sku: variant?.sku ?? "—",
        reason: record.reason,
        quantityDelta: record.quantityDelta,
        previousQuantity: record.previousQuantity,
        newQuantity: record.newQuantity,
        note: record.note,
        createdAt: record.createdAt.toISOString(),
      };
    });
  }

  async transfers(context: TenantContext): Promise<StockTransferItem[]> {
    requirePermission(context.permissions, "inventory:read");
    const database = await getDatabase();
    const storeIds = [...context.allowedStoreIds];
    const records = await database
      .collection<TransferDocument>("stockTransfers")
      .find({
        tenantId: context.tenantId,
        fromStoreId: { $in: storeIds },
        toStoreId: { $in: storeIds },
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .toArray();
    const stores = await database
      .collection<StoreDocument>("stores")
      .find(
        { tenantId: context.tenantId, _id: { $in: storeIds } },
        { projection: { name: 1 } },
      )
      .toArray();
    const storeById = new Map(
      stores.map((store) => [String(store._id), store.name]),
    );
    return records.map((record) => ({
      id: String(record._id),
      transferNumber: record.transferNumber,
      fromStoreName: storeById.get(record.fromStoreId) ?? "Unavailable store",
      toStoreName: storeById.get(record.toStoreId) ?? "Unavailable store",
      status: record.status,
      lineCount: record.lines.length,
      unitCount: record.lines.reduce((total, line) => total + line.quantity, 0),
      note: record.note,
      createdAt: record.createdAt.toISOString(),
    }));
  }
}
