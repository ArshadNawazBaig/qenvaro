"use client";

import { Archive, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  archiveSupplierAction,
  createSupplierAction,
  updateSupplierAction,
} from "@/app/app/[tenantSlug]/suppliers/actions";
import {
  PurchasingActionMessage,
  purchasingInitialState,
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
import type { SupplierListItem } from "@/modules/purchasing/schemas";

function SupplierFields({ supplier }: { supplier?: SupplierListItem }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-medium">
        Supplier name
        <Input
          name="name"
          required
          minLength={2}
          maxLength={140}
          defaultValue={supplier?.name}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Contact name
        <Input
          name="contactName"
          maxLength={120}
          defaultValue={supplier?.contactName}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Email
        <Input
          name="email"
          type="email"
          maxLength={254}
          defaultValue={supplier?.email}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Phone
        <Input
          name="phone"
          type="tel"
          maxLength={32}
          defaultValue={supplier?.phone}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
        Address
        <textarea
          name="address"
          maxLength={500}
          rows={2}
          defaultValue={supplier?.address}
          className="border-input bg-card focus-visible:ring-ring w-full rounded-lg border p-3 text-sm outline-none focus-visible:ring-2"
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Tax / registration number
        <Input
          name="taxNumber"
          maxLength={80}
          defaultValue={supplier?.taxNumber}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Payment terms
        <Input
          name="paymentTerms"
          maxLength={120}
          defaultValue={supplier?.paymentTerms}
          placeholder="e.g. Net 30"
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
        Internal notes
        <textarea
          name="notes"
          maxLength={1000}
          rows={3}
          defaultValue={supplier?.notes}
          className="border-input bg-card focus-visible:ring-ring w-full rounded-lg border p-3 text-sm outline-none focus-visible:ring-2"
        />
      </label>
    </div>
  );
}

export function NewSupplierDialog({
  tenantSlug,
  disabled,
}: {
  tenantSlug: string;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    createSupplierAction.bind(null, tenantSlug),
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
        <Button disabled={disabled}>
          <Plus /> New supplier
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogTitle className="text-lg font-semibold">
          Create supplier
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Supplier identity is snapshotted into future purchase orders.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <SupplierFields />
          <PurchasingActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create supplier"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SupplierActions({
  tenantSlug,
  supplier,
  canUpdate,
  isDemo,
}: {
  tenantSlug: string;
  supplier: SupplierListItem;
  canUpdate: boolean;
  isDemo: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [editState, editAction, editPending] = React.useActionState(
    updateSupplierAction.bind(null, tenantSlug, supplier.id),
    purchasingInitialState,
  );
  const [archiveState, archiveAction, archivePending] = React.useActionState(
    archiveSupplierAction.bind(null, tenantSlug, supplier.id),
    purchasingInitialState,
  );
  React.useEffect(() => {
    for (const [state, close] of [
      [editState, setEditOpen],
      [archiveState, setArchiveOpen],
    ] as const)
      if (state.status === "success") {
        toast.success(state.message);
        router.refresh();
        const timeout = window.setTimeout(() => close(false), 0);
        return () => window.clearTimeout(timeout);
      }
  }, [archiveState, editState, router]);
  const disabled = isDemo || !canUpdate || supplier.status === "archived";
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={disabled}>
            <Pencil /> Edit
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle className="text-lg font-semibold">
            Edit {supplier.name}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            Code {supplier.supplierCode} remains stable.
          </DialogDescription>
          <form action={editAction} className="mt-5 space-y-4">
            <input
              type="hidden"
              name="expectedVersion"
              value={supplier.version}
            />
            <SupplierFields supplier={supplier} />
            <PurchasingActionMessage state={editState} />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={editPending}>
                {editPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={disabled}>
            <Archive /> Archive
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Archive {supplier.name}?
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            Open purchase orders must be completed or cancelled first.
            Historical snapshots remain intact.
          </DialogDescription>
          <form action={archiveAction} className="mt-5 space-y-4">
            <input
              type="hidden"
              name="expectedVersion"
              value={supplier.version}
            />
            <PurchasingActionMessage state={archiveState} />
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
                {archivePending ? "Archiving…" : "Archive supplier"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SupplierManagement({
  tenantSlug,
  items,
  canUpdate,
  isDemo,
}: {
  tenantSlug: string;
  items: SupplierListItem[];
  canUpdate: boolean;
  isDemo: boolean;
}) {
  if (items.length === 0)
    return (
      <div className="p-10 text-center">
        <p className="font-medium">No suppliers match this view</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Add a supplier before creating a purchase order.
        </p>
      </div>
    );
  return (
    <div className="divide-y">
      {items.map((supplier) => (
        <article
          key={supplier.id}
          className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{supplier.name}</h2>
              <Badge
                variant={supplier.status === "active" ? "success" : "secondary"}
              >
                {supplier.status}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {supplier.supplierCode}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {supplier.contactName || "No named contact"} ·{" "}
              {supplier.email || supplier.phone || "No contact method"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {supplier.paymentTerms || "Terms not set"}
            </p>
          </div>
          <SupplierActions
            tenantSlug={tenantSlug}
            supplier={supplier}
            canUpdate={canUpdate}
            isDemo={isDemo}
          />
        </article>
      ))}
    </div>
  );
}
