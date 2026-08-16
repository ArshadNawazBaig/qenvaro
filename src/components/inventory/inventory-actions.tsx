"use client";

import {
  ArrowRight,
  ArrowRightLeft,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  createStockAdjustmentAction,
  createStockTransferAction,
  type InventoryActionState,
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
import { Input } from "@/components/ui/input";
import type { InventoryVariantOption } from "@/modules/inventory/schemas";

const initialState: InventoryActionState = { status: "idle", message: "" };
const selectClassName =
  "border-input bg-card h-10 w-full rounded-lg border px-3 text-sm shadow-[var(--shadow-button)] disabled:cursor-not-allowed disabled:opacity-50";

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

function optionLabel(option: InventoryVariantOption): string {
  const variant =
    option.variantName === "Default variant" ? "" : ` · ${option.variantName}`;
  const archived =
    option.productStatus === "archived" || option.variantStatus === "archived"
      ? " · Archived"
      : "";
  return `${option.productName}${variant} · ${option.sku}${archived}`;
}

function levelFor(
  option: InventoryVariantOption | undefined,
  storeId: string,
): { quantity: number; version: number } {
  return (
    option?.levels.find((level) => level.storeId === storeId) ?? {
      quantity: 0,
      version: 0,
    }
  );
}

function createRequestKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

export function StockAdjustmentDialog({
  tenantSlug,
  stores,
  variants,
  activeStoreId,
  disabled,
}: {
  tenantSlug: string;
  stores: StoreOption[];
  variants: InventoryVariantOption[];
  activeStoreId: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [storeId, setStoreId] = React.useState(
    activeStoreId ?? stores[0]?.id ?? "",
  );
  const availableVariants = variants.filter((variant) =>
    variant.availableStoreIds.includes(storeId),
  );
  const [variantId, setVariantId] = React.useState(
    availableVariants[0]?.variantId ?? "",
  );
  const [requestKey, setRequestKey] = React.useState("");
  const [state, action, pending] = React.useActionState(
    createStockAdjustmentAction.bind(null, tenantSlug),
    initialState,
  );
  const selected =
    availableVariants.find((variant) => variant.variantId === variantId) ??
    availableVariants[0];
  const level = levelFor(selected, storeId);

  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
    const timeout = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [router, state]);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) setRequestKey(createRequestKey("adjustment"));
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={disabled || stores.length === 0 || variants.length === 0}
        >
          <SlidersHorizontal /> New adjustment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Post a stock adjustment
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          This creates a permanent ledger entry. It cannot be edited after
          posting.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <input
            type="hidden"
            name="expectedLevelVersion"
            value={level.version}
          />
          <input type="hidden" name="idempotencyKey" value={requestKey} />
          <label className="block space-y-1.5 text-sm font-medium">
            Store
            <select
              name="storeId"
              className={selectClassName}
              value={storeId}
              onChange={(event) => setStoreId(event.target.value)}
              required
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.code})
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Product / SKU
            <select
              name="variantId"
              className={selectClassName}
              value={selected?.variantId ?? ""}
              onChange={(event) => setVariantId(event.target.value)}
              required
            >
              {availableVariants.map((option) => (
                <option key={option.variantId} value={option.variantId}>
                  {optionLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <div className="bg-muted/60 flex items-center justify-between rounded-lg px-3 py-2 text-sm">
            <span className="text-muted-foreground">Current on hand</span>
            <strong>{level.quantity.toLocaleString()}</strong>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-medium">
              Change
              <select
                name="mode"
                className={selectClassName}
                defaultValue="increase"
              >
                <option value="increase">Increase by</option>
                <option value="decrease">Decrease by</option>
                <option value="set">Set exact count</option>
              </select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Quantity
              <Input
                name="quantity"
                type="number"
                inputMode="numeric"
                min={0}
                max={1_000_000}
                defaultValue={1}
                required
              />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm font-medium">
            Reason
            <select
              name="reason"
              className={selectClassName}
              defaultValue="cycle_count"
            >
              <option value="cycle_count">Cycle count</option>
              <option value="other_receipt">Other receipt</option>
              <option value="damaged">Damaged stock</option>
              <option value="expired">Expired stock</option>
              <option value="correction">Data correction</option>
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Note
            <textarea
              name="note"
              minLength={3}
              maxLength={500}
              rows={3}
              required
              placeholder="Why is this stock changing?"
              className="border-input bg-card w-full resize-y rounded-lg border p-3 text-sm"
            />
          </label>
          <ActionMessage state={state} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {state.status === "conflict" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => router.refresh()}
              >
                <RefreshCw /> Reload stock
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={pending || !selected || !requestKey}
            >
              {pending ? "Posting…" : "Post adjustment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EditableTransferLine {
  key: string;
  variantId: string;
  quantity: number;
}

export function StockTransferDialog({
  tenantSlug,
  stores,
  variants,
  activeStoreId,
  disabled,
}: {
  tenantSlug: string;
  stores: StoreOption[];
  variants: InventoryVariantOption[];
  activeStoreId: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const initialFrom = activeStoreId ?? stores[0]?.id ?? "";
  const [open, setOpen] = React.useState(false);
  const [fromStoreId, setFromStoreId] = React.useState(initialFrom);
  const [toStoreId, setToStoreId] = React.useState(
    stores.find((store) => store.id !== initialFrom)?.id ?? "",
  );
  const eligible = variants.filter(
    (variant) =>
      variant.availableStoreIds.includes(fromStoreId) &&
      variant.availableStoreIds.includes(toStoreId),
  );
  const [lines, setLines] = React.useState<EditableTransferLine[]>([
    { key: "line-1", variantId: "", quantity: 1 },
  ]);
  const [requestKey, setRequestKey] = React.useState("");
  const [state, action, pending] = React.useActionState(
    createStockTransferAction.bind(null, tenantSlug),
    initialState,
  );
  const serializedLines = lines.map((line) => {
    const option = eligible.find(
      (variant) => variant.variantId === line.variantId,
    );
    return {
      variantId: line.variantId,
      quantity: line.quantity,
      expectedSourceVersion: levelFor(option, fromStoreId).version,
      expectedDestinationVersion: levelFor(option, toStoreId).version,
    };
  });

  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
    const timeout = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [router, state]);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) setRequestKey(createRequestKey("transfer"));
  }

  function updateLine(key: string, change: Partial<EditableTransferLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...change } : line)),
    );
  }

  function addLine() {
    setLines((current) => [
      ...current,
      { key: createRequestKey("line"), variantId: "", quantity: 1 },
    ]);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={disabled || stores.length < 2 || variants.length === 0}
        >
          <ArrowRightLeft /> New transfer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="text-lg font-semibold">
          Transfer stock
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Source and destination quantities are posted together as one completed
          transfer.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-5">
          <input type="hidden" name="idempotencyKey" value={requestKey} />
          <input
            type="hidden"
            name="linesJson"
            value={JSON.stringify(serializedLines)}
          />
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <label className="block space-y-1.5 text-sm font-medium">
              From store
              <select
                name="fromStoreId"
                className={selectClassName}
                value={fromStoreId}
                onChange={(event) => {
                  const next = event.target.value;
                  setFromStoreId(next);
                  if (next === toStoreId)
                    setToStoreId(
                      stores.find((store) => store.id !== next)?.id ?? "",
                    );
                }}
                required
              >
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name} ({store.code})
                  </option>
                ))}
              </select>
            </label>
            <ArrowRight className="text-muted-foreground mb-3 hidden size-4 sm:block" />
            <label className="block space-y-1.5 text-sm font-medium">
              To store
              <select
                name="toStoreId"
                className={selectClassName}
                value={toStoreId}
                onChange={(event) => setToStoreId(event.target.value)}
                required
              >
                {stores
                  .filter((store) => store.id !== fromStoreId)
                  .map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} ({store.code})
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Transfer lines</p>
                <p className="text-muted-foreground text-xs">
                  Up to 20 unique SKUs
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addLine}
                disabled={lines.length >= 20}
              >
                <Plus /> Add line
              </Button>
            </div>
            {lines.map((line, index) => {
              const option = eligible.find(
                (variant) => variant.variantId === line.variantId,
              );
              const level = levelFor(option, fromStoreId);
              const usedIds = new Set(
                lines
                  .filter((candidate) => candidate.key !== line.key)
                  .map((candidate) => candidate.variantId),
              );
              return (
                <div
                  key={line.key}
                  className="bg-muted/40 grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end"
                >
                  <label className="block space-y-1.5 text-sm font-medium">
                    SKU {index + 1}
                    <select
                      className={selectClassName}
                      value={line.variantId}
                      onChange={(event) =>
                        updateLine(line.key, { variantId: event.target.value })
                      }
                      required
                    >
                      <option value="">Select a product</option>
                      {eligible
                        .filter(
                          (candidate) => !usedIds.has(candidate.variantId),
                        )
                        .map((candidate) => (
                          <option
                            key={candidate.variantId}
                            value={candidate.variantId}
                          >
                            {optionLabel(candidate)} ·{" "}
                            {levelFor(candidate, fromStoreId).quantity} on hand
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block space-y-1.5 text-sm font-medium">
                    Quantity
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={Math.max(1, level.quantity)}
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.key, {
                          quantity: Number(event.target.value),
                        })
                      }
                      required
                    />
                  </label>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove transfer line ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter(
                          (candidate) => candidate.key !== line.key,
                        ),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>
          <label className="block space-y-1.5 text-sm font-medium">
            Transfer note
            <textarea
              name="note"
              minLength={3}
              maxLength={500}
              rows={3}
              required
              placeholder="Reason, courier, or internal reference"
              className="border-input bg-card w-full resize-y rounded-lg border p-3 text-sm"
            />
          </label>
          <ActionMessage state={state} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {state.status === "conflict" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => router.refresh()}
              >
                <RefreshCw /> Reload stock
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={
                pending ||
                !requestKey ||
                lines.some(
                  (line) =>
                    !line.variantId ||
                    line.quantity < 1 ||
                    !eligible.some(
                      (variant) => variant.variantId === line.variantId,
                    ),
                )
              }
            >
              {pending ? "Completing…" : "Complete transfer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
