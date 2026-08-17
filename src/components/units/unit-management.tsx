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
  archiveUnitAction,
  createUnitAction,
  type UnitActionState,
  updateUnitAction,
} from "@/app/app/[tenantSlug]/products/units/actions";
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
import { Textarea } from "@/components/ui/textarea";
import type { UnitListItem } from "@/modules/units/schemas";

const initialState: UnitActionState = { status: "idle", message: "" };

function ActionMessage({ state }: { state: UnitActionState }) {
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

function UnitFields({ unit }: { unit?: UnitListItem }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-medium">
        Unit name
        <Input
          name="name"
          required
          minLength={2}
          maxLength={60}
          defaultValue={unit?.name}
          placeholder="e.g. Kilogram"
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Symbol
        <Input
          name="symbol"
          required
          minLength={1}
          maxLength={16}
          defaultValue={unit?.symbol}
          placeholder="e.g. kg"
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
        Description
        <Textarea
          name="description"
          maxLength={240}
          rows={3}
          defaultValue={unit?.description}
          placeholder="Where this unit is used"
        />
      </label>
    </div>
  );
}

export function NewUnitDialog({
  tenantSlug,
  disabled,
}: {
  tenantSlug: string;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    createUnitAction.bind(null, tenantSlug),
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
          <Plus /> New unit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Create a unit of measure
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Add a reusable quantity label for products and inventory workflows.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <UnitFields />
          <ActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create unit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UnitActions({
  tenantSlug,
  unit,
  canUpdate,
  canArchive,
  isDemo,
}: {
  tenantSlug: string;
  unit: UnitListItem;
  canUpdate: boolean;
  canArchive: boolean;
  isDemo: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [updateState, updateAction, updatePending] = React.useActionState(
    updateUnitAction.bind(null, tenantSlug, unit.id),
    initialState,
  );
  const [archiveState, archiveAction, archivePending] = React.useActionState(
    archiveUnitAction.bind(null, tenantSlug, unit.id),
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
  const archived = unit.status === "archived";
  const editDisabled = isDemo || !canUpdate || archived;
  const archiveDisabled =
    isDemo || !canArchive || archived || unit.activeProductCount > 0;

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={editDisabled}
            aria-label={`Edit ${unit.name}`}
          >
            <Pencil /> Edit
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Edit {unit.name}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            Assigned products keep their stable unit reference when the label or
            symbol changes.
          </DialogDescription>
          <form action={updateAction} className="mt-5 space-y-4">
            <input type="hidden" name="expectedVersion" value={unit.version} />
            <UnitFields unit={unit} />
            <ActionMessage state={updateState} />
            <div className="flex flex-wrap justify-end gap-2">
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
                {updatePending ? "Saving…" : "Save unit"}
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
            aria-label={`Archive ${unit.name}`}
            title={
              unit.activeProductCount > 0
                ? "Reassign active products first"
                : undefined
            }
          >
            <Archive className="text-destructive" /> Archive
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Archive {unit.name}?
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            The unit will no longer be available for new assignments. Historical
            archived-product references remain intact.
          </DialogDescription>
          <form action={archiveAction} className="mt-6 space-y-4">
            <input type="hidden" name="expectedVersion" value={unit.version} />
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

function UnitIdentity({ unit }: { unit: UnitListItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="bg-muted text-foreground flex size-11 shrink-0 items-center justify-center rounded-xl border font-mono text-sm font-semibold">
        {unit.symbol}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{unit.name}</p>
          {unit.isDefault && <Badge variant="outline">Default</Badge>}
        </div>
        <p className="text-muted-foreground truncate font-mono text-[11px]">
          {unit.slug}
        </p>
      </div>
    </div>
  );
}

export function UnitManagement({
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
  items: UnitListItem[];
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
        <p className="font-medium">No units match these filters.</p>
        <p className="mt-1 text-sm">Clear a filter or create a new unit.</p>
      </div>
    );
  return (
    <>
      <div className="grid gap-3 p-3 md:hidden">
        {items.map((unit) => (
          <article key={unit.id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <UnitIdentity unit={unit} />
              <Badge
                variant={unit.status === "active" ? "success" : "secondary"}
                className="capitalize"
              >
                {unit.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-3 text-sm">
              {unit.description || "No description"}
            </p>
            <div className="mt-4 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">
                  {unit.activeProductCount.toLocaleString()} active products
                </p>
                <p className="text-muted-foreground text-xs">
                  {unit.totalProductCount.toLocaleString()} total assignments
                </p>
              </div>
              <UnitActions
                key={unit.version}
                tenantSlug={tenantSlug}
                unit={unit}
                canUpdate={canUpdate}
                canArchive={canArchive}
                isDemo={isDemo}
              />
            </div>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-muted/35 text-muted-foreground border-b text-xs">
            <tr>
              <th className="h-11 px-4 font-medium">Unit</th>
              <th className="h-11 px-4 font-medium">Description</th>
              <th className="h-11 px-4 font-medium">Products</th>
              <th className="h-11 px-4 font-medium">Status</th>
              <th className="h-11 px-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((unit) => (
              <tr
                key={unit.id}
                className="hover:bg-muted/25 border-b last:border-0"
              >
                <td className="px-4 py-4">
                  <UnitIdentity unit={unit} />
                </td>
                <td className="text-muted-foreground max-w-sm px-4 py-4 text-xs">
                  {unit.description || "No description"}
                </td>
                <td className="px-4 py-4">
                  <p className="font-medium">
                    {unit.activeProductCount.toLocaleString()} active
                  </p>
                  {unit.totalProductCount !== unit.activeProductCount && (
                    <p className="text-muted-foreground text-xs">
                      {unit.totalProductCount.toLocaleString()} total
                    </p>
                  )}
                </td>
                <td className="px-4 py-4">
                  <Badge
                    variant={unit.status === "active" ? "success" : "secondary"}
                    className="capitalize"
                  >
                    {unit.status}
                  </Badge>
                </td>
                <td className="px-4 py-4">
                  <UnitActions
                    key={unit.version}
                    tenantSlug={tenantSlug}
                    unit={unit}
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
          Showing {items.length} of {total} units
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
            aria-label="Previous unit page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page >= pageCount}
            onClick={() => goToPage(page + 1)}
            aria-label="Next unit page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </>
  );
}
