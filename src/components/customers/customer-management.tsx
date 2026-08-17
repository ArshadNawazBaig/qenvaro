"use client";

import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  archiveCustomerAction,
  createCustomerAction,
  type CustomerActionState,
  updateCustomerAction,
} from "@/app/app/[tenantSlug]/customers/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import type { CustomerListItem } from "@/modules/customers/schemas";

const initialState: CustomerActionState = { status: "idle", message: "" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ActionMessage({ state }: { state: CustomerActionState }) {
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

function CustomerFields({ customer }: { customer?: CustomerListItem }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-medium">
        Customer name
        <Input
          name="name"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          defaultValue={customer?.name}
          placeholder="e.g. Sana Iqbal"
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Company <span className="text-muted-foreground">(optional)</span>
        <Input
          name="company"
          maxLength={120}
          autoComplete="organization"
          defaultValue={customer?.company}
          placeholder="e.g. Northstar Studio"
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Email <span className="text-muted-foreground">(optional)</span>
        <Input
          name="email"
          type="email"
          maxLength={254}
          autoComplete="email"
          defaultValue={customer?.email}
          placeholder="name@company.com"
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Phone <span className="text-muted-foreground">(optional)</span>
        <Input
          name="phone"
          type="tel"
          maxLength={32}
          autoComplete="tel"
          defaultValue={customer?.phone}
          placeholder="+92 300 000 0000"
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
        Address line 1 <span className="text-muted-foreground">(optional)</span>
        <Input
          name="addressLine1"
          maxLength={120}
          autoComplete="address-line1"
          defaultValue={customer?.address.line1}
          placeholder="Street address"
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
        Address line 2 <span className="text-muted-foreground">(optional)</span>
        <Input
          name="addressLine2"
          maxLength={120}
          autoComplete="address-line2"
          defaultValue={customer?.address.line2}
          placeholder="Apartment, suite, or floor"
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        City
        <Input
          name="city"
          maxLength={80}
          autoComplete="address-level2"
          defaultValue={customer?.address.city}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        State / region
        <Input
          name="region"
          maxLength={80}
          autoComplete="address-level1"
          defaultValue={customer?.address.region}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Postal code
        <Input
          name="postalCode"
          maxLength={32}
          autoComplete="postal-code"
          defaultValue={customer?.address.postalCode}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Country code
        <Input
          name="countryCode"
          minLength={2}
          maxLength={2}
          autoComplete="country"
          className="uppercase"
          defaultValue={customer?.address.countryCode}
          placeholder="PK"
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
        Internal notes <span className="text-muted-foreground">(optional)</span>
        <Textarea
          name="notes"
          maxLength={1_000}
          rows={3}
          defaultValue={customer?.notes}
          placeholder="Preferences or context for your team"
        />
      </label>
    </div>
  );
}

export function NewCustomerDialog({
  tenantSlug,
  disabled,
}: {
  tenantSlug: string;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    createCustomerAction.bind(null, tenantSlug),
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
          <Plus /> New customer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogTitle className="text-lg font-semibold">
          Create a customer
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Add a reusable customer profile for sales and order history.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <CustomerFields />
          <ActionMessage state={state} />
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create customer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CustomerActions({
  tenantSlug,
  customer,
  canUpdate,
  canArchive,
  isDemo,
}: {
  tenantSlug: string;
  customer: CustomerListItem;
  canUpdate: boolean;
  canArchive: boolean;
  isDemo: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [updateState, updateAction, updatePending] = React.useActionState(
    updateCustomerAction.bind(null, tenantSlug, customer.id),
    initialState,
  );
  const [archiveState, archiveAction, archivePending] = React.useActionState(
    archiveCustomerAction.bind(null, tenantSlug, customer.id),
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
  const archived = customer.status === "archived";

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isDemo || !canUpdate || archived}
            aria-label={`Edit ${customer.name}`}
          >
            <Pencil /> Edit
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle className="text-lg font-semibold">
            Edit {customer.name}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            Customer code {customer.code} remains stable across future sales.
          </DialogDescription>
          <form action={updateAction} className="mt-5 space-y-4">
            <input
              type="hidden"
              name="expectedVersion"
              value={customer.version}
            />
            <CustomerFields customer={customer} />
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
                {updatePending ? "Saving…" : "Save customer"}
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
            disabled={isDemo || !canArchive || archived}
            aria-label={`Archive ${customer.name}`}
          >
            <Archive className="text-destructive" /> Archive
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Archive {customer.name}?
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            This profile will stop appearing in active customer choices. Its
            historical sales references will remain intact.
          </DialogDescription>
          <form action={archiveAction} className="mt-6 space-y-4">
            <input
              type="hidden"
              name="expectedVersion"
              value={customer.version}
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

function CustomerIdentity({ customer }: { customer: CustomerListItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-10 shrink-0 border">
        <AvatarFallback>{initials(customer.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-semibold">{customer.name}</p>
        <p className="text-muted-foreground truncate font-mono text-[11px]">
          {customer.code}
        </p>
      </div>
    </div>
  );
}

function CustomerContact({ customer }: { customer: CustomerListItem }) {
  return (
    <div className="min-w-0 space-y-1.5">
      {customer.email && (
        <a
          href={`mailto:${customer.email}`}
          className="text-muted-foreground hover:text-foreground flex min-w-0 items-center gap-2 text-xs"
        >
          <Mail className="size-3.5 shrink-0" />
          <span className="truncate">{customer.email}</span>
        </a>
      )}
      {customer.phone && (
        <a
          href={`tel:${customer.phone}`}
          className="text-muted-foreground hover:text-foreground flex min-w-0 items-center gap-2 text-xs"
        >
          <Phone className="size-3.5 shrink-0" />
          <span className="truncate">{customer.phone}</span>
        </a>
      )}
      {!customer.email && !customer.phone && (
        <span className="text-muted-foreground text-xs">
          No contact details
        </span>
      )}
    </div>
  );
}

function customerLocation(customer: CustomerListItem) {
  return [
    customer.address.city,
    customer.address.region,
    customer.address.countryCode,
  ]
    .filter(Boolean)
    .join(", ");
}

export function CustomerManagement({
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
  items: CustomerListItem[];
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
        <p className="font-medium">No customers match these filters.</p>
        <p className="mt-1 text-sm">Clear a filter or create a new customer.</p>
      </div>
    );
  return (
    <>
      <div className="grid gap-3 p-3 md:hidden">
        {items.map((customer) => {
          const location = customerLocation(customer);
          return (
            <article
              key={customer.id}
              className="min-w-0 rounded-xl border p-4"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <CustomerIdentity customer={customer} />
                <Badge
                  variant={
                    customer.status === "active" ? "success" : "secondary"
                  }
                  className="shrink-0 capitalize"
                >
                  {customer.status}
                </Badge>
              </div>
              <div className="mt-4 grid min-w-0 gap-3 min-[440px]:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
                    Company
                  </p>
                  <p className="truncate text-sm">
                    {customer.company || "Individual customer"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
                    Contact
                  </p>
                  <CustomerContact customer={customer} />
                </div>
                {location && (
                  <div className="min-w-0 min-[440px]:col-span-2">
                    <p className="text-muted-foreground flex min-w-0 items-center gap-2 truncate text-xs">
                      <MapPin className="size-3.5 shrink-0" /> {location}
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-4 border-t pt-3">
                <CustomerActions
                  key={customer.version}
                  tenantSlug={tenantSlug}
                  customer={customer}
                  canUpdate={canUpdate}
                  canArchive={canArchive}
                  isDemo={isDemo}
                />
              </div>
            </article>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-muted/35 text-muted-foreground border-b text-xs">
            <tr>
              <th className="h-11 px-4 font-medium">Customer</th>
              <th className="h-11 px-4 font-medium">Company</th>
              <th className="h-11 px-4 font-medium">Contact</th>
              <th className="h-11 px-4 font-medium">Location</th>
              <th className="h-11 px-4 font-medium">Status</th>
              <th className="h-11 px-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((customer) => (
              <tr
                key={customer.id}
                className="hover:bg-muted/25 border-b last:border-0"
              >
                <td className="px-4 py-4">
                  <CustomerIdentity customer={customer} />
                </td>
                <td className="max-w-52 px-4 py-4">
                  <p className="truncate">
                    {customer.company || "Individual customer"}
                  </p>
                </td>
                <td className="max-w-60 px-4 py-4">
                  <CustomerContact customer={customer} />
                </td>
                <td className="text-muted-foreground max-w-52 px-4 py-4 text-xs">
                  {customerLocation(customer) || "Not provided"}
                </td>
                <td className="px-4 py-4">
                  <Badge
                    variant={
                      customer.status === "active" ? "success" : "secondary"
                    }
                    className="capitalize"
                  >
                    {customer.status}
                  </Badge>
                </td>
                <td className="px-4 py-4">
                  <CustomerActions
                    key={customer.version}
                    tenantSlug={tenantSlug}
                    customer={customer}
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
          Showing {items.length} of {total} customers
        </p>
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="text-muted-foreground mr-auto px-2 text-xs sm:mr-0">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            aria-label="Previous customer page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page >= pageCount}
            onClick={() => goToPage(page + 1)}
            aria-label="Next customer page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </>
  );
}
