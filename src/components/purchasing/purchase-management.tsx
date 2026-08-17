"use client";

import {
  CheckCircle2,
  PackageCheck,
  Plus,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  createPurchaseOrderAction,
  receivePurchaseOrderAction,
  transitionPurchaseOrderAction,
} from "@/app/app/[tenantSlug]/suppliers/actions";
import {
  PurchasingActionMessage,
  purchasingInitialState,
  purchasingSelectClass,
} from "@/components/purchasing/action-message";
import { Badge } from "@/components/ui/badge";
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
import { formatMoney } from "@/lib/money";
import type {
  PurchaseOrderListItem,
  PurchasingReferenceData,
} from "@/modules/purchasing/schemas";

function money(amountMinor: number, currency: string) {
  return formatMoney({ amountMinor, currency });
}

interface EditableLine {
  key: string;
  variantId: string;
  quantity: number;
  unitCost: string;
  taxPercent: string;
}

export function NewPurchaseDialog({
  tenantSlug,
  reference,
  disabled,
}: {
  tenantSlug: string;
  reference: PurchasingReferenceData;
  disabled: boolean;
}) {
  const initialVariant = reference.variants[0];
  const [open, setOpen] = React.useState(false);
  const [lines, setLines] = React.useState<EditableLine[]>(() =>
    initialVariant
      ? [
          {
            key: crypto.randomUUID(),
            variantId: initialVariant.id,
            quantity: 1,
            unitCost: (initialVariant.costMinor / 100).toFixed(2),
            taxPercent: "0",
          },
        ]
      : [],
  );
  const [idempotencyKey, setIdempotencyKey] = React.useState(() =>
    crypto.randomUUID(),
  );
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    createPurchaseOrderAction.bind(null, tenantSlug),
    purchasingInitialState,
  );
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
    const timeout = window.setTimeout(() => {
      setIdempotencyKey(crypto.randomUUID());
      setOpen(false);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [router, state]);
  function patchLine(key: string, patch: Partial<EditableLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }
  const serialized = JSON.stringify(
    lines.map((line) => ({
      variantId: line.variantId,
      quantity: Number(line.quantity),
      unitCost: line.unitCost,
      taxRateBps: Math.round(Number(line.taxPercent) * 100),
    })),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus /> New purchase order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogTitle className="text-lg font-semibold">
          Create purchase order
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Product, SKU, supplier, unit cost, and tax are snapshotted for
          historical accuracy.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <input type="hidden" name="lines" value={serialized} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              Supplier
              <select name="supplierId" className={purchasingSelectClass}>
                {reference.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.supplierCode} · {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Receiving store
              <select name="storeId" className={purchasingSelectClass}>
                {reference.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Expected delivery
              <Input name="expectedDeliveryDate" type="date" />
            </label>
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Order lines</legend>
            {lines.map((line) => (
              <div
                key={line.key}
                className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1.5fr)_90px_130px_90px_auto]"
              >
                <label className="space-y-1 text-xs font-medium">
                  SKU
                  <select
                    value={line.variantId}
                    className={purchasingSelectClass}
                    onChange={(event) => {
                      const variant = reference.variants.find(
                        (item) => item.id === event.target.value,
                      );
                      patchLine(line.key, {
                        variantId: event.target.value,
                        unitCost: variant
                          ? (variant.costMinor / 100).toFixed(2)
                          : line.unitCost,
                      });
                    }}
                  >
                    {reference.variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.sku} · {variant.productName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium">
                  Quantity
                  <Input
                    type="number"
                    min={1}
                    max={1_000_000}
                    value={line.quantity}
                    onChange={(event) =>
                      patchLine(line.key, {
                        quantity: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-xs font-medium">
                  Unit cost
                  <Input
                    inputMode="decimal"
                    value={line.unitCost}
                    onChange={(event) =>
                      patchLine(line.key, { unitCost: event.target.value })
                    }
                  />
                </label>
                <label className="space-y-1 text-xs font-medium">
                  Tax %
                  <Input
                    inputMode="decimal"
                    value={line.taxPercent}
                    onChange={(event) =>
                      patchLine(line.key, { taxPercent: event.target.value })
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((item) => item.key !== line.key),
                    )
                  }
                  aria-label="Remove purchase line"
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                initialVariant &&
                setLines((current) => [
                  ...current,
                  {
                    key: crypto.randomUUID(),
                    variantId: initialVariant.id,
                    quantity: 1,
                    unitCost: (initialVariant.costMinor / 100).toFixed(2),
                    taxPercent: "0",
                  },
                ])
              }
            >
              <Plus /> Add line
            </Button>
          </fieldset>
          <label className="space-y-1.5 text-sm font-medium">
            Internal note
            <textarea
              name="note"
              maxLength={1000}
              rows={2}
              className="border-input bg-card focus-visible:ring-ring w-full rounded-lg border p-3 text-sm outline-none focus-visible:ring-2"
            />
          </label>
          <PurchasingActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || lines.length === 0}>
              {pending ? "Creating…" : "Create draft"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Transition({
  tenantSlug,
  order,
  target,
}: {
  tenantSlug: string;
  order: PurchaseOrderListItem;
  target: "submitted" | "approved" | "cancelled";
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    transitionPurchaseOrderAction.bind(null, tenantSlug, order.id, target),
    purchasingInitialState,
  );
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
    const timeout = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [router, state]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={target === "cancelled" ? "outline" : "default"}
        >
          {target === "submitted" ? (
            <Send />
          ) : target === "approved" ? (
            <CheckCircle2 />
          ) : (
            <XCircle />
          )}
          {target === "submitted"
            ? "Submit"
            : target === "approved"
              ? "Approve"
              : "Cancel"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Move {order.purchaseOrderNumber} to {target}?
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          This state transition is validated and audited on the server.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <input type="hidden" name="expectedVersion" value={order.version} />
          {target === "cancelled" && (
            <label className="space-y-1.5 text-sm font-medium">
              Cancellation reason
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={500}
                rows={3}
                className="border-input bg-card w-full rounded-lg border p-3 text-sm"
              />
            </label>
          )}
          <PurchasingActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Back
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={target === "cancelled" ? "destructive" : "default"}
              disabled={pending}
            >
              {pending ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Receive({
  tenantSlug,
  order,
}: {
  tenantSlug: string;
  order: PurchaseOrderListItem;
}) {
  const [open, setOpen] = React.useState(false);
  const [idempotencyKey, setIdempotencyKey] = React.useState(() =>
    crypto.randomUUID(),
  );
  const router = useRouter();
  const [quantities, setQuantities] = React.useState<Record<string, number>>(
    {},
  );
  const [state, action, pending] = React.useActionState(
    receivePurchaseOrderAction.bind(null, tenantSlug, order.id),
    purchasingInitialState,
  );
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
    const timeout = window.setTimeout(() => {
      setIdempotencyKey(crypto.randomUUID());
      setOpen(false);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [router, state]);
  const lines = JSON.stringify(
    order.lines.map((line) => ({
      lineId: line.lineId,
      quantity: quantities[line.lineId] ?? 0,
    })),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PackageCheck /> Receive
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogTitle className="text-lg font-semibold">
          Receive {order.purchaseOrderNumber}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Receiving creates an immutable goods receipt and updates the inventory
          ledger atomically.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <input type="hidden" name="expectedVersion" value={order.version} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <input type="hidden" name="lines" value={lines} />
          <div className="divide-y rounded-xl border">
            {order.lines.map((line) => {
              const remaining = line.orderedQuantity - line.receivedQuantity;
              return (
                <label
                  key={line.lineId}
                  className="grid grid-cols-[minmax(0,1fr)_100px] items-center gap-3 p-3 text-sm"
                >
                  <span>
                    <strong>{line.productName}</strong>
                    <span className="text-muted-foreground block text-xs">
                      {line.sku} · {remaining} remaining
                    </span>
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={remaining}
                    value={quantities[line.lineId] ?? 0}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [line.lineId]: Number(event.target.value),
                      }))
                    }
                    aria-label={`Receive quantity for ${line.sku}`}
                  />
                </label>
              );
            })}
          </div>
          <label className="space-y-1.5 text-sm font-medium">
            Receipt note
            <textarea
              name="note"
              maxLength={500}
              rows={2}
              className="border-input bg-card w-full rounded-lg border p-3 text-sm"
            />
          </label>
          <PurchasingActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Receiving…" : "Receive stock"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PurchaseManagement({
  tenantSlug,
  orders,
  permissions,
  isDemo,
}: {
  tenantSlug: string;
  orders: PurchaseOrderListItem[];
  permissions: {
    canCreate: boolean;
    canApprove: boolean;
    canReceive: boolean;
    canCancel: boolean;
  };
  isDemo: boolean;
}) {
  if (orders.length === 0)
    return (
      <div className="p-10 text-center">
        <p className="font-medium">No purchase orders</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Create the first draft to begin purchasing.
        </p>
      </div>
    );
  return (
    <div className="divide-y">
      {orders.map((order) => (
        <article key={order.id} className="space-y-4 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{order.purchaseOrderNumber}</h2>
                <Badge
                  variant={
                    order.status === "received"
                      ? "success"
                      : order.status === "cancelled"
                        ? "destructive"
                        : order.status === "approved" ||
                            order.status === "partially_received"
                          ? "warning"
                          : "secondary"
                  }
                >
                  {order.status.replace("_", " ")}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {order.storeName}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                {order.supplierName} · {order.lines.length} line
                {order.lines.length === 1 ? "" : "s"} · expected{" "}
                {order.expectedDeliveryDate || "not set"}
              </p>
              <p className="mt-2 font-semibold">
                {money(order.totalMinor, order.currency)}{" "}
                <span className="text-muted-foreground text-xs font-normal">
                  including {money(order.taxMinor, order.currency)} tax
                </span>
              </p>
            </div>
            {!isDemo && (
              <div className="flex flex-wrap justify-end gap-2">
                {order.status === "draft" && permissions.canCreate && (
                  <Transition
                    tenantSlug={tenantSlug}
                    order={order}
                    target="submitted"
                  />
                )}
                {order.status === "submitted" && permissions.canApprove && (
                  <Transition
                    tenantSlug={tenantSlug}
                    order={order}
                    target="approved"
                  />
                )}
                {["draft", "submitted", "approved"].includes(order.status) &&
                  permissions.canCancel && (
                    <Transition
                      tenantSlug={tenantSlug}
                      order={order}
                      target="cancelled"
                    />
                  )}
                {["approved", "partially_received"].includes(order.status) &&
                  permissions.canReceive && (
                    <Receive tenantSlug={tenantSlug} order={order} />
                  )}
              </div>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-muted/45 text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Ordered</th>
                  <th className="px-3 py-2">Received</th>
                  <th className="px-3 py-2 text-right">Unit cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {order.lines.map((line) => (
                  <tr key={line.lineId}>
                    <td className="px-3 py-2">
                      <strong>{line.productName}</strong>
                      <span className="text-muted-foreground block text-xs">
                        {line.sku}
                      </span>
                    </td>
                    <td className="px-3 py-2">{line.orderedQuantity}</td>
                    <td className="px-3 py-2">{line.receivedQuantity}</td>
                    <td className="px-3 py-2 text-right">
                      {money(line.unitCostMinor, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </div>
  );
}
