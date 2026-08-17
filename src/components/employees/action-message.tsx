"use client";

import type { WorkforceActionState } from "@/app/app/[tenantSlug]/employees/actions";

export const workforceInitialState: WorkforceActionState = {
  status: "idle",
  message: "",
};

export function WorkforceActionMessage({
  state,
}: {
  state: WorkforceActionState;
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
