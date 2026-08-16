import type {
  InventoryMovementType,
  LowStockAlertPreferences,
  StockAdjustmentReason,
} from "./schemas";

export function adjustmentDelta(
  mode: "increase" | "decrease" | "set",
  quantity: number,
  currentQuantity: number,
): number {
  if (mode === "increase") return quantity;
  if (mode === "decrease") return -quantity;
  return quantity - currentQuantity;
}

export function adjustmentMovementType(
  reason: StockAdjustmentReason,
): InventoryMovementType {
  if (reason === "damaged") return "damaged";
  if (reason === "expired") return "expired";
  if (reason === "correction" || reason === "cycle_count") return "correction";
  return "manual_adjustment";
}

export function projectedQuantity(
  currentQuantity: number,
  quantityDelta: number,
  allowNegativeStock: boolean,
): number {
  const result = currentQuantity + quantityDelta;
  if (!allowNegativeStock && result < 0)
    throw new Error("Inventory cannot fall below zero.");
  return result;
}

export function effectiveStoreAvailability(
  storedStoreIds: readonly string[] | undefined,
  activeStoreIds: readonly string[],
): string[] {
  if (!storedStoreIds || storedStoreIds.length === 0)
    return [...activeStoreIds];
  const active = new Set(activeStoreIds);
  return storedStoreIds.filter((storeId) => active.has(storeId));
}

export function mergeScopedStoreAvailability(
  currentStoreIds: readonly string[],
  authorizedStoreIds: ReadonlySet<string>,
  selectedAuthorizedStoreIds: readonly string[],
  activeStoreIds: readonly string[],
): string[] {
  const selected = new Set(selectedAuthorizedStoreIds);
  return activeStoreIds.filter(
    (storeId) =>
      selected.has(storeId) ||
      (!authorizedStoreIds.has(storeId) && currentStoreIds.includes(storeId)),
  );
}

export function lowStockSeverity(
  quantity: number,
  reorderLevel: number,
  preferences: LowStockAlertPreferences,
): "low" | "out" | null {
  if (!preferences.enabled) return null;
  if (quantity <= 0) return preferences.includeOutOfStock ? "out" : null;
  if (quantity <= reorderLevel)
    return preferences.includeLowStock ? "low" : null;
  return null;
}
