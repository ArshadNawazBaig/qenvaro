"use client";

import type { PurchasingActionState } from "@/app/app/[tenantSlug]/suppliers/actions";

export const purchasingInitialState: PurchasingActionState = {
  status: "idle",
  message: "",
};
export function PurchasingActionMessage({
  state,
}: {
  state: PurchasingActionState;
}) {
  if (!state.message || state.status === "success") return null;
  return (
    <p
      role="alert"
      className={
        state.status === "conflict"
          ? "bg-warning/20 rounded-lg p-3 text-sm"
          : "bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
      }
    >
      {state.message}
    </p>
  );
}
