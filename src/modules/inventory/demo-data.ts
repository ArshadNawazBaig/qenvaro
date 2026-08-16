import type {
  InventoryOverview,
  InventoryVariantOption,
  LowStockAlertItem,
  LowStockAlertPreferences,
  ProductAvailabilityItem,
  StockAdjustmentItem,
  StockTransferItem,
} from "./schemas";

export const demoInventoryStores = [
  { id: "demo-downtown", code: "DT", name: "Downtown" },
  { id: "demo-warehouse", code: "WH", name: "Central warehouse" },
];

export const demoInventoryVariants: InventoryVariantOption[] = [
  {
    variantId: "demo-growth",
    productId: "growth-suite",
    productName: "Growth Suite",
    variantName: "Default variant",
    sku: "GS-ANNUAL",
    productStatus: "active",
    variantStatus: "active",
    availableStoreIds: demoInventoryStores.map((store) => store.id),
    levels: [
      { storeId: "demo-downtown", quantity: 248, version: 7 },
      { storeId: "demo-warehouse", quantity: 80, version: 3 },
    ],
  },
  {
    variantId: "demo-analytics",
    productId: "analytics-addon",
    productName: "Analytics Add-on",
    variantName: "Default variant",
    sku: "AN-PRO",
    productStatus: "active",
    variantStatus: "active",
    availableStoreIds: demoInventoryStores.map((store) => store.id),
    levels: [{ storeId: "demo-downtown", quantity: 4, version: 5 }],
  },
  {
    variantId: "demo-media",
    productId: "media-vault",
    productName: "Media Vault",
    variantName: "Default variant",
    sku: "MV-100",
    productStatus: "active",
    variantStatus: "active",
    availableStoreIds: demoInventoryStores.map((store) => store.id),
    levels: [{ storeId: "demo-downtown", quantity: 0, version: 2 }],
  },
];

export const demoInventoryOverview: InventoryOverview = {
  store: demoInventoryStores[0] ?? null,
  rows: demoInventoryVariants.map((variant, index) => ({
    ...variant,
    quantity: variant.levels[0]?.quantity ?? 0,
    levelVersion: variant.levels[0]?.version ?? 0,
    reorderLevel: index === 0 ? 20 : index === 1 ? 8 : 5,
  })),
  metrics: {
    trackedSkus: 3,
    unitsOnHand: 252,
    lowStock: 1,
    outOfStock: 1,
  },
  movements: [
    {
      id: "demo-movement-1",
      type: "transfer_in",
      productName: "Growth Suite",
      variantName: "Default variant",
      sku: "GS-ANNUAL",
      quantityDelta: 12,
      resultingQuantity: 248,
      note: "Rebalanced from central warehouse",
      occurredAt: "2026-08-15T09:30:00.000Z",
    },
    {
      id: "demo-movement-2",
      type: "correction",
      productName: "Analytics Add-on",
      variantName: "Default variant",
      sku: "AN-PRO",
      quantityDelta: -2,
      resultingQuantity: 4,
      note: "Weekly cycle count",
      occurredAt: "2026-08-14T14:15:00.000Z",
    },
  ],
};

export const demoStockAdjustments: StockAdjustmentItem[] = [
  {
    id: "demo-adjustment-1",
    storeId: "demo-downtown",
    storeName: "Downtown",
    productName: "Analytics Add-on",
    variantName: "Default variant",
    sku: "AN-PRO",
    reason: "cycle_count",
    quantityDelta: -2,
    previousQuantity: 6,
    newQuantity: 4,
    note: "Weekly cycle count",
    createdAt: "2026-08-14T14:15:00.000Z",
  },
];

export const demoStockTransfers: StockTransferItem[] = [
  {
    id: "demo-transfer-1",
    transferNumber: "TRF-8F42B9A1",
    fromStoreName: "Central warehouse",
    toStoreName: "Downtown",
    status: "completed",
    lineCount: 2,
    unitCount: 18,
    note: "Weekly replenishment",
    createdAt: "2026-08-15T09:30:00.000Z",
  },
];

export const demoProductAvailability: ProductAvailabilityItem[] =
  demoInventoryVariants.map((variant) => ({
    productId: variant.productId,
    name: variant.productName,
    sku: variant.sku,
    status: variant.productStatus,
    version: 1,
    availableStoreIds: [...variant.availableStoreIds],
    quantities: demoInventoryStores.map((store) => ({
      storeId: store.id,
      quantity:
        variant.levels.find((level) => level.storeId === store.id)?.quantity ??
        0,
    })),
  }));

export const demoLowStockAlertPreferences: LowStockAlertPreferences = {
  enabled: true,
  includeLowStock: true,
  includeOutOfStock: true,
  version: 1,
};

export const demoLowStockAlerts: LowStockAlertItem[] = [
  {
    variantId: "demo-media",
    productId: "media-vault",
    productName: "Media Vault",
    variantName: "Default variant",
    sku: "MV-100",
    storeId: "demo-downtown",
    storeName: "Downtown",
    storeCode: "DT",
    quantity: 0,
    reorderLevel: 5,
    severity: "out",
  },
  {
    variantId: "demo-analytics",
    productId: "analytics-addon",
    productName: "Analytics Add-on",
    variantName: "Default variant",
    sku: "AN-PRO",
    storeId: "demo-downtown",
    storeName: "Downtown",
    storeCode: "DT",
    quantity: 4,
    reorderLevel: 8,
    severity: "low",
  },
];
