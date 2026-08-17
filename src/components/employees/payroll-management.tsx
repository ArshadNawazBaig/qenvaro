"use client";

import {
  Banknote,
  CheckCircle2,
  Plus,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  preparePayrollAction,
  setSalaryProfileAction,
  transitionPayrollAction,
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
import { formatMoney } from "@/lib/money";
import type {
  PayrollRunListItem,
  PayslipListItem,
  SalarySummary,
} from "@/modules/employees/schemas";
import type { EmployeeReferenceData } from "@/server/repositories/employees";

function money(value: number, currency: string) {
  return formatMoney({ amountMinor: value, currency });
}

export function SalaryProfileDialog({
  tenantSlug,
  reference,
  disabled,
}: {
  tenantSlug: string;
  reference: EmployeeReferenceData;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [employeeId, setEmployeeId] = React.useState(
    reference.employees[0]?.id ?? "",
  );
  const selected = reference.employees.find(
    (employee) => employee.id === employeeId,
  );
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    setSalaryProfileAction.bind(null, tenantSlug),
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
        <Button variant="outline" disabled={disabled}>
          <Plus /> Salary profile
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogTitle className="text-lg font-semibold">
          New salary profile
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Profiles are effective-dated and retained as compensation history.
          Amounts are never written to audit logs.
        </DialogDescription>
        <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
            Employee
            <select
              name="employeeId"
              required
              className={nativeSelectClass}
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
            >
              {reference.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.employeeCode} · {employee.name}
                </option>
              ))}
            </select>
          </label>
          <input
            type="hidden"
            name="expectedEmployeeVersion"
            value={selected?.version ?? 0}
          />
          <label className="space-y-1.5 text-sm font-medium">
            Compensation type
            <select name="compensationType" className={nativeSelectClass}>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
              <option value="hourly">Hourly</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Pay schedule
            <select name="paySchedule" className={nativeSelectClass}>
              <option value="monthly">Monthly</option>
              <option value="biweekly">Biweekly</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Base amount ({reference.currency})
            <Input
              name="baseAmount"
              inputMode="decimal"
              required
              placeholder="0.00"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Recurring allowance
            <Input name="allowance" inputMode="decimal" defaultValue="0.00" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Recurring deduction
            <Input name="deduction" inputMode="decimal" defaultValue="0.00" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Overtime hourly rate
            <Input
              name="overtimeRate"
              inputMode="decimal"
              defaultValue="0.00"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
            Effective date
            <Input
              name="effectiveDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <div className="sm:col-span-2">
            <WorkforceActionMessage state={state} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PreparePayrollDialog({
  tenantSlug,
  reference,
  disabled,
  allowAllStores,
}: {
  tenantSlug: string;
  reference: EmployeeReferenceData;
  disabled: boolean;
  allowAllStores: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [idempotencyKey, setIdempotencyKey] = React.useState(() =>
    crypto.randomUUID(),
  );
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    preparePayrollAction.bind(null, tenantSlug),
    workforceInitialState,
  );
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
    const timeout = window.setTimeout(() => {
      setIdempotencyKey(crypto.randomUUID());
      setOpen(false);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [router, state]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus /> Prepare payroll
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Prepare operational payroll
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          The run snapshots current effective salary profiles and attendance.
          Review it before approval and finalization.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <label className="space-y-1.5 text-sm font-medium">
            Store scope
            <select name="storeId" className={nativeSelectClass}>
              {allowAllStores && (
                <option value="all">All authorized stores</option>
              )}
              {reference.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              Period start
              <Input name="periodStart" type="date" required />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Period end
              <Input name="periodEnd" type="date" required />
            </label>
          </div>
          <label className="space-y-1.5 text-sm font-medium">
            Pay date
            <Input name="payDate" type="date" required />
          </label>
          <WorkforceActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Preparing…" : "Prepare draft"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayrollTransition({
  tenantSlug,
  run,
  target,
}: {
  tenantSlug: string;
  run: PayrollRunListItem;
  target: "review" | "approved" | "finalized" | "reversed";
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    transitionPayrollAction.bind(null, tenantSlug, run.id, target),
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
          variant={target === "reversed" ? "outline" : "default"}
        >
          {target === "reversed" ? <RotateCcw /> : <CheckCircle2 />}
          {target === "review"
            ? "Send to review"
            : target === "approved"
              ? "Approve"
              : target === "finalized"
                ? "Finalize"
                : "Reverse"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Move {run.runNumber} to {target}?
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          {target === "finalized"
            ? "Finalization creates immutable payslips. Future corrections require reversal."
            : target === "reversed"
              ? "Reversal retains the original run and marks its payslips reversed."
              : "This transition is recorded in the append-only audit history."}
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <input type="hidden" name="expectedVersion" value={run.version} />
          {target === "reversed" && (
            <label className="space-y-1.5 text-sm font-medium">
              Reversal reason
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={500}
                rows={3}
                className="border-input bg-card focus-visible:ring-ring w-full rounded-lg border p-3 text-sm outline-none focus-visible:ring-2"
              />
            </label>
          )}
          <WorkforceActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={target === "reversed" ? "destructive" : "default"}
              disabled={pending}
            >
              {pending ? "Saving…" : "Confirm transition"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function transitionFor(
  run: PayrollRunListItem,
  permissions: {
    canPrepare: boolean;
    canApprove: boolean;
    canFinalize: boolean;
  },
) {
  if (run.status === "draft" && permissions.canPrepare)
    return "review" as const;
  if (run.status === "review" && permissions.canApprove)
    return "approved" as const;
  if (run.status === "approved" && permissions.canFinalize)
    return "finalized" as const;
  if (run.status === "finalized" && permissions.canFinalize)
    return "reversed" as const;
  return null;
}

export function PayrollManagement({
  tenantSlug,
  runs,
  salaries,
  payslips,
  currency,
  permissions,
  isDemo,
}: {
  tenantSlug: string;
  runs: PayrollRunListItem[];
  salaries: SalarySummary[];
  payslips: PayslipListItem[];
  currency: string;
  permissions: {
    canPrepare: boolean;
    canApprove: boolean;
    canFinalize: boolean;
  };
  isDemo: boolean;
}) {
  return (
    <div className="space-y-6">
      <section
        className="grid gap-3 sm:grid-cols-3"
        aria-label="Payroll summary"
      >
        <div className="bg-card rounded-xl border p-5">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Current salary profiles
          </p>
          <p className="mt-2 text-2xl font-semibold">{salaries.length}</p>
        </div>
        <div className="bg-card rounded-xl border p-5">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Runs awaiting action
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {
              runs.filter((run) =>
                ["draft", "review", "approved"].includes(run.status),
              ).length
            }
          </p>
        </div>
        <div className="bg-card rounded-xl border p-5">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Latest finalized net
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {money(
              runs.find((run) => run.status === "finalized")?.netMinor ?? 0,
              currency,
            )}
          </p>
        </div>
      </section>

      <section className="bg-card overflow-hidden rounded-xl border">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Payroll runs</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Draft → review → approved → finalized. Finalized runs are immutable.
          </p>
        </div>
        {runs.length === 0 ? (
          <div className="p-10 text-center">
            <Banknote className="text-muted-foreground mx-auto size-7" />
            <p className="mt-3 font-medium">No payroll runs</p>
          </div>
        ) : (
          <div className="divide-y">
            {runs.map((run) => {
              const target = transitionFor(run, permissions);
              return (
                <article
                  key={run.id}
                  className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{run.runNumber}</h3>
                      <Badge
                        variant={
                          run.status === "finalized"
                            ? "success"
                            : run.status === "reversed"
                              ? "destructive"
                              : "warning"
                        }
                      >
                        {run.status}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {run.storeName}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {run.periodStart} – {run.periodEnd} · paid {run.payDate} ·{" "}
                      {run.employeeCount} employees
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                      <span>
                        Gross{" "}
                        <strong>{money(run.grossMinor, run.currency)}</strong>
                      </span>
                      <span>
                        Deductions{" "}
                        <strong>
                          {money(run.deductionMinor, run.currency)}
                        </strong>
                      </span>
                      <span>
                        Net <strong>{money(run.netMinor, run.currency)}</strong>
                      </span>
                    </div>
                  </div>
                  {target && !isDemo && (
                    <PayrollTransition
                      tenantSlug={tenantSlug}
                      run={run}
                      target={target}
                    />
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="bg-card overflow-hidden rounded-xl border">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">Current compensation</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Restricted salary data. New profiles supersede older effective
              dates.
            </p>
          </div>
          <div className="divide-y">
            {salaries.length === 0 ? (
              <p className="text-muted-foreground p-6 text-sm">
                No accessible salary profiles.
              </p>
            ) : (
              salaries.map((salary) => (
                <div key={salary.employeeId} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{salary.employeeName}</p>
                      <p className="text-muted-foreground text-xs">
                        {salary.employeeCode} · effective {salary.effectiveDate}
                      </p>
                    </div>
                    <Badge variant="outline">{salary.compensationType}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <p>
                      Base{" "}
                      <strong className="block">
                        {money(salary.baseAmountMinor, currency)}
                      </strong>
                    </p>
                    <p>
                      Allowance{" "}
                      <strong className="block">
                        {money(salary.allowanceMinor, currency)}
                      </strong>
                    </p>
                    <p>
                      Deduction{" "}
                      <strong className="block">
                        {money(salary.deductionMinor, currency)}
                      </strong>
                    </p>
                    <p>
                      Overtime rate{" "}
                      <strong className="block">
                        {money(salary.overtimeRateMinor, currency)}
                      </strong>
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
        <section className="bg-card overflow-hidden rounded-xl border">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">Payslips</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Created only when a payroll run is finalized.
            </p>
          </div>
          <div className="divide-y">
            {payslips.length === 0 ? (
              <p className="text-muted-foreground p-6 text-sm">
                No finalized payslips in this scope.
              </p>
            ) : (
              payslips.map((payslip) => (
                <div
                  key={payslip.id}
                  className="flex items-center justify-between gap-4 p-5"
                >
                  <div>
                    <p className="font-semibold">{payslip.employeeName}</p>
                    <p className="text-muted-foreground text-xs">
                      {payslip.runNumber} · {payslip.periodStart} –{" "}
                      {payslip.periodEnd}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {money(payslip.netMinor, payslip.currency)}
                    </p>
                    <p className="text-muted-foreground text-xs">Net pay</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="bg-muted/55 flex gap-3 rounded-xl border p-4 text-sm">
        <ShieldCheck className="text-primary mt-0.5 size-5 shrink-0" />
        <p>
          <strong>Operational payroll only.</strong> Qenvaro calculates
          configured compensation, attendance-based hourly/daily pay,
          allowances, deductions, and overtime. It does not claim
          jurisdiction-specific tax or statutory compliance.
        </p>
      </div>
    </div>
  );
}
