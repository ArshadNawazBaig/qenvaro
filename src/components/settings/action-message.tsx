"use client";
import type { SettingsActionState } from "@/app/app/[tenantSlug]/settings/business/actions";
export const settingsInitialState: SettingsActionState = {
  status: "idle",
  message: "",
};
export function SettingsActionMessage({
  state,
}: {
  state: SettingsActionState;
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
