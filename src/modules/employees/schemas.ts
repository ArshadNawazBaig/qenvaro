import { z } from "zod";

const opaqueIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid YYYY-MM-DD date.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), {
    message: "Use a valid date.",
  });

const optionalEmailSchema = z
  .string()
  .trim()
  .max(254)
  .refine(
    (value) => value === "" || z.string().email().safeParse(value).success,
    "Enter a valid email address.",
  )
  .transform((value) => value.toLowerCase());

const optionalPhoneSchema = z
  .string()
  .trim()
  .max(32)
  .refine(
    (value) => value === "" || /^[+()\-.\s0-9]+$/.test(value),
    "Enter a valid phone number.",
  );

export const employeeStatusSchema = z.enum([
  "active",
  "on_leave",
  "terminated",
  "archived",
]);
export const employmentTypeSchema = z.enum([
  "full_time",
  "part_time",
  "contract",
  "casual",
]);

export const employeeFieldsSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    workEmail: optionalEmailSchema,
    phone: optionalPhoneSchema,
    jobTitle: z.string().trim().min(2).max(100),
    department: z.string().trim().max(100),
    employmentType: employmentTypeSchema,
    hireDate: dateSchema,
    storeIds: z.array(opaqueIdSchema).min(1).max(20),
  })
  .strict();

export const createEmployeeSchema = employeeFieldsSchema;
export const updateEmployeeSchema = employeeFieldsSchema.extend({
  employeeId: opaqueIdSchema,
  expectedVersion: z.number().int().min(1),
});
export const changeEmployeeStatusSchema = z
  .object({
    employeeId: opaqueIdSchema,
    expectedVersion: z.number().int().min(1),
    status: employeeStatusSchema,
  })
  .strict();
export const linkEmployeeAccountSchema = z
  .object({
    employeeId: opaqueIdSchema,
    expectedVersion: z.number().int().min(1),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
  })
  .strict();

export const employeeListQuerySchema = z.object({
  q: z.string().trim().max(120).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(50).catch(10),
  status: z
    .enum(["all", "active", "on_leave", "terminated", "archived"])
    .catch("all"),
  store: z.string().trim().max(120).catch("all"),
  sort: z.enum(["name", "hireDate", "updatedAt"]).catch("name"),
  direction: z.enum(["asc", "desc"]).catch("asc"),
});

export const attendanceStatusSchema = z.enum([
  "present",
  "absent",
  "late",
  "half_day",
]);
export const recordAttendanceSchema = z
  .object({
    employeeId: opaqueIdSchema,
    storeId: opaqueIdSchema,
    workDate: dateSchema,
    clockIn: z.string().datetime({ offset: true }).or(z.literal("")),
    clockOut: z.string().datetime({ offset: true }).or(z.literal("")),
    breakMinutes: z.number().int().min(0).max(1_440),
    status: attendanceStatusSchema,
    note: z.string().trim().max(500),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.clockIn &&
      input.clockOut &&
      Date.parse(input.clockOut) <= Date.parse(input.clockIn)
    ) {
      context.addIssue({
        code: "custom",
        path: ["clockOut"],
        message: "Clock-out must be after clock-in.",
      });
    }
  });

export const leaveTypeSchema = z.enum(["annual", "sick", "unpaid", "other"]);
export const leaveStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);
export const createLeaveRequestSchema = z
  .object({
    employeeId: opaqueIdSchema,
    type: leaveTypeSchema,
    fromDate: dateSchema,
    toDate: dateSchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .refine((input) => input.toDate >= input.fromDate, {
    path: ["toDate"],
    message: "The end date cannot be before the start date.",
  });
export const decideLeaveRequestSchema = z
  .object({
    leaveRequestId: opaqueIdSchema,
    expectedVersion: z.number().int().min(1),
    decision: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(500),
  })
  .strict();

export const compensationTypeSchema = z.enum([
  "monthly",
  "weekly",
  "daily",
  "hourly",
]);
export const payScheduleSchema = z.enum(["monthly", "weekly", "biweekly"]);
export const salaryProfileSchema = z
  .object({
    employeeId: opaqueIdSchema,
    compensationType: compensationTypeSchema,
    baseAmountMinor: z.number().int().min(0).max(100_000_000_000),
    allowanceMinor: z.number().int().min(0).max(100_000_000_000),
    deductionMinor: z.number().int().min(0).max(100_000_000_000),
    overtimeRateMinor: z.number().int().min(0).max(100_000_000_000),
    effectiveDate: dateSchema,
    paySchedule: payScheduleSchema,
    expectedEmployeeVersion: z.number().int().min(1),
  })
  .strict();

export const payrollStatusSchema = z.enum([
  "draft",
  "review",
  "approved",
  "finalized",
  "reversed",
]);
export const preparePayrollSchema = z
  .object({
    storeId: opaqueIdSchema.or(z.literal("all")),
    periodStart: dateSchema,
    periodEnd: dateSchema,
    payDate: dateSchema,
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .refine((input) => input.periodEnd >= input.periodStart, {
    path: ["periodEnd"],
    message: "The period end cannot be before its start.",
  });
export const transitionPayrollSchema = z
  .object({
    payrollRunId: opaqueIdSchema,
    expectedVersion: z.number().int().min(1),
    targetStatus: z.enum(["review", "approved", "finalized", "reversed"]),
    reason: z.string().trim().max(500),
  })
  .strict();

export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;
export type EmploymentType = z.infer<typeof employmentTypeSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ChangeEmployeeStatusInput = z.infer<
  typeof changeEmployeeStatusSchema
>;
export type LinkEmployeeAccountInput = z.infer<
  typeof linkEmployeeAccountSchema
>;
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
export type RecordAttendanceInput = z.infer<typeof recordAttendanceSchema>;
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type DecideLeaveRequestInput = z.infer<typeof decideLeaveRequestSchema>;
export type SalaryProfileInput = z.infer<typeof salaryProfileSchema>;
export type PayrollStatus = z.infer<typeof payrollStatusSchema>;
export type PreparePayrollInput = z.infer<typeof preparePayrollSchema>;
export type TransitionPayrollInput = z.infer<typeof transitionPayrollSchema>;

export interface EmployeeListItem extends CreateEmployeeInput {
  id: string;
  employeeCode: string;
  status: EmployeeStatus;
  linkedAccountEmail: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceListItem {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  storeId: string;
  storeName: string;
  workDate: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  workedMinutes: number;
  status: z.infer<typeof attendanceStatusSchema>;
  note: string;
}

export interface LeaveListItem {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  type: z.infer<typeof leaveTypeSchema>;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: z.infer<typeof leaveStatusSchema>;
  decisionNote: string;
  version: number;
}

export interface SalarySummary {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  compensationType: z.infer<typeof compensationTypeSchema>;
  baseAmountMinor: number;
  allowanceMinor: number;
  deductionMinor: number;
  overtimeRateMinor: number;
  effectiveDate: string;
  paySchedule: z.infer<typeof payScheduleSchema>;
}

export interface PayrollRunListItem {
  id: string;
  runNumber: string;
  storeId: string | null;
  storeName: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  currency: string;
  status: PayrollStatus;
  employeeCount: number;
  grossMinor: number;
  deductionMinor: number;
  netMinor: number;
  version: number;
  finalizedAt: string;
}

export interface PayslipListItem {
  id: string;
  payrollRunId: string;
  runNumber: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  currency: string;
  baseMinor: number;
  allowanceMinor: number;
  overtimeMinor: number;
  deductionMinor: number;
  netMinor: number;
  finalizedAt: string;
}

export function normalizeEmployeeValue(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function createEmployeeCode(employeeId: string): string {
  return `E-${employeeId.slice(-8).toUpperCase()}`;
}
