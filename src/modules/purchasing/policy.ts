import type { PurchaseStatus } from "./schemas";

export function calculatePurchaseLine(input: {
  quantity: number;
  unitCostMinor: number;
  taxRateBps: number;
}) {
  const subtotalMinor = input.quantity * input.unitCostMinor;
  if (!Number.isSafeInteger(subtotalMinor))
    throw new Error("Purchase amount is too large.");
  const taxMinor = Math.round((subtotalMinor * input.taxRateBps) / 10_000);
  return { subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor };
}

const transitions: Record<PurchaseStatus, readonly PurchaseStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["approved", "cancelled"],
  approved: ["partially_received", "received", "cancelled"],
  partially_received: ["partially_received", "received"],
  received: [],
  cancelled: [],
};

export function canTransitionPurchase(
  current: PurchaseStatus,
  target: PurchaseStatus,
) {
  return transitions[current].includes(target);
}

export function requirePurchaseTransition(
  current: PurchaseStatus,
  target: PurchaseStatus,
) {
  if (!canTransitionPurchase(current, target))
    throw new Error(`Purchase order cannot move from ${current} to ${target}.`);
}
