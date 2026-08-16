"use client";

import {
  Archive,
  Boxes,
  Layers3,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  archiveOptionGroupAction,
  archiveVariantAction,
  createOptionGroupAction,
  createVariantAction,
  type VariantActionState,
  updateOptionGroupAction,
  updateVariantAction,
} from "@/app/app/[tenantSlug]/products/[productId]/variants/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { ProductDetail } from "@/modules/products/schemas";
import type {
  ProductOptionGroup,
  ProductVariantItem,
} from "@/modules/variants/schemas";

const initialState: VariantActionState = { status: "idle", message: "" };

function ActionMessage({ state }: { state: VariantActionState }) {
  if (!state.message || state.status === "success") return null;
  return (
    <p
      role="alert"
      className={
        state.status === "conflict"
          ? "bg-warning/20 text-foreground rounded-lg p-3 text-sm"
          : "bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
      }
    >
      {state.message}
    </p>
  );
}

function useSuccessfulAction(
  state: VariantActionState,
  close?: React.Dispatch<React.SetStateAction<boolean>>,
) {
  const router = useRouter();
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
    if (!close) return;
    const timeout = window.setTimeout(() => close(false), 0);
    return () => window.clearTimeout(timeout);
  }, [close, router, state]);
}

function NewOptionGroupDialog({
  tenantSlug,
  product,
  disabled,
}: {
  tenantSlug: string;
  product: ProductDetail;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = React.useActionState(
    createOptionGroupAction.bind(null, tenantSlug, product.id),
    initialState,
  );
  useSuccessfulAction(state, setOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Layers3 /> Add option
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Add an option group
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Define a dimension such as Color or Size before creating sellable
          combinations.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <input
            type="hidden"
            name="expectedProductVersion"
            value={product.version}
          />
          <label className="space-y-1.5 text-sm font-medium">
            Option name
            <Input
              name="name"
              required
              minLength={2}
              maxLength={40}
              placeholder="Color"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Values (comma-separated)
            <Input name="values" required placeholder="Black, Tan, Olive" />
          </label>
          <p className="text-muted-foreground text-xs">
            Add 2–20 unique values. Existing values remain stable once variants
            use them.
          </p>
          <ActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add option group"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OptionGroupActions({
  tenantSlug,
  product,
  group,
  canUpdate,
  canArchive,
  isDemo,
}: {
  tenantSlug: string;
  product: ProductDetail;
  group: ProductOptionGroup;
  canUpdate: boolean;
  canArchive: boolean;
  isDemo: boolean;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [updateState, updateAction, updatePending] = React.useActionState(
    updateOptionGroupAction.bind(null, tenantSlug, product.id, group.id),
    initialState,
  );
  const [archiveState, archiveAction, archivePending] = React.useActionState(
    archiveOptionGroupAction.bind(null, tenantSlug, product.id, group.id),
    initialState,
  );
  useSuccessfulAction(updateState, setEditOpen);
  useSuccessfulAction(archiveState, setArchiveOpen);
  const archived = group.status === "archived";
  const editDisabled = isDemo || !canUpdate || archived;
  const archiveDisabled =
    isDemo || !canArchive || archived || group.activeVariantCount > 0;

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={editDisabled}
            aria-label={`Edit ${group.name} option`}
          >
            <Pencil /> Edit
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Edit {group.name}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            Rename the group or append values. Existing value identities and
            variant combinations remain unchanged.
          </DialogDescription>
          <form action={updateAction} className="mt-5 space-y-4">
            <input
              type="hidden"
              name="expectedProductVersion"
              value={product.version}
            />
            <label className="space-y-1.5 text-sm font-medium">
              Option name
              <Input
                name="name"
                required
                minLength={2}
                maxLength={40}
                defaultValue={group.name}
              />
            </label>
            <div className="space-y-2">
              <p className="text-sm font-medium">Existing values</p>
              <div className="flex flex-wrap gap-2">
                {group.values.map((value) => (
                  <Badge key={value.id} variant="secondary">
                    {value.label}
                  </Badge>
                ))}
              </div>
            </div>
            <label className="space-y-1.5 text-sm font-medium">
              New values (optional, comma-separated)
              <Input name="newValues" placeholder="Stone, Navy" />
            </label>
            <ActionMessage state={updateState} />
            <div className="flex justify-end gap-2">
              {updateState.status === "conflict" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCw /> Reload
                </Button>
              )}
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={updatePending}>
                {updatePending ? "Saving…" : "Save option"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={archiveDisabled}
            aria-label={`Archive ${group.name} option`}
            title={
              group.activeVariantCount > 0
                ? "Archive variants using this option first"
                : undefined
            }
          >
            <Archive className="text-destructive" /> Archive
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Archive {group.name}?
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            The option and its values remain in historical variant records but
            cannot be used for new combinations.
          </DialogDescription>
          <form action={archiveAction} className="mt-6 space-y-4">
            <input
              type="hidden"
              name="expectedVersion"
              value={product.version}
            />
            <ActionMessage state={archiveState} />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="destructive"
                disabled={archivePending}
              >
                {archivePending ? "Archiving…" : "Confirm archive"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewVariantDialog({
  tenantSlug,
  product,
  disabled,
}: {
  tenantSlug: string;
  product: ProductDetail;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = React.useActionState(
    createVariantAction.bind(null, tenantSlug, product.id),
    initialState,
  );
  useSuccessfulAction(state, setOpen);
  const groups = product.optionGroups.filter(
    (group) => group.status === "active",
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus /> New variant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto">
        <DialogTitle className="text-lg font-semibold">
          Create a sellable variant
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Choose one value per option. The new variant starts at zero stock;
          inventory is added later through the ledger workflow.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <input
            type="hidden"
            name="expectedProductVersion"
            value={product.version}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((group) => (
              <label key={group.id} className="space-y-1.5 text-sm font-medium">
                {group.name}
                <select
                  name="optionValue"
                  required
                  defaultValue=""
                  className="border-input bg-card h-10 w-full rounded-lg border px-3 text-sm"
                >
                  <option value="" disabled>
                    Select {group.name.toLowerCase()}
                  </option>
                  {group.values.map((value) => (
                    <option key={value.id} value={`${group.id}:${value.id}`}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              Variant SKU
              <Input
                name="sku"
                required
                maxLength={64}
                placeholder="SKU-BLK-M"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Price ({product.currency})
              <Input
                name="price"
                required
                inputMode="decimal"
                pattern="\d+(\.\d{1,2})?"
                defaultValue={(product.priceMinor / 100).toFixed(2)}
              />
            </label>
          </div>
          <ActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create variant"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VariantActions({
  tenantSlug,
  product,
  variant,
  canUpdate,
  canArchive,
  isDemo,
}: {
  tenantSlug: string;
  product: ProductDetail;
  variant: ProductVariantItem;
  canUpdate: boolean;
  canArchive: boolean;
  isDemo: boolean;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [updateState, updateAction, updatePending] = React.useActionState(
    updateVariantAction.bind(null, tenantSlug, product.id, variant.id),
    initialState,
  );
  const [archiveState, archiveAction, archivePending] = React.useActionState(
    archiveVariantAction.bind(null, tenantSlug, product.id, variant.id),
    initialState,
  );
  useSuccessfulAction(updateState, setEditOpen);
  useSuccessfulAction(archiveState, setArchiveOpen);

  if (variant.isDefault)
    return (
      <span className="text-muted-foreground text-xs">
        Managed in catalog details
      </span>
    );
  if (variant.status === "archived")
    return <span className="text-muted-foreground text-xs">Read-only</span>;

  return (
    <div className="flex justify-end gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isDemo || !canUpdate}
            aria-label={`Edit ${variant.name} variant`}
          >
            <Pencil /> Edit
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Edit {variant.name}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            SKU and price can change. The option combination remains fixed to
            preserve inventory identity and history.
          </DialogDescription>
          <form action={updateAction} className="mt-5 space-y-4">
            <input
              type="hidden"
              name="expectedVariantVersion"
              value={variant.version}
            />
            <label className="space-y-1.5 text-sm font-medium">
              Variant SKU
              <Input
                name="sku"
                required
                maxLength={64}
                defaultValue={variant.sku}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Price ({variant.currency})
              <Input
                name="price"
                required
                inputMode="decimal"
                pattern="\d+(\.\d{1,2})?"
                defaultValue={(variant.priceMinor / 100).toFixed(2)}
              />
            </label>
            <ActionMessage state={updateState} />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={updatePending}>
                {updatePending ? "Saving…" : "Save variant"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isDemo || !canArchive || variant.authorizedStock !== 0}
            aria-label={`Archive ${variant.name} variant`}
            title={
              variant.authorizedStock !== 0
                ? "Reduce this variant to zero stock first"
                : undefined
            }
          >
            <Archive className="text-destructive" /> Archive
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Archive {variant.name}?
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            Only a zero-stock variant can be archived. Inventory levels and
            movement history are retained unchanged.
          </DialogDescription>
          <form action={archiveAction} className="mt-6 space-y-4">
            <input
              type="hidden"
              name="expectedVersion"
              value={variant.version}
            />
            <ActionMessage state={archiveState} />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="destructive"
                disabled={archivePending}
              >
                {archivePending ? "Archiving…" : "Confirm archive"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function VariantManagement({
  tenantSlug,
  product,
  canUpdate,
  canArchive,
  isDemo,
}: {
  tenantSlug: string;
  product: ProductDetail;
  canUpdate: boolean;
  canArchive: boolean;
  isDemo: boolean;
}) {
  const activeGroups = product.optionGroups.filter(
    (group) => group.status === "active",
  );
  const hasConfiguredVariants = product.variants.some(
    (variant) => !variant.isDefault && variant.status === "active",
  );
  const productReadOnly = product.status === "archived";
  const addOptionDisabled =
    isDemo ||
    !canUpdate ||
    productReadOnly ||
    activeGroups.length >= 3 ||
    hasConfiguredVariants;
  const addVariantDisabled =
    isDemo || !canUpdate || productReadOnly || activeGroups.length === 0;

  return (
    <Card>
      <CardHeader className="sm:grid-cols-[minmax(0,1fr)_auto]">
        <CardTitle className="flex items-center gap-2">
          <Boxes className="size-4" /> Variants & options
        </CardTitle>
        <CardDescription>
          Stable sellable combinations with tenant-wide unique SKUs and
          inventory-safe lifecycle controls.
        </CardDescription>
        <div className="col-start-1 row-start-3 mt-3 flex flex-wrap gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:justify-end">
          <NewOptionGroupDialog
            tenantSlug={tenantSlug}
            product={product}
            disabled={addOptionDisabled}
          />
          <NewVariantDialog
            tenantSlug={tenantSlug}
            product={product}
            disabled={addVariantDisabled}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Option groups</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Configure up to three groups before creating variants. Values can
              be appended later without rewriting combinations.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="text-success-foreground size-4" />
            Inventory changes stay in the ledger
          </div>
        </div>

        {product.optionGroups.length === 0 ? (
          <div className="bg-muted/35 rounded-lg border border-dashed p-5">
            <p className="text-sm font-medium">No options configured</p>
            <p className="text-muted-foreground mt-1 text-xs">
              The base variant remains sellable. Add Color, Size, or another
              option group to create additional combinations.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {product.optionGroups.map((group) => (
              <div
                key={group.id}
                className="flex min-w-0 flex-col gap-3 rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{group.name}</p>
                      <Badge
                        variant={
                          group.status === "active" ? "success" : "secondary"
                        }
                        className="capitalize"
                      >
                        {group.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {group.activeVariantCount} active variant
                      {group.activeVariantCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <OptionGroupActions
                    key={`${product.version}:${group.id}`}
                    tenantSlug={tenantSlug}
                    product={product}
                    group={group}
                    canUpdate={canUpdate}
                    canArchive={canArchive}
                    isDemo={isDemo}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.values.map((value) => (
                    <Badge key={value.id} variant="outline">
                      {value.label}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <div
        className="overflow-x-auto border-t"
        role="region"
        aria-label="Product variants"
        tabIndex={0}
      >
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-muted/35 text-muted-foreground border-b text-xs">
            <tr>
              <th className="h-11 px-4 font-medium">Variant</th>
              <th className="h-11 px-4 font-medium">Options</th>
              <th className="h-11 px-4 font-medium">SKU</th>
              <th className="h-11 px-4 font-medium">Price</th>
              <th className="h-11 px-4 font-medium">Authorized stock</th>
              <th className="h-11 px-4 font-medium">Status</th>
              <th className="h-11 px-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {product.variants.map((variant) => (
              <tr
                key={variant.id}
                className="hover:bg-muted/25 border-b last:border-0"
              >
                <td className="px-4 py-4">
                  <p className="font-semibold">{variant.name}</p>
                  {variant.isDefault && (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Base product record
                    </p>
                  )}
                </td>
                <td className="px-4 py-4">
                  {variant.optionValues.length === 0 ? (
                    <span className="text-muted-foreground text-xs">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {variant.optionValues.map((value) => (
                        <Badge
                          key={`${value.optionId}:${value.valueId}`}
                          variant="outline"
                        >
                          {value.optionName}: {value.valueLabel}
                        </Badge>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-4 font-mono text-xs">{variant.sku}</td>
                <td className="px-4 py-4 font-medium">
                  {formatMoney({
                    amountMinor: variant.priceMinor,
                    currency: variant.currency,
                  })}
                </td>
                <td className="px-4 py-4">
                  {variant.authorizedStock.toLocaleString()}
                </td>
                <td className="px-4 py-4">
                  <Badge
                    variant={
                      variant.status === "active" ? "success" : "secondary"
                    }
                    className="capitalize"
                  >
                    {variant.isDefault ? "base" : variant.status}
                  </Badge>
                </td>
                <td className="px-4 py-4 text-right">
                  <VariantActions
                    key={variant.version}
                    tenantSlug={tenantSlug}
                    product={product}
                    variant={variant}
                    canUpdate={canUpdate}
                    canArchive={canArchive}
                    isDemo={isDemo}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
