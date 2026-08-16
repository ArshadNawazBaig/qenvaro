"use client";

import { Pencil, RefreshCw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  type InventoryActionState,
  updateLowStockAlertPreferencesAction,
  updateProductAvailabilityAction,
} from "@/app/app/[tenantSlug]/inventory/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type {
  LowStockAlertPreferences,
  ProductAvailabilityItem,
} from "@/modules/inventory/schemas";

const initialState: InventoryActionState = { status: "idle", message: "" };

interface StoreOption {
  id: string;
  code: string;
  name: string;
}

function ActionMessage({ state }: { state: InventoryActionState }) {
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

export function ProductAvailabilityDialog({
  tenantSlug,
  product,
  stores,
  disabled,
}: {
  tenantSlug: string;
  product: ProductAvailabilityItem;
  stores: StoreOption[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState(
    () => new Set(product.availableStoreIds),
  );
  const [state, action, pending] = React.useActionState(
    updateProductAvailabilityAction.bind(null, tenantSlug, product.productId),
    initialState,
  );
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
    const timeout = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [router, state]);

  function toggleStore(storeId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(storeId);
      else next.delete(storeId);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`Manage availability for ${product.name}`}
        >
          <Pencil /> Manage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Store availability
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Choose where {product.name} can be stocked and sold. A store with
          inventory must be reduced to zero before removal.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <input
            type="hidden"
            name="expectedVersion"
            value={state.version ?? product.version}
          />
          <div className="divide-y overflow-hidden rounded-xl border">
            {stores.map((store) => {
              const quantity =
                product.quantities.find((entry) => entry.storeId === store.id)
                  ?.quantity ?? 0;
              const checked = selected.has(store.id);
              const locked = checked && quantity !== 0;
              return (
                <label
                  key={store.id}
                  className="hover:bg-muted/30 flex items-center gap-3 px-4 py-3"
                >
                  {locked && (
                    <input
                      type="hidden"
                      name="availableStoreIds"
                      value={store.id}
                    />
                  )}
                  <input
                    type="checkbox"
                    name="availableStoreIds"
                    value={store.id}
                    checked={checked}
                    disabled={locked}
                    onChange={(event) =>
                      toggleStore(store.id, event.target.checked)
                    }
                    className="accent-primary size-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {store.name}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {store.code} · {quantity.toLocaleString()} on hand
                    </span>
                  </span>
                  {locked && (
                    <span className="text-muted-foreground text-xs">
                      Stock remains
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <p className="text-muted-foreground text-xs">
            At least one assigned active store must remain selected.
          </p>
          <ActionMessage state={state} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {state.status === "conflict" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => router.refresh()}
              >
                <RefreshCw /> Reload product
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || selected.size === 0}>
              {pending ? "Saving…" : "Save availability"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LowStockAlertPreferencesForm({
  tenantSlug,
  preferences,
  disabled,
}: {
  tenantSlug: string;
  preferences: LowStockAlertPreferences;
  disabled: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(preferences.enabled);
  const [includeLowStock, setIncludeLowStock] = React.useState(
    preferences.includeLowStock,
  );
  const [includeOutOfStock, setIncludeOutOfStock] = React.useState(
    preferences.includeOutOfStock,
  );
  const [state, action, pending] = React.useActionState(
    updateLowStockAlertPreferencesAction.bind(null, tenantSlug),
    initialState,
  );
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
  }, [router, state]);
  const invalid = enabled && !includeLowStock && !includeOutOfStock;
  return (
    <form action={action} className="space-y-5">
      <input
        type="hidden"
        name="expectedVersion"
        value={state.version ?? preferences.version}
      />
      <label className="flex items-start gap-3 rounded-xl border p-4">
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          disabled={disabled}
          className="accent-primary mt-0.5 size-4 shrink-0"
        />
        <span>
          <span className="block text-sm font-semibold">
            Enable inventory alerts
          </span>
          <span className="text-muted-foreground mt-1 block text-sm leading-5">
            Show an attention queue for the active store using each
            product&apos;s reorder level.
          </span>
        </span>
      </label>
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="text-sm font-semibold">Include in the queue</legend>
        <label className="flex items-start gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            name="includeLowStock"
            checked={includeLowStock}
            onChange={(event) => setIncludeLowStock(event.target.checked)}
            className="accent-primary mt-0.5 size-4 shrink-0"
          />
          <span>
            <span className="block text-sm font-medium">Low stock</span>
            <span className="text-muted-foreground mt-0.5 block text-xs">
              Quantity is above zero and at or below the reorder level.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            name="includeOutOfStock"
            checked={includeOutOfStock}
            onChange={(event) => setIncludeOutOfStock(event.target.checked)}
            className="accent-primary mt-0.5 size-4 shrink-0"
          />
          <span>
            <span className="block text-sm font-medium">Out of stock</span>
            <span className="text-muted-foreground mt-0.5 block text-xs">
              Quantity is zero or below.
            </span>
          </span>
        </label>
      </fieldset>
      {invalid && (
        <p role="alert" className="bg-warning/20 rounded-lg p-3 text-sm">
          Choose low stock, out of stock, or both.
        </p>
      )}
      {disabled && (
        <p className="bg-muted text-muted-foreground rounded-lg p-3 text-sm">
          You can view this tenant policy, but only workspace settings managers
          can change it.
        </p>
      )}
      <ActionMessage state={state} />
      <div className="flex justify-end gap-2">
        {state.status === "conflict" && (
          <Button
            type="button"
            variant="outline"
            onClick={() => router.refresh()}
          >
            <RefreshCw /> Reload
          </Button>
        )}
        <Button type="submit" disabled={disabled || pending || invalid}>
          <Save /> {pending ? "Saving…" : "Save policy"}
        </Button>
      </div>
    </form>
  );
}
