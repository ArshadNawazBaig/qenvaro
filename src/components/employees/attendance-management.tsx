"use client";

import { Clock3, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { recordAttendanceAction } from "@/app/app/[tenantSlug]/employees/actions";
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
import type { AttendanceListItem } from "@/modules/employees/schemas";
import type { EmployeeReferenceData } from "@/server/repositories/employees";

function localDateTimeToIso(value: string): string {
  if (!value) return "";
  return new Date(value).toISOString();
}

export function RecordAttendanceDialog({
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
    async (previous: typeof workforceInitialState, formData: FormData) => {
      const clockIn = String(formData.get("clockInLocal") ?? "");
      const clockOut = String(formData.get("clockOutLocal") ?? "");
      formData.set("clockIn", localDateTimeToIso(clockIn));
      formData.set("clockOut", localDateTimeToIso(clockOut));
      return recordAttendanceAction(tenantSlug, previous, formData);
    },
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
          <Plus /> Record attendance
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogTitle className="text-lg font-semibold">
          Record attendance
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          One record per employee and work date. Submitting again updates that
          day.
        </DialogDescription>
        <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
            Employee
            <select name="employeeId" required className={nativeSelectClass}>
              {reference.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.employeeCode} · {employee.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Store
            <select name="storeId" required className={nativeSelectClass}>
              {reference.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Work date
            <Input
              name="workDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Clock in <span className="text-muted-foreground">(optional)</span>
            <Input name="clockInLocal" type="datetime-local" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Clock out <span className="text-muted-foreground">(optional)</span>
            <Input name="clockOutLocal" type="datetime-local" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Break minutes
            <Input
              name="breakMinutes"
              type="number"
              min={0}
              max={1440}
              defaultValue={0}
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Status
            <select
              name="status"
              className={nativeSelectClass}
              defaultValue="present"
            >
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="half_day">Half day</option>
              <option value="absent">Absent</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
            Internal note{" "}
            <span className="text-muted-foreground">(optional)</span>
            <textarea
              name="note"
              maxLength={500}
              rows={3}
              className="border-input bg-card focus-visible:ring-ring w-full rounded-lg border p-3 text-sm outline-none focus-visible:ring-2"
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
              {pending ? "Saving…" : "Save attendance"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function workedTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m`;
}

export function AttendanceManagement({
  items,
}: {
  items: AttendanceListItem[];
}) {
  if (items.length === 0)
    return (
      <div className="p-10 text-center">
        <Clock3 className="text-muted-foreground mx-auto size-7" />
        <p className="mt-3 font-medium">No attendance recorded</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Attendance for authorized employees will appear here.
        </p>
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-muted/45 text-muted-foreground text-xs tracking-wide uppercase">
          <tr>
            <th className="px-5 py-3">Employee</th>
            <th className="px-5 py-3">Date & store</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Recorded time</th>
            <th className="px-5 py-3">Note</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="px-5 py-4">
                <p className="font-semibold">{item.employeeName}</p>
                <p className="text-muted-foreground text-xs">
                  {item.employeeCode}
                </p>
              </td>
              <td className="px-5 py-4">
                <p className="font-medium">{item.workDate}</p>
                <p className="text-muted-foreground text-xs">
                  {item.storeName}
                </p>
              </td>
              <td className="px-5 py-4">
                <Badge
                  variant={
                    item.status === "present"
                      ? "success"
                      : item.status === "absent"
                        ? "destructive"
                        : "warning"
                  }
                >
                  {item.status.replace("_", " ")}
                </Badge>
              </td>
              <td className="px-5 py-4">
                <p className="font-medium">{workedTime(item.workedMinutes)}</p>
                <p className="text-muted-foreground text-xs">
                  {item.breakMinutes}m break
                </p>
              </td>
              <td className="text-muted-foreground max-w-56 px-5 py-4">
                {item.note || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
