"use client";

import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  changeEmployeeStatusAction,
  createEmployeeAction,
  linkEmployeeAccountAction,
  updateEmployeeAction,
} from "@/app/app/[tenantSlug]/employees/actions";
import {
  WorkforceActionMessage,
  nativeSelectClass,
  workforceInitialState,
} from "@/components/employees/action-message";
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
import type { EmployeeListItem } from "@/modules/employees/schemas";

interface StoreOption {
  id: string;
  code: string;
  name: string;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function EmployeeFields({
  employee,
  stores,
}: {
  employee?: EmployeeListItem;
  stores: StoreOption[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-medium">
        Full name
        <Input
          name="name"
          required
          minLength={2}
          maxLength={120}
          defaultValue={employee?.name}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Job title
        <Input
          name="jobTitle"
          required
          minLength={2}
          maxLength={100}
          defaultValue={employee?.jobTitle}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Work email <span className="text-muted-foreground">(optional)</span>
        <Input
          name="workEmail"
          type="email"
          maxLength={254}
          defaultValue={employee?.workEmail}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Phone <span className="text-muted-foreground">(optional)</span>
        <Input
          name="phone"
          type="tel"
          maxLength={32}
          defaultValue={employee?.phone}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Department <span className="text-muted-foreground">(optional)</span>
        <Input
          name="department"
          maxLength={100}
          defaultValue={employee?.department}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Employment type
        <select
          name="employmentType"
          className={nativeSelectClass}
          defaultValue={employee?.employmentType ?? "full_time"}
        >
          <option value="full_time">Full time</option>
          <option value="part_time">Part time</option>
          <option value="contract">Contract</option>
          <option value="casual">Casual</option>
        </select>
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Hire date
        <Input
          name="hireDate"
          type="date"
          required
          defaultValue={
            employee?.hireDate ?? new Date().toISOString().slice(0, 10)
          }
        />
      </label>
      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="text-sm font-medium">Assigned stores</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {stores.map((store) => (
            <label
              key={store.id}
              className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm"
            >
              <input
                type="checkbox"
                name="storeIds"
                value={store.id}
                defaultChecked={
                  employee
                    ? employee.storeIds.includes(store.id)
                    : stores.length === 1
                }
                className="accent-primary size-4"
              />
              <span>
                <span className="font-medium">{store.name}</span>{" "}
                <span className="text-muted-foreground">· {store.code}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function NewEmployeeDialog({
  tenantSlug,
  stores,
  disabled,
}: {
  tenantSlug: string;
  stores: StoreOption[];
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    createEmployeeAction.bind(null, tenantSlug),
    workforceInitialState,
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
          <Plus /> New employee
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogTitle className="text-lg font-semibold">
          Create an employee
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Create an operational employee record. An application account can be
          linked later.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <EmployeeFields stores={stores} />
          <WorkforceActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create employee"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeActions({
  tenantSlug,
  employee,
  stores,
  canUpdate,
  canArchive,
  isDemo,
}: {
  tenantSlug: string;
  employee: EmployeeListItem;
  stores: StoreOption[];
  canUpdate: boolean;
  canArchive: boolean;
  isDemo: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [editState, editAction, editPending] = React.useActionState(
    updateEmployeeAction.bind(null, tenantSlug, employee.id),
    workforceInitialState,
  );
  const [statusState, statusAction, statusPending] = React.useActionState(
    changeEmployeeStatusAction.bind(null, tenantSlug, employee.id),
    workforceInitialState,
  );
  const [linkState, linkAction, linkPending] = React.useActionState(
    linkEmployeeAccountAction.bind(null, tenantSlug, employee.id),
    workforceInitialState,
  );
  React.useEffect(() => {
    const states = [
      [editState, setEditOpen],
      [statusState, setStatusOpen],
      [linkState, setLinkOpen],
    ] as const;
    for (const [state, close] of states) {
      if (state.status !== "success") continue;
      toast.success(state.message);
      router.refresh();
      const timeout = window.setTimeout(() => close(false), 0);
      return () => window.clearTimeout(timeout);
    }
  }, [editState, linkState, router, statusState]);
  const disabled = isDemo || employee.status === "archived";
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={disabled || !canUpdate}>
            <Pencil /> Edit
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle className="text-lg font-semibold">
            Edit {employee.name}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            Employee code {employee.employeeCode} remains stable.
          </DialogDescription>
          <form action={editAction} className="mt-5 space-y-4">
            <input
              type="hidden"
              name="expectedVersion"
              value={employee.version}
            />
            <EmployeeFields employee={employee} stores={stores} />
            <WorkforceActionMessage state={editState} />
            <div className="flex justify-end gap-2">
              {editState.status === "conflict" && (
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
              <Button type="submit" disabled={editPending}>
                {editPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={disabled || !canUpdate}>
            <Link2 /> Link account
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Link workspace account
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            The email must already belong to this business. Linking enables own
            attendance and payslip access.
          </DialogDescription>
          <form action={linkAction} className="mt-5 space-y-4">
            <input
              type="hidden"
              name="expectedVersion"
              value={employee.version}
            />
            <label className="space-y-1.5 text-sm font-medium">
              Account email
              <Input
                name="email"
                type="email"
                required
                defaultValue={employee.linkedAccountEmail || employee.workEmail}
              />
            </label>
            <WorkforceActionMessage state={linkState} />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={linkPending}>
                {linkPending ? "Linking…" : "Link account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={isDemo || !canArchive}>
            <Archive /> Status
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Change employee status
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            Archiving preserves payroll and attendance history.
          </DialogDescription>
          <form action={statusAction} className="mt-5 space-y-4">
            <input
              type="hidden"
              name="expectedVersion"
              value={employee.version}
            />
            <label className="space-y-1.5 text-sm font-medium">
              Status
              <select
                name="status"
                className={nativeSelectClass}
                defaultValue={employee.status}
              >
                <option value="active">Active</option>
                <option value="on_leave">On leave</option>
                <option value="terminated">Terminated</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <WorkforceActionMessage state={statusState} />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={statusPending}>
                {statusPending ? "Saving…" : "Update status"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function statusVariant(status: EmployeeListItem["status"]) {
  if (status === "active") return "success" as const;
  if (status === "on_leave") return "warning" as const;
  if (status === "terminated" || status === "archived")
    return "secondary" as const;
  return "outline" as const;
}

export function EmployeeManagement({
  tenantSlug,
  items,
  stores,
  page,
  pageCount,
  total,
  canUpdate,
  canArchive,
  isDemo,
}: {
  tenantSlug: string;
  items: EmployeeListItem[];
  stores: StoreOption[];
  page: number;
  pageCount: number;
  total: number;
  canUpdate: boolean;
  canArchive: boolean;
  isDemo: boolean;
}) {
  const storeMap = new Map(stores.map((store) => [store.id, store.name]));
  if (items.length === 0)
    return (
      <div className="p-10 text-center">
        <p className="font-medium">No employees match this view</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Clear a filter or create the first employee record.
        </p>
      </div>
    );
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead className="bg-muted/45 text-muted-foreground text-xs tracking-wide uppercase">
            <tr>
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Stores</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((employee) => (
              <tr key={employee.id}>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10">
                      <AvatarFallback>{initials(employee.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{employee.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {employee.employeeCode} ·{" "}
                        {employee.workEmail || "No work email"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <p className="font-medium">{employee.jobTitle}</p>
                  <p className="text-muted-foreground text-xs">
                    {employee.department ||
                      employee.employmentType.replace("_", " ")}
                  </p>
                </td>
                <td className="text-muted-foreground px-5 py-4">
                  {employee.storeIds
                    .map((id) => storeMap.get(id))
                    .filter(Boolean)
                    .join(", ")}
                </td>
                <td className="px-5 py-4">
                  <Badge variant={statusVariant(employee.status)}>
                    {employee.status.replace("_", " ")}
                  </Badge>
                  {employee.linkedAccountEmail && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Account linked
                    </p>
                  )}
                </td>
                <td className="px-5 py-4">
                  <EmployeeActions
                    tenantSlug={tenantSlug}
                    employee={employee}
                    stores={stores}
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
      <div className="divide-y md:hidden">
        {items.map((employee) => (
          <article key={employee.id} className="space-y-4 p-4">
            <div className="flex items-start gap-3">
              <Avatar>
                <AvatarFallback>{initials(employee.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{employee.name}</h2>
                  <Badge variant={statusVariant(employee.status)}>
                    {employee.status.replace("_", " ")}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-sm">
                  {employee.jobTitle} · {employee.employeeCode}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {employee.storeIds
                    .map((id) => storeMap.get(id))
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            </div>
            <EmployeeActions
              tenantSlug={tenantSlug}
              employee={employee}
              stores={stores}
              canUpdate={canUpdate}
              canArchive={canArchive}
              isDemo={isDemo}
            />
          </article>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 text-sm">
        <p className="text-muted-foreground">
          {total.toLocaleString()} employee{total === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline" disabled={page <= 1}>
            <Link
              href={`?page=${Math.max(1, page - 1)}`}
              aria-label="Previous employee page"
            >
              <ChevronLeft />
            </Link>
          </Button>
          <span>
            Page {page} of {pageCount}
          </span>
          <Button
            asChild
            size="sm"
            variant="outline"
            disabled={page >= pageCount}
          >
            <Link
              href={`?page=${Math.min(pageCount, page + 1)}`}
              aria-label="Next employee page"
            >
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
