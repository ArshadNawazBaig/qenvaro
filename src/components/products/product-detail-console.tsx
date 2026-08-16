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
import type { ProductDetail } from "@/modules/products/schemas";

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
  canUpdate,
  canArchive,
  isDemo,
}: {
  tenantSlug: string;
  product: ProductDetail;
  categories: string[];
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
                <label className="space-y-1.5 text-sm font-medium">
                  SKU
                  <Input name="sku" required defaultValue={product.sku} />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Category
                  <select
                    name="category"
                    required
                    defaultValue={product.category}
                    className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
                  >
                    {!categories.includes(product.category) && (
                      <option value={product.category}>
                        {product.category}
                      </option>
                    )}
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
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
                  <select
                    name="status"
                    defaultValue={
                      product.status === "draft" ? "draft" : "active"
                    }
                    className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                  </select>
                </label>
                <div className="space-y-1.5 text-sm font-medium">
                  Stable slug
                  <div className="bg-muted/45 text-muted-foreground flex h-9 items-center rounded-md border px-3 font-mono text-xs">
                    {product.slug}
                  </div>
                </div>
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
