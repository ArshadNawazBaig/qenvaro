"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseDecimalToMinor } from "@/lib/money";
import {
  BillingAccessError,
  FeatureAccessError,
} from "@/modules/billing/entitlements";
import {
  changeEmployeeStatusSchema,
  createEmployeeSchema,
  createLeaveRequestSchema,
  decideLeaveRequestSchema,
  linkEmployeeAccountSchema,
  preparePayrollSchema,
  recordAttendanceSchema,
  salaryProfileSchema,
  transitionPayrollSchema,
  updateEmployeeSchema,
} from "@/modules/employees/schemas";
import {
  EmployeeConflictError,
  EmployeeDomainError,
  EmployeeNotFoundError,
  EmployeeService,
  PayrollService,
  WorkforceService,
} from "@/modules/employees/service";
import { PermissionError } from "@/modules/permissions/permissions";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export interface WorkforceActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  version?: number;
}

function strings(formData: FormData, name: string): string[] {
  return formData.getAll(name).map(String).filter(Boolean);
}

function employeeFields(formData: FormData) {
  return {
    name: formData.get("name"),
    workEmail: formData.get("workEmail"),
    phone: formData.get("phone"),
    jobTitle: formData.get("jobTitle"),
    department: formData.get("department"),
    employmentType: formData.get("employmentType"),
    hireDate: formData.get("hireDate"),
    storeIds: strings(formData, "storeIds"),
  };
}

function failure(error: unknown): WorkforceActionState {
  if (error instanceof EmployeeConflictError)
    return { status: "conflict", message: error.message };
  if (
    error instanceof EmployeeDomainError ||
    error instanceof EmployeeNotFoundError ||
    error instanceof PermissionError ||
    error instanceof BillingAccessError ||
    error instanceof FeatureAccessError
  )
    return { status: "error", message: error.message };
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Review the highlighted values.",
    };
  if (error instanceof Error && /valid amount/i.test(error.message))
    return { status: "error", message: error.message };
  return {
    status: "error",
    message: "The workforce change could not be completed. Try again.",
  };
}

function revalidateWorkforce(tenantSlug: string) {
  revalidatePath(`/app/${tenantSlug}`);
  revalidatePath(`/app/${tenantSlug}/employees`);
  revalidatePath(`/app/${tenantSlug}/attendance`);
  revalidatePath(`/app/${tenantSlug}/leave`);
  revalidatePath(`/app/${tenantSlug}/payroll`);
}

export async function createEmployeeAction(
  tenantSlug: string,
  _previous: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = createEmployeeSchema.parse(employeeFields(formData));
    const result = await new EmployeeService().create(context, input);
    revalidateWorkforce(context.tenantSlug);
    return {
      status: "success",
      message: `Employee ${result.employeeCode} created.`,
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateEmployeeAction(
  tenantSlug: string,
  employeeId: string,
  _previous: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = updateEmployeeSchema.parse({
      ...employeeFields(formData),
      employeeId,
      expectedVersion: Number(formData.get("expectedVersion")),
    });
    const result = await new EmployeeService().update(context, input);
    revalidateWorkforce(context.tenantSlug);
    return {
      status: "success",
      message: "Employee updated.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function changeEmployeeStatusAction(
  tenantSlug: string,
  employeeId: string,
  _previous: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = changeEmployeeStatusSchema.parse({
      employeeId,
      expectedVersion: Number(formData.get("expectedVersion")),
      status: formData.get("status"),
    });
    const result = await new EmployeeService().changeStatus(context, input);
    revalidateWorkforce(context.tenantSlug);
    return {
      status: "success",
      message: result.unchanged
        ? "Employee status is already current."
        : "Employee status updated.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function linkEmployeeAccountAction(
  tenantSlug: string,
  employeeId: string,
  _previous: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = linkEmployeeAccountSchema.parse({
      employeeId,
      expectedVersion: Number(formData.get("expectedVersion")),
      email: formData.get("email"),
    });
    const result = await new EmployeeService().linkAccount(context, input);
    revalidateWorkforce(context.tenantSlug);
    return {
      status: "success",
      message: "Employee account linked.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function recordAttendanceAction(
  tenantSlug: string,
  _previous: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = recordAttendanceSchema.parse({
      employeeId: formData.get("employeeId"),
      storeId: formData.get("storeId"),
      workDate: formData.get("workDate"),
      clockIn: formData.get("clockIn") || "",
      clockOut: formData.get("clockOut") || "",
      breakMinutes: Number(formData.get("breakMinutes")),
      status: formData.get("status"),
      note: formData.get("note"),
    });
    const result = await new WorkforceService().recordAttendance(
      context,
      input,
    );
    revalidateWorkforce(context.tenantSlug);
    return {
      status: "success",
      message: result.created ? "Attendance recorded." : "Attendance updated.",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function createLeaveRequestAction(
  tenantSlug: string,
  _previous: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = createLeaveRequestSchema.parse({
      employeeId: formData.get("employeeId"),
      type: formData.get("type"),
      fromDate: formData.get("fromDate"),
      toDate: formData.get("toDate"),
      reason: formData.get("reason"),
    });
    await new WorkforceService().createLeave(context, input);
    revalidateWorkforce(context.tenantSlug);
    return { status: "success", message: "Leave request created." };
  } catch (error) {
    return failure(error);
  }
}

export async function decideLeaveRequestAction(
  tenantSlug: string,
  leaveRequestId: string,
  decision: "approved" | "rejected",
  _previous: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = decideLeaveRequestSchema.parse({
      leaveRequestId,
      expectedVersion: Number(formData.get("expectedVersion")),
      decision,
      note: formData.get("note"),
    });
    const result = await new WorkforceService().decideLeave(context, input);
    revalidateWorkforce(context.tenantSlug);
    return {
      status: "success",
      message: `Leave ${decision}.`,
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function setSalaryProfileAction(
  tenantSlug: string,
  _previous: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = salaryProfileSchema.parse({
      employeeId: formData.get("employeeId"),
      compensationType: formData.get("compensationType"),
      baseAmountMinor: parseDecimalToMinor(
        String(formData.get("baseAmount") ?? ""),
      ),
      allowanceMinor: parseDecimalToMinor(
        String(formData.get("allowance") ?? "0"),
      ),
      deductionMinor: parseDecimalToMinor(
        String(formData.get("deduction") ?? "0"),
      ),
      overtimeRateMinor: parseDecimalToMinor(
        String(formData.get("overtimeRate") ?? "0"),
      ),
      effectiveDate: formData.get("effectiveDate"),
      paySchedule: formData.get("paySchedule"),
      expectedEmployeeVersion: Number(formData.get("expectedEmployeeVersion")),
    });
    await new PayrollService().setSalaryProfile(context, input);
    revalidateWorkforce(context.tenantSlug);
    return {
      status: "success",
      message: "Effective-dated salary profile saved.",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function preparePayrollAction(
  tenantSlug: string,
  _previous: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = preparePayrollSchema.parse({
      storeId: formData.get("storeId"),
      periodStart: formData.get("periodStart"),
      periodEnd: formData.get("periodEnd"),
      payDate: formData.get("payDate"),
      idempotencyKey: formData.get("idempotencyKey"),
    });
    const result = await new PayrollService().prepare(context, input);
    revalidateWorkforce(context.tenantSlug);
    return {
      status: "success",
      message: result.replayed
        ? `${result.runNumber} already prepared.`
        : `${result.runNumber} prepared.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function transitionPayrollAction(
  tenantSlug: string,
  payrollRunId: string,
  targetStatus: "review" | "approved" | "finalized" | "reversed",
  _previous: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = transitionPayrollSchema.parse({
      payrollRunId,
      expectedVersion: Number(formData.get("expectedVersion")),
      targetStatus,
      reason: formData.get("reason") ?? "",
    });
    const result = await new PayrollService().transition(context, input);
    revalidateWorkforce(context.tenantSlug);
    return {
      status: "success",
      message: `Payroll moved to ${result.status}.`,
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}
