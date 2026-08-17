"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createProductAction,
  type ProductActionState,
} from "@/app/app/[tenantSlug]/products/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { TagOption } from "@/modules/tags/schemas";
import type { UnitOption } from "@/modules/units/schemas";

const initialState: ProductActionState = { status: "idle", message: "" };

export function NewProductDialog({
  tenantSlug,
  currency,
  categories = [],
  tags = [],
  units = [],
  disabled = false,
}: {
  tenantSlug: string;
  currency: string;
  categories?: string[];
  tags?: TagOption[];
  units?: UnitOption[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [productType, setProductType] = useState<"simple" | "service">(
    "simple",
  );
  const [trackInventory, setTrackInventory] = useState(true);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    createProductAction.bind(null, tenantSlug),
    initialState,
  );
  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      router.refresh();
      const timeout = window.setTimeout(() => setOpen(false), 0);
      return () => window.clearTimeout(timeout);
    }
    if (state.status === "error") toast.error(state.message);
  }, [router, state]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={disabled}
          title={
            disabled
              ? "Your current workspace cannot create products"
              : undefined
          }
        >
          <Plus /> New product
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="text-lg font-semibold">
          Create a product
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Add a stocked item or service with pricing and catalog details.
        </DialogDescription>
        <form action={formAction} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
              Product name
              <Input
                name="name"
                required
                minLength={2}
                placeholder="e.g. Counter Display"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
              Subtitle
              <Input
                name="subtitle"
                maxLength={160}
                placeholder="A short description shown in the catalog"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Product type
              <SelectField
                ariaLabel="Product type"
                name="type"
                value={productType}
                onValueChange={(value) => {
                  const nextType = value as "simple" | "service";
                  setProductType(nextType);
                  setTrackInventory(nextType === "simple");
                }}
                options={[
                  { value: "simple", label: "Stocked product" },
                  { value: "service", label: "Service" },
                ]}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Status
              <SelectField
                ariaLabel="Product status"
                name="status"
                defaultValue="active"
                options={[
                  { value: "active", label: "Active" },
                  { value: "draft", label: "Draft" },
                ]}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              SKU
              <Input name="sku" required placeholder="CD-100" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Barcode <span className="text-muted-foreground">(optional)</span>
              <Input
                name="barcode"
                maxLength={64}
                placeholder="Scan or enter a barcode"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Category
              <SelectField
                ariaLabel="Category"
                name="category"
                required
                defaultValue={categories[0]}
                disabled={categories.length === 0}
                placeholder="Create an active category first"
                options={categories.map((category) => ({
                  value: category,
                  label: category,
                }))}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Unit of measure
              <SelectField
                ariaLabel="Unit of measure"
                name="unitId"
                required
                defaultValue={units[0]?.id}
                disabled={units.length === 0}
                placeholder="Create an active unit first"
                options={units.map((unit) => ({
                  value: unit.id,
                  label: `${unit.name} (${unit.symbol})`,
                }))}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Price ({currency})
              <Input
                name="price"
                inputMode="decimal"
                required
                pattern="\d+(\.\d{1,2})?"
                placeholder="0.00"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Cost ({currency})
              <Input
                name="cost"
                inputMode="decimal"
                required
                pattern="\d+(\.\d{1,2})?"
                defaultValue="0.00"
                placeholder="0.00"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
              Description{" "}
              <span className="text-muted-foreground">(optional)</span>
              <Textarea
                name="description"
                maxLength={4000}
                placeholder="Add useful product details for your team"
              />
            </label>
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm sm:col-span-2">
              <Checkbox
                name="inventoryTracking"
                checked={trackInventory}
                disabled={productType === "service"}
                onCheckedChange={(checked) =>
                  setTrackInventory(checked === true)
                }
              />
              <span>
                <span className="block font-medium">Track inventory</span>
                <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
                  Maintain stock levels and movement history for this product.
                </span>
              </span>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Opening stock
              <Input
                name="stock"
                type="number"
                min="0"
                step="1"
                required
                defaultValue="0"
                disabled={!trackInventory}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Low-stock threshold
              <Input
                name="reorderLevel"
                type="number"
                min="0"
                step="1"
                required
                defaultValue="5"
                disabled={!trackInventory}
              />
            </label>
          </div>
          {tags.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Tags</legend>
              <p className="text-muted-foreground text-xs">
                Optional labels for merchandising and catalog filters.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {tags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2"
                  >
                    <Checkbox name="tagIds" value={tag.id} />
                    <TagBadge name={tag.name} color={tag.color} />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {state.status === "error" && (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-lg p-3 text-xs"
            >
              {state.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={
                pending || units.length === 0 || categories.length === 0
              }
            >
              {pending ? "Creating…" : "Create product"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
