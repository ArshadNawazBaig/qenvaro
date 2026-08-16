"use client";

import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  archiveCategoryAction,
  type CategoryActionState,
  createCategoryAction,
  updateCategoryAction,
} from "@/app/app/[tenantSlug]/products/categories/actions";
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
import type { CategoryListItem } from "@/modules/categories/schemas";

const initialState: CategoryActionState = { status: "idle", message: "" };

function ActionMessage({ state }: { state: CategoryActionState }) {
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

export function NewCategoryDialog({
  tenantSlug,
  disabled,
}: {
  tenantSlug: string;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    createCategoryAction.bind(null, tenantSlug),
    initialState,
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
        <Button disabled={disabled}>
          <Plus /> New category
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Create a category
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Add a reusable category to this tenant catalog.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <label className="space-y-1.5 text-sm font-medium">
            Category name
            <Input name="name" required minLength={2} maxLength={80} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Description
            <textarea
              name="description"
              maxLength={500}
              rows={4}
              className="border-input bg-card w-full resize-y rounded-md border p-3 text-sm"
            />
          </label>
          <ActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create category"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryActions({
  tenantSlug,
  category,
  canUpdate,
  canArchive,
  isDemo,
}: {
  tenantSlug: string;
  category: CategoryListItem;
  canUpdate: boolean;
  canArchive: boolean;
  isDemo: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [updateState, updateAction, updatePending] = React.useActionState(
    updateCategoryAction.bind(null, tenantSlug, category.id),
    initialState,
  );
  const [archiveState, archiveAction, archivePending] = React.useActionState(
    archiveCategoryAction.bind(null, tenantSlug, category.id),
    initialState,
  );
  React.useEffect(() => {
    if (updateState.status !== "success") return;
    toast.success(updateState.message);
    router.refresh();
    const timeout = window.setTimeout(() => setEditOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [router, updateState]);
  React.useEffect(() => {
    if (archiveState.status !== "success") return;
    toast.success(archiveState.message);
    router.refresh();
    const timeout = window.setTimeout(() => setArchiveOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [archiveState, router]);
  const archived = category.status === "archived";
  const editDisabled = isDemo || !canUpdate || archived;
  const archiveDisabled =
    isDemo || !canArchive || archived || category.activeProductCount > 0;
  return (
    <div className="flex justify-end gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={editDisabled}
            aria-label={`Edit ${category.name}`}
          >
            <Pencil /> Edit
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Edit {category.name}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            Renaming updates every active or draft product assigned to this
            category in the same transaction.
          </DialogDescription>
          <form action={updateAction} className="mt-5 space-y-4">
            <input
              type="hidden"
              name="expectedVersion"
              value={category.version}
            />
            <label className="space-y-1.5 text-sm font-medium">
              Category name
              <Input
                name="name"
                required
                minLength={2}
                maxLength={80}
                defaultValue={category.name}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Description
              <textarea
                name="description"
                maxLength={500}
                rows={4}
                defaultValue={category.description}
                className="border-input bg-card w-full resize-y rounded-md border p-3 text-sm"
              />
            </label>
            <ActionMessage state={updateState} />
            <div className="flex justify-end gap-2">
              {updateState.status === "conflict" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.refresh()}
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
                {updatePending ? "Saving…" : "Save category"}
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
            className="text-foreground"
            aria-label={`Archive ${category.name}`}
            title={
              category.activeProductCount > 0
                ? "Reassign or archive active products first"
                : undefined
            }
          >
            <Archive className="text-destructive" /> Archive
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Archive {category.name}?
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            Archived categories remain available for historical reporting but
            cannot receive new product assignments.
          </DialogDescription>
          <form action={archiveAction} className="mt-5 space-y-4">
            <input
              type="hidden"
              name="expectedVersion"
              value={category.version}
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

export function CategoryManagement({
  tenantSlug,
  items,
  page,
  pageCount,
  total,
  canUpdate,
  canArchive,
  isDemo,
}: {
  tenantSlug: string;
  items: CategoryListItem[];
  page: number;
  pageCount: number;
  total: number;
  canUpdate: boolean;
  canArchive: boolean;
  isDemo: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  function goToPage(nextPage: number) {
    const next = new URLSearchParams(params.toString());
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    router.push(`${pathname}?${next.toString()}`);
  }
  if (items.length === 0)
    return (
      <div className="text-muted-foreground flex min-h-56 flex-col items-center justify-center p-8 text-center">
        <p className="font-medium">No categories match these filters.</p>
        <p className="mt-1 text-sm">Clear a filter or create a new category.</p>
      </div>
    );
  return (
    <>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Category table"
      >
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-muted/35 text-muted-foreground border-b text-xs">
            <tr>
              <th className="h-11 px-4 font-medium">Category</th>
              <th className="h-11 px-4 font-medium">Slug</th>
              <th className="h-11 px-4 font-medium">Products</th>
              <th className="h-11 px-4 font-medium">Status</th>
              <th className="h-11 px-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((category) => (
              <tr
                key={category.id}
                className="hover:bg-muted/25 border-b last:border-0"
              >
                <td className="px-4 py-4">
                  <p className="font-semibold">{category.name}</p>
                  <p className="text-muted-foreground mt-0.5 max-w-md truncate text-xs">
                    {category.description || "No description"}
                  </p>
                </td>
                <td className="text-muted-foreground px-4 py-4 font-mono text-xs">
                  {category.slug}
                </td>
                <td className="px-4 py-4">
                  <p className="font-medium">
                    {category.activeProductCount.toLocaleString()} active
                  </p>
                  {category.totalProductCount !==
                    category.activeProductCount && (
                    <p className="text-muted-foreground text-xs">
                      {category.totalProductCount.toLocaleString()} total
                    </p>
                  )}
                </td>
                <td className="px-4 py-4">
                  <Badge
                    variant={
                      category.status === "active" ? "success" : "secondary"
                    }
                    className="capitalize"
                  >
                    {category.status}
                  </Badge>
                </td>
                <td className="px-4 py-4">
                  <CategoryActions
                    key={category.version}
                    tenantSlug={tenantSlug}
                    category={category}
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
      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center">
        <p className="text-muted-foreground text-xs">
          Showing {items.length} of {total} categories
        </p>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground px-2 text-xs">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            aria-label="Previous category page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page >= pageCount}
            onClick={() => goToPage(page + 1)}
            aria-label="Next category page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </>
  );
}
