"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import {
  createProductAction,
  type ProductActionState,
} from "@/app/app/[tenantSlug]/products/actions";
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
import { TagBadge } from "@/components/tags/tag-badge";
import type { TagOption } from "@/modules/tags/schemas";

const initialState: ProductActionState = { status: "idle", message: "" };

export function NewProductDialog({
  tenantSlug,
  categories = [],
  tags = [],
  disabled = false,
}: {
  tenantSlug: string;
  categories?: string[];
  tags?: TagOption[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const categoryListId = useId();
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
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Create a product
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Add a simple tracked product to this tenant catalog.
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
            <label className="space-y-1.5 text-sm font-medium">
              SKU
              <Input name="sku" required placeholder="CD-100" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Category
              <Input
                name="category"
                required
                placeholder="Hardware"
                list={categoryListId}
              />
              <datalist id={categoryListId}>
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Price (USD)
              <Input
                name="price"
                inputMode="decimal"
                required
                pattern="\d+(\.\d{1,2})?"
                placeholder="0.00"
              />
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
                    <input
                      type="checkbox"
                      name="tagIds"
                      value={tag.id}
                      className="accent-primary size-4"
                    />
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
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create product"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
