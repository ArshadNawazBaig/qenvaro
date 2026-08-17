"use client";

import { Archive, RefreshCw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  archiveProductAction,
  type ProductActionState,
  updateProductAction,
} from "@/app/app/[tenantSlug]/products/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { SelectField } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TagBadge } from "@/components/tags/tag-badge";
import type { ProductDetail } from "@/modules/products/schemas";
import type { TagOption } from "@/modules/tags/schemas";
import type { UnitOption } from "@/modules/units/schemas";

const initialState: ProductActionState = { status: "idle", message: "" };

function ActionMessage({ state }: { state: ProductActionState }) {
  if (state.status === "idle" || state.status === "success") return null;
  return (
    <div
      role="alert"
      className={
        state.status === "conflict"
          ? "bg-warning/20 text-foreground rounded-lg p-3 text-sm"
          : "bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
      }
    >
      {state.message}
    </div>
  );
}

export function ProductDetailConsole({
  tenantSlug,
  product,
  categories,
  tags,
  units,
  canUpdate,
  canArchive,
  isDemo,
}: {
  tenantSlug: string;
  product: ProductDetail;
  categories: string[];
  tags: TagOption[];
  units: UnitOption[];
  canUpdate: boolean;
  canArchive: boolean;
  isDemo: boolean;
}) {
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [updateState, updateAction, updatePending] = React.useActionState(
    updateProductAction.bind(null, tenantSlug, product.id),
    initialState,
  );
  const [archiveState, archiveAction, archivePending] = React.useActionState(
    archiveProductAction.bind(null, tenantSlug, product.id),
    initialState,
  );

  React.useEffect(() => {
    if (updateState.status !== "success") return;
    toast.success(updateState.message);
    router.refresh();
  }, [router, updateState]);

  React.useEffect(() => {
    if (archiveState.status !== "success") return;
    toast.success(archiveState.message);
    router.refresh();
    const timeout = window.setTimeout(() => setArchiveOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [archiveState, router]);

  const archived = product.status === "archived";
  const updateDisabled = isDemo || !canUpdate || archived;
  const archiveDisabled = isDemo || !canArchive || archived;

  return (
    <div className="space-y-6">
      <Card id="edit" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>Catalog details</CardTitle>
          <CardDescription>
            Product identity and merchandising fields. Inventory quantities are
            managed through the inventory ledger.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateAction} className="space-y-5">
            <input
              type="hidden"
              name="expectedVersion"
              value={product.version}
            />
            <fieldset disabled={updateDisabled} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
                  Product name
                  <Input
                    name="name"
                    required
                    minLength={2}
                    defaultValue={product.name}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
                  Subtitle
                  <Input
                    name="subtitle"
                    maxLength={160}
                    defaultValue={product.subtitle}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
                  Description
                  <Textarea
                    name="description"
                    maxLength={4000}
                    defaultValue={product.description}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  SKU
                  <Input name="sku" required defaultValue={product.sku} />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Barcode
                  <Input
                    name="barcode"
                    maxLength={64}
                    defaultValue={product.barcode ?? ""}
                    placeholder="No barcode"
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Category
                  <SelectField
                    ariaLabel="Category"
                    name="category"
                    required
                    defaultValue={product.category}
                    options={[
                      ...(!categories.includes(product.category)
                        ? [
                            {
                              value: product.category,
                              label: product.category,
                            },
                          ]
                        : []),
                      ...categories.map((category) => ({
                        value: category,
                        label: category,
                      })),
                    ]}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Unit of measure
                  <SelectField
                    ariaLabel="Unit of measure"
                    name="unitId"
                    required
                    defaultValue={product.unitId ?? undefined}
                    placeholder="Choose a unit"
                    options={[
                      ...(product.unit &&
                      !units.some((unit) => unit.id === product.unitId)
                        ? [
                            {
                              value: product.unit.id,
                              label: `${product.unit.name} (${product.unit.symbol})`,
                            },
                          ]
                        : []),
                      ...units.map((unit) => ({
                        value: unit.id,
                        label: `${unit.name} (${unit.symbol})`,
                      })),
                    ]}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Price ({product.currency})
                  <Input
                    name="price"
                    inputMode="decimal"
                    pattern="\d+(\.\d{1,2})?"
                    required
                    defaultValue={(product.priceMinor / 100).toFixed(2)}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Cost ({product.currency})
                  <Input
                    name="cost"
                    inputMode="decimal"
                    pattern="\d+(\.\d{1,2})?"
                    required
                    defaultValue={(product.costMinor / 100).toFixed(2)}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Reorder threshold
                  <Input
                    name="reorderLevel"
                    type="number"
                    min="0"
                    step="1"
                    required
                    defaultValue={product.reorderLevel}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Status
                  <SelectField
                    ariaLabel="Product status"
                    name="status"
                    defaultValue={
                      product.status === "draft" ? "draft" : "active"
                    }
                    options={[
                      { value: "active", label: "Active" },
                      { value: "draft", label: "Draft" },
                    ]}
                  />
                </label>
                <div className="space-y-1.5 text-sm font-medium">
                  Product type
                  <div className="bg-muted/45 text-muted-foreground flex h-9 items-center rounded-md border px-3 text-xs capitalize">
                    {product.type === "simple"
                      ? "Stocked product"
                      : product.type}
                    {product.inventoryTracking
                      ? " · inventory tracked"
                      : " · no inventory"}
                  </div>
                </div>
                <div className="space-y-1.5 text-sm font-medium">
                  Stable slug
                  <div className="bg-muted/45 text-muted-foreground flex h-9 items-center rounded-md border px-3 font-mono text-xs">
                    {product.slug}
                  </div>
                </div>
                <fieldset className="space-y-2 sm:col-span-2">
                  <legend className="text-sm font-medium">Tags</legend>
                  <p className="text-muted-foreground text-xs">
                    Assign up to 20 active catalog tags.
                  </p>
                  {tags.length === 0 ? (
                    <p className="text-muted-foreground rounded-lg border px-3 py-3 text-xs">
                      No active tags are available. Create one from the Tags
                      page first.
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {tags.map((tag) => (
                        <label
                          key={tag.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2"
                        >
                          <Checkbox
                            name="tagIds"
                            value={tag.id}
                            defaultChecked={product.tagIds.includes(tag.id)}
                          />
                          <TagBadge name={tag.name} color={tag.color} />
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              </div>
            </fieldset>
            {updateDisabled && (
              <p className="bg-muted/55 text-muted-foreground rounded-lg p-3 text-sm">
                {isDemo
                  ? "Demo products are read-only. Sign in to a live tenant to make changes."
                  : archived
                    ? "Archived products are read-only."
                    : "Your tenant role does not allow product updates."}
              </p>
            )}
            <ActionMessage state={updateState} />
            <div className="flex flex-wrap justify-end gap-2">
              {updateState.status === "conflict" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.refresh()}
                >
                  <RefreshCw /> Reload latest
                </Button>
              )}
              <Button type="submit" disabled={updateDisabled || updatePending}>
                <Save /> {updatePending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card id="archive" className="border-destructive/25 scroll-mt-6">
        <CardHeader>
          <CardTitle>Archive product</CardTitle>
          <CardDescription>
            Remove this product from active catalog workflows. Existing stock
            levels and the inventory movement history remain unchanged.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground max-w-2xl text-sm">
            {archived
              ? "This product is archived and retained for historical reporting."
              : "Archiving is audited and prevents further catalog edits."}
          </p>
          <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" disabled={archiveDisabled}>
                <Archive /> {archived ? "Archived" : "Archive product"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle className="text-lg font-semibold">
                Archive {product.name}?
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-2 text-sm">
                The product becomes read-only. Inventory quantities and ledger
                entries will not be adjusted or deleted.
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
        </CardContent>
      </Card>
    </div>
  );
}
