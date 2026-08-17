"use client";

import { CalendarDays, Check, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  createLeaveRequestAction,
  decideLeaveRequestAction,
} from "@/app/app/[tenantSlug]/employees/actions";
import {
  WorkforceActionMessage,
  nativeSelectClass,
  workforceInitialState,
} from "@/components/employees/action-message";
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
import type { LeaveListItem } from "@/modules/employees/schemas";
import type { EmployeeReferenceData } from "@/server/repositories/employees";

export function NewLeaveDialog({
  tenantSlug,
  reference,
  disabled,
}: {
  tenantSlug: string;
  reference: EmployeeReferenceData;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    createLeaveRequestAction.bind(null, tenantSlug),
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
          <Plus /> Request leave
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Create leave request
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Calendar days are tracked operationally. Statutory rules are not
          inferred.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <label className="space-y-1.5 text-sm font-medium">
            Employee
            <select name="employeeId" className={nativeSelectClass}>
              {reference.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.employeeCode} · {employee.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Leave type
            <select name="type" className={nativeSelectClass}>
              <option value="annual">Annual</option>
              <option value="sick">Sick</option>
              <option value="unpaid">Unpaid</option>
              <option value="other">Other</option>
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              From
              <Input name="fromDate" type="date" required />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              To
              <Input name="toDate" type="date" required />
            </label>
          </div>
          <label className="space-y-1.5 text-sm font-medium">
            Reason
            <textarea
              name="reason"
              required
              minLength={3}
              maxLength={500}
              rows={3}
              className="border-input bg-card focus-visible:ring-ring w-full rounded-lg border p-3 text-sm outline-none focus-visible:ring-2"
            />
          </label>
          <WorkforceActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeaveDecision({
  tenantSlug,
  request,
  decision,
}: {
  tenantSlug: string;
  request: LeaveListItem;
  decision: "approved" | "rejected";
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    decideLeaveRequestAction.bind(null, tenantSlug, request.id, decision),
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
        <Button
          size="sm"
          variant={decision === "approved" ? "outline" : "ghost"}
        >
          {decision === "approved" ? <Check /> : <X />}
          {decision === "approved" ? "Approve" : "Reject"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          {decision === "approved" ? "Approve" : "Reject"} leave request?
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          {request.employeeName} · {request.fromDate} to {request.toDate}
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <input type="hidden" name="expectedVersion" value={request.version} />
          <label className="space-y-1.5 text-sm font-medium">
            Decision note{" "}
            <span className="text-muted-foreground">(optional)</span>
            <textarea
              name="note"
              maxLength={500}
              rows={3}
              className="border-input bg-card focus-visible:ring-ring w-full rounded-lg border p-3 text-sm outline-none focus-visible:ring-2"
            />
          </label>
          <WorkforceActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={decision === "rejected" ? "destructive" : "default"}
              disabled={pending}
            >
              {pending
                ? "Saving…"
                : decision === "approved"
                  ? "Approve"
                  : "Reject"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LeaveManagement({
  tenantSlug,
  items,
  canManage,
  isDemo,
}: {
  tenantSlug: string;
  items: LeaveListItem[];
  canManage: boolean;
  isDemo: boolean;
}) {
  if (items.length === 0)
    return (
      <div className="p-10 text-center">
        <CalendarDays className="text-muted-foreground mx-auto size-7" />
        <p className="mt-3 font-medium">No leave requests</p>
        <p className="text-muted-foreground mt-1 text-sm">
          New requests and their decisions will appear here.
        </p>
      </div>
    );
  return (
    <div className="divide-y">
      {items.map((request) => (
        <article
          key={request.id}
          className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{request.employeeName}</h2>
              <Badge
                variant={
                  request.status === "approved"
                    ? "success"
                    : request.status === "pending"
                      ? "warning"
                      : "secondary"
                }
              >
                {request.status}
              </Badge>
              <Badge variant="outline">{request.type}</Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {request.fromDate} – {request.toDate} · {request.days} calendar
              day{request.days === 1 ? "" : "s"}
            </p>
            <p className="mt-2 text-sm">{request.reason}</p>
            {request.decisionNote && (
              <p className="text-muted-foreground mt-1 text-xs">
                Decision note: {request.decisionNote}
              </p>
            )}
          </div>
          {request.status === "pending" && canManage && !isDemo && (
            <div className="flex flex-wrap justify-end gap-2">
              <LeaveDecision
                tenantSlug={tenantSlug}
                request={request}
                decision="approved"
              />
              <LeaveDecision
                tenantSlug={tenantSlug}
                request={request}
                decision="rejected"
              />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
