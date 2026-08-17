import "server-only";
import type { ClientSession, Db } from "mongodb";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import {
  requireFeature,
  requireTenantWriteEntitlement,
} from "@/modules/billing/entitlements";
import {
  changeEmployeeStatusSchema,
  createEmployeeCode,
  createEmployeeSchema,
  createLeaveRequestSchema,
  decideLeaveRequestSchema,
  linkEmployeeAccountSchema,
  normalizeEmployeeValue,
  preparePayrollSchema,
  recordAttendanceSchema,
  salaryProfileSchema,
  transitionPayrollSchema,
  updateEmployeeSchema,
  type ChangeEmployeeStatusInput,
  type CreateEmployeeInput,
  type CreateLeaveRequestInput,
  type DecideLeaveRequestInput,
  type LinkEmployeeAccountInput,
  type PayrollStatus,
  type PreparePayrollInput,
  type RecordAttendanceInput,
  type SalaryProfileInput,
  type TransitionPayrollInput,
  type UpdateEmployeeInput,
} from "./schemas";
import {
  calculatePayrollItem,
  requirePayrollTransition,
} from "./payroll-policy";
import {
  hasPermission,
  requirePermission,
} from "@/modules/permissions/permissions";
import { getMongoClient } from "@/server/db/client";
import {
  assertStoreAccess,
  TenantNotFoundError,
  type TenantContext,
} from "@/server/tenancy/context";

type StringIdDocument = { _id: string } & Record<string, unknown>;

interface BillingProfile {
  planKey: string;
  currency: string;
  billingStatus?: string;
  trialEndsAt?: Date;
  graceEndsAt?: Date;
  currentPeriodEndsAt?: Date;
}

interface EmployeeDocument {
  _id: string;
  tenantId: string;
  employeeCode: string;
  name: string;
  normalizedName: string;
  workEmail: string;
  normalizedWorkEmail: string;
  phone: string;
  jobTitle: string;
  department: string;
  employmentType: CreateEmployeeInput["employmentType"];
  hireDate: string;
  storeIds: string[];
  status: "active" | "on_leave" | "terminated" | "archived";
  linkedUserId?: string;
  linkedAccountEmail?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  archivedAt?: Date;
}

interface SalaryProfileDocument {
  _id: string;
  tenantId: string;
  employeeId: string;
  compensationType: SalaryProfileInput["compensationType"];
  baseAmountMinor: number;
  allowanceMinor: number;
  deductionMinor: number;
  overtimeRateMinor: number;
  effectiveDate: string;
  paySchedule: SalaryProfileInput["paySchedule"];
  createdAt: Date;
  createdBy: string;
}

interface AttendanceDocument {
  _id: string;
  tenantId: string;
  employeeId: string;
  storeId: string;
  workDate: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  workedMinutes: number;
  status: RecordAttendanceInput["status"];
  note: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

interface LeaveDocument {
  _id: string;
  tenantId: string;
  employeeId: string;
  type: CreateLeaveRequestInput["type"];
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decisionNote: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

interface PayrollRunDocument {
  _id: string;
  tenantId: string;
  runNumber: string;
  storeId: string | null;
  scopeStoreIds: string[];
  periodStart: string;
  periodEnd: string;
  payDate: string;
  currency: string;
  status: PayrollStatus;
  employeeCount: number;
  grossMinor: number;
  deductionMinor: number;
  netMinor: number;
  requestFingerprint: string;
  idempotencyKey: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  finalizedAt?: Date;
}

interface PayrollItemDocument extends StringIdDocument {
  tenantId: string;
  payrollRunId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  compensationType: SalaryProfileInput["compensationType"];
  baseMinor: number;
  allowanceMinor: number;
  overtimeMinor: number;
  deductionMinor: number;
  grossMinor: number;
  netMinor: number;
  workedMinutes: number;
  overtimeMinutes: number;
  payableDays: number;
  status: "draft" | "finalized" | "reversed";
  createdAt: Date;
}

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("The requested employee was not found.");
    this.name = "EmployeeNotFoundError";
  }
}

export class EmployeeConflictError extends Error {
  constructor(message = "This record changed after the page was loaded.") {
    super(message);
    this.name = "EmployeeConflictError";
  }
}

export class EmployeeDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeDomainError";
  }
}

async function requireWriteAccess(
  database: Db,
  context: TenantContext,
  session: ClientSession,
): Promise<BillingProfile> {
  const profile = await database
    .collection<BillingProfile>("tenantProfiles")
    .findOne(
      { tenantId: context.tenantId },
      {
        session,
        projection: {
          planKey: 1,
          currency: 1,
          billingStatus: 1,
          trialEndsAt: 1,
          graceEndsAt: 1,
          currentPeriodEndsAt: 1,
        },
      },
    );
  if (!profile) throw new TenantNotFoundError();
  requireTenantWriteEntitlement(profile);
  return profile;
}

async function requireStores(
  database: Db,
  context: TenantContext,
  storeIds: readonly string[],
  session: ClientSession,
): Promise<void> {
  for (const storeId of storeIds) assertStoreAccess(context, storeId);
  const count = await database
    .collection<{ _id: string }>("stores")
    .countDocuments(
      {
        tenantId: context.tenantId,
        _id: { $in: [...storeIds] },
        status: "active",
        deletedAt: { $exists: false },
      },
      { session },
    );
  if (count !== new Set(storeIds).size) throw new TenantNotFoundError();
}

async function audit(
  database: Db,
  context: TenantContext,
  session: ClientSession,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    summary: string;
    changes?: Record<string, unknown>;
  },
): Promise<void> {
  await database.collection<StringIdDocument>("auditLogs").insertOne(
    {
      _id: createOpaqueId("aud"),
      tenantId: context.tenantId,
      actorId: context.userId,
      requestId: context.requestId,
      ...input,
      createdAt: new Date(),
    },
    { session },
  );
}

function employeeFields(input: CreateEmployeeInput) {
  return {
    name: input.name,
    normalizedName: normalizeEmployeeValue(input.name),
    workEmail: input.workEmail,
    normalizedWorkEmail: normalizeEmployeeValue(input.workEmail),
    phone: input.phone,
    jobTitle: input.jobTitle,
    department: input.department,
    employmentType: input.employmentType,
    hireDate: input.hireDate,
    storeIds: [...new Set(input.storeIds)].sort(),
  };
}

function workedMinutes(input: RecordAttendanceInput): number {
  if (!input.clockIn || !input.clockOut) return 0;
  const elapsed = Math.max(
    0,
    Math.round(
      (Date.parse(input.clockOut) - Date.parse(input.clockIn)) / 60_000,
    ),
  );
  return Math.max(0, elapsed - input.breakMinutes);
}

function calendarDays(fromDate: string, toDate: string): number {
  return (
    Math.floor(
      (Date.parse(`${toDate}T00:00:00.000Z`) -
        Date.parse(`${fromDate}T00:00:00.000Z`)) /
        86_400_000,
    ) + 1
  );
}

function payrollFingerprint(input: PreparePayrollInput): string {
  return JSON.stringify({
    storeId: input.storeId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    payDate: input.payDate,
  });
}

export class EmployeeService {
  async create(context: TenantContext, untrusted: CreateEmployeeInput) {
    requirePermission(context.permissions, "employee:create");
    const input = createEmployeeSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const employeeId = createOpaqueId("emp");
    const employeeCode = createEmployeeCode(employeeId);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context, session);
        await requireStores(database, context, input.storeIds, session);
        const now = new Date();
        await database.collection<EmployeeDocument>("employees").insertOne(
          {
            _id: employeeId,
            tenantId: context.tenantId,
            employeeCode,
            ...employeeFields(input),
            status: "active",
            version: 1,
            createdAt: now,
            updatedAt: now,
            createdBy: context.userId,
            updatedBy: context.userId,
          },
          { session },
        );
        await audit(database, context, session, {
          action: "employee.created",
          entityType: "employee",
          entityId: employeeId,
          summary: "Created an employee profile.",
          changes: {
            after: {
              employeeCode,
              employmentType: input.employmentType,
              storeCount: new Set(input.storeIds).size,
              status: "active",
            },
          },
        });
        return { id: employeeId, employeeCode, version: 1 };
      }),
    );
    if (!result) throw new Error("Employee creation did not complete.");
    return result;
  }

  async update(context: TenantContext, untrusted: UpdateEmployeeInput) {
    requirePermission(context.permissions, "employee:update");
    const input = updateEmployeeSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context, session);
        await requireStores(database, context, input.storeIds, session);
        const employees = database.collection<EmployeeDocument>("employees");
        const existing = await employees.findOne(
          {
            _id: input.employeeId,
            tenantId: context.tenantId,
            storeIds: { $in: [...context.allowedStoreIds] },
          },
          { session },
        );
        if (!existing) throw new EmployeeNotFoundError();
        if (existing.status === "archived")
          throw new EmployeeDomainError("Archived employees cannot be edited.");
        if (existing.version !== input.expectedVersion)
          throw new EmployeeConflictError();
        const update = await employees.updateOne(
          {
            _id: input.employeeId,
            tenantId: context.tenantId,
            version: input.expectedVersion,
          },
          {
            $set: {
              ...employeeFields(input),
              updatedAt: new Date(),
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new EmployeeConflictError();
        await audit(database, context, session, {
          action: "employee.updated",
          entityType: "employee",
          entityId: input.employeeId,
          summary: "Updated an employee profile.",
          changes: {
            before: {
              status: existing.status,
              storeCount: existing.storeIds.length,
            },
            after: {
              status: existing.status,
              storeCount: new Set(input.storeIds).size,
            },
          },
        });
        return { version: input.expectedVersion + 1 };
      }),
    );
    if (!result) throw new Error("Employee update did not complete.");
    return result;
  }

  async changeStatus(
    context: TenantContext,
    untrusted: ChangeEmployeeStatusInput,
  ) {
    requirePermission(context.permissions, "employee:archive");
    const input = changeEmployeeStatusSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context, session);
        const employees = database.collection<EmployeeDocument>("employees");
        const existing = await employees.findOne(
          {
            _id: input.employeeId,
            tenantId: context.tenantId,
            storeIds: { $in: [...context.allowedStoreIds] },
          },
          { session },
        );
        if (!existing) throw new EmployeeNotFoundError();
        if (existing.version !== input.expectedVersion)
          throw new EmployeeConflictError();
        if (existing.status === input.status)
          return { version: existing.version, unchanged: true };
        const now = new Date();
        const update = await employees.updateOne(
          {
            _id: input.employeeId,
            tenantId: context.tenantId,
            version: input.expectedVersion,
          },
          {
            $set: {
              status: input.status,
              ...(input.status === "archived" ? { archivedAt: now } : {}),
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new EmployeeConflictError();
        await audit(database, context, session, {
          action: "employee.status_changed",
          entityType: "employee",
          entityId: input.employeeId,
          summary: "Changed an employee lifecycle status.",
          changes: {
            before: { status: existing.status },
            after: { status: input.status },
          },
        });
        return { version: input.expectedVersion + 1, unchanged: false };
      }),
    );
    if (!result) throw new Error("Employee status change did not complete.");
    return result;
  }

  async linkAccount(
    context: TenantContext,
    untrusted: LinkEmployeeAccountInput,
  ) {
    requirePermission(context.permissions, "employee:update");
    const input = linkEmployeeAccountSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context, session);
        const employee = await database
          .collection<EmployeeDocument>("employees")
          .findOne(
            {
              _id: input.employeeId,
              tenantId: context.tenantId,
              storeIds: { $in: [...context.allowedStoreIds] },
            },
            { session },
          );
        if (!employee) throw new EmployeeNotFoundError();
        if (employee.version !== input.expectedVersion)
          throw new EmployeeConflictError();
        const user = await database
          .collection<{ _id: string; email: string }>("user")
          .findOne(
            { email: input.email },
            { session, projection: { email: 1 } },
          );
        if (!user)
          throw new EmployeeDomainError(
            "No verified workspace account uses that email.",
          );
        const membership = await database
          .collection("member")
          .findOne(
            { organizationId: context.tenantId, userId: String(user._id) },
            { session, projection: { _id: 1 } },
          );
        if (!membership)
          throw new EmployeeDomainError(
            "That account is not an active business member.",
          );
        const update = await database
          .collection<EmployeeDocument>("employees")
          .updateOne(
            {
              _id: input.employeeId,
              tenantId: context.tenantId,
              version: input.expectedVersion,
            },
            {
              $set: {
                linkedUserId: String(user._id),
                linkedAccountEmail: user.email,
                updatedAt: new Date(),
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        if (update.matchedCount !== 1) throw new EmployeeConflictError();
        await audit(database, context, session, {
          action: "employee.account_linked",
          entityType: "employee",
          entityId: input.employeeId,
          summary: "Linked an employee to an existing workspace account.",
          changes: { after: { linked: true } },
        });
        return { version: input.expectedVersion + 1 };
      }),
    );
    if (!result) throw new Error("Employee account linking did not complete.");
    return result;
  }
}

export class WorkforceService {
  async recordAttendance(
    context: TenantContext,
    untrusted: RecordAttendanceInput,
  ) {
    const input = recordAttendanceSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context, session);
        assertStoreAccess(context, input.storeId);
        const employee = await database
          .collection<EmployeeDocument>("employees")
          .findOne(
            {
              _id: input.employeeId,
              tenantId: context.tenantId,
              storeIds: input.storeId,
              status: { $in: ["active", "on_leave"] },
            },
            { session, projection: { linkedUserId: 1 } },
          );
        if (!employee) throw new EmployeeNotFoundError();
        const manages = hasPermission(context.permissions, "attendance:manage");
        const owns =
          hasPermission(context.permissions, "attendance:createOwn") &&
          employee.linkedUserId === context.userId;
        if (!manages && !owns)
          requirePermission(context.permissions, "attendance:manage");
        const attendance =
          database.collection<AttendanceDocument>("attendanceRecords");
        const existing = await attendance.findOne(
          {
            tenantId: context.tenantId,
            employeeId: input.employeeId,
            workDate: input.workDate,
          },
          { session },
        );
        const now = new Date();
        const values = {
          storeId: input.storeId,
          clockIn: input.clockIn,
          clockOut: input.clockOut,
          breakMinutes: input.breakMinutes,
          workedMinutes: workedMinutes(input),
          status: input.status,
          note: input.note,
          updatedAt: now,
          updatedBy: context.userId,
        };
        if (existing) {
          await attendance.updateOne(
            {
              _id: existing._id,
              tenantId: context.tenantId,
              version: existing.version,
            },
            { $set: values, $inc: { version: 1 } },
            { session },
          );
        } else {
          await attendance.insertOne(
            {
              _id: createOpaqueId("att"),
              tenantId: context.tenantId,
              employeeId: input.employeeId,
              workDate: input.workDate,
              ...values,
              version: 1,
              createdAt: now,
              createdBy: context.userId,
            },
            { session },
          );
        }
        await audit(database, context, session, {
          action: existing ? "attendance.updated" : "attendance.recorded",
          entityType: "attendance",
          entityId: existing?._id ?? input.employeeId,
          summary: existing
            ? "Updated an attendance record."
            : "Recorded employee attendance.",
          changes: {
            after: {
              status: input.status,
              workDate: input.workDate,
              storeId: input.storeId,
            },
          },
        });
        return { created: !existing };
      }),
    );
    if (!result) throw new Error("Attendance recording did not complete.");
    return result;
  }

  async createLeave(
    context: TenantContext,
    untrusted: CreateLeaveRequestInput,
  ) {
    const input = createLeaveRequestSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context, session);
        const employee = await database
          .collection<EmployeeDocument>("employees")
          .findOne(
            {
              _id: input.employeeId,
              tenantId: context.tenantId,
              storeIds: { $in: [...context.allowedStoreIds] },
              status: { $in: ["active", "on_leave"] },
            },
            { session, projection: { linkedUserId: 1 } },
          );
        if (!employee) throw new EmployeeNotFoundError();
        const manages = hasPermission(context.permissions, "attendance:manage");
        const owns =
          hasPermission(context.permissions, "attendance:createOwn") &&
          employee.linkedUserId === context.userId;
        if (!manages && !owns)
          requirePermission(context.permissions, "attendance:manage");
        const now = new Date();
        const id = createOpaqueId("lea");
        await database.collection<LeaveDocument>("leaveRequests").insertOne(
          {
            _id: id,
            tenantId: context.tenantId,
            employeeId: input.employeeId,
            type: input.type,
            fromDate: input.fromDate,
            toDate: input.toDate,
            days: calendarDays(input.fromDate, input.toDate),
            reason: input.reason,
            status: "pending",
            decisionNote: "",
            version: 1,
            createdAt: now,
            updatedAt: now,
            createdBy: context.userId,
            updatedBy: context.userId,
          },
          { session },
        );
        await audit(database, context, session, {
          action: "leave.requested",
          entityType: "leaveRequest",
          entityId: id,
          summary: "Created a leave request.",
          changes: {
            after: {
              type: input.type,
              days: calendarDays(input.fromDate, input.toDate),
              status: "pending",
            },
          },
        });
        return { id, version: 1 };
      }),
    );
    if (!result) throw new Error("Leave request creation did not complete.");
    return result;
  }

  async decideLeave(
    context: TenantContext,
    untrusted: DecideLeaveRequestInput,
  ) {
    requirePermission(context.permissions, "attendance:manage");
    const input = decideLeaveRequestSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context, session);
        const leave = await database
          .collection<LeaveDocument>("leaveRequests")
          .findOne(
            { _id: input.leaveRequestId, tenantId: context.tenantId },
            { session },
          );
        if (!leave) throw new EmployeeNotFoundError();
        const employee = await database
          .collection<EmployeeDocument>("employees")
          .findOne(
            {
              _id: leave.employeeId,
              tenantId: context.tenantId,
              storeIds: { $in: [...context.allowedStoreIds] },
            },
            { session, projection: { _id: 1 } },
          );
        if (!employee) throw new EmployeeNotFoundError();
        if (leave.version !== input.expectedVersion)
          throw new EmployeeConflictError();
        if (leave.status !== "pending")
          throw new EmployeeDomainError(
            "Only pending leave requests can be decided.",
          );
        const update = await database
          .collection<LeaveDocument>("leaveRequests")
          .updateOne(
            {
              _id: input.leaveRequestId,
              tenantId: context.tenantId,
              version: input.expectedVersion,
              status: "pending",
            },
            {
              $set: {
                status: input.decision,
                decisionNote: input.note,
                decidedAt: new Date(),
                decidedBy: context.userId,
                updatedAt: new Date(),
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        if (update.matchedCount !== 1) throw new EmployeeConflictError();
        await audit(database, context, session, {
          action: `leave.${input.decision}`,
          entityType: "leaveRequest",
          entityId: input.leaveRequestId,
          summary: `Marked a leave request ${input.decision}.`,
          changes: {
            before: { status: "pending" },
            after: { status: input.decision },
          },
        });
        return { version: input.expectedVersion + 1 };
      }),
    );
    if (!result) throw new Error("Leave decision did not complete.");
    return result;
  }
}

export class PayrollService {
  async setSalaryProfile(
    context: TenantContext,
    untrusted: SalaryProfileInput,
  ) {
    requirePermission(context.permissions, "compensation:manage");
    const input = salaryProfileSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context, session);
        const employee = await database
          .collection<EmployeeDocument>("employees")
          .findOne(
            {
              _id: input.employeeId,
              tenantId: context.tenantId,
              storeIds: { $in: [...context.allowedStoreIds] },
              status: { $ne: "archived" },
            },
            { session, projection: { version: 1 } },
          );
        if (!employee) throw new EmployeeNotFoundError();
        if (employee.version !== input.expectedEmployeeVersion)
          throw new EmployeeConflictError();
        const id = createOpaqueId("sal");
        await database
          .collection<SalaryProfileDocument>("salaryProfiles")
          .insertOne(
            {
              _id: id,
              tenantId: context.tenantId,
              employeeId: input.employeeId,
              compensationType: input.compensationType,
              baseAmountMinor: input.baseAmountMinor,
              allowanceMinor: input.allowanceMinor,
              deductionMinor: input.deductionMinor,
              overtimeRateMinor: input.overtimeRateMinor,
              effectiveDate: input.effectiveDate,
              paySchedule: input.paySchedule,
              createdAt: new Date(),
              createdBy: context.userId,
            },
            { session },
          );
        await audit(database, context, session, {
          action: "compensation.profile_created",
          entityType: "salaryProfile",
          entityId: id,
          summary: "Created an effective-dated salary profile.",
          changes: {
            after: {
              employeeId: input.employeeId,
              compensationType: input.compensationType,
              paySchedule: input.paySchedule,
              effectiveDate: input.effectiveDate,
            },
          },
        });
        return { id };
      }),
    );
    if (!result) throw new Error("Salary profile creation did not complete.");
    return result;
  }

  async prepare(context: TenantContext, untrusted: PreparePayrollInput) {
    requirePermission(context.permissions, "payroll:prepare");
    const input = preparePayrollSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const profile = await requireWriteAccess(database, context, session);
        requireFeature(requireTenantWriteEntitlement(profile), "payroll");
        const runs = database.collection<PayrollRunDocument>("payrollRuns");
        const existing = await runs.findOne(
          { tenantId: context.tenantId, idempotencyKey: input.idempotencyKey },
          { session },
        );
        const fingerprint = payrollFingerprint(input);
        if (existing) {
          if (existing.requestFingerprint !== fingerprint)
            throw new EmployeeConflictError(
              "That payroll request key was already used for different input.",
            );
          return {
            id: existing._id,
            runNumber: existing.runNumber,
            replayed: true,
          };
        }
        let scopeStoreIds: string[];
        let storeId: string | null;
        if (input.storeId === "all") {
          if (
            !context.roles.some((role) => role === "OWNER" || role === "ADMIN")
          )
            throw new EmployeeDomainError(
              "Only owners and administrators can prepare an all-store payroll.",
            );
          scopeStoreIds = [...context.allowedStoreIds].sort();
          storeId = null;
        } else {
          assertStoreAccess(context, input.storeId);
          scopeStoreIds = [input.storeId];
          storeId = input.storeId;
        }
        if (scopeStoreIds.length === 0)
          throw new EmployeeDomainError("No authorized stores are available.");
        const employees = await database
          .collection<EmployeeDocument>("employees")
          .find(
            {
              tenantId: context.tenantId,
              storeIds: { $in: scopeStoreIds },
              status: { $in: ["active", "on_leave"] },
            },
            { session, projection: { employeeCode: 1, name: 1 } },
          )
          .sort({ normalizedName: 1, _id: 1 })
          .limit(500)
          .toArray();
        const employeeIds = employees.map((employee) => employee._id);
        const salaryDocuments = await database
          .collection<SalaryProfileDocument>("salaryProfiles")
          .find(
            {
              tenantId: context.tenantId,
              employeeId: { $in: employeeIds },
              effectiveDate: { $lte: input.periodEnd },
            },
            { session },
          )
          .sort({ effectiveDate: -1, createdAt: -1 })
          .limit(2_000)
          .toArray();
        const salaries = new Map<string, SalaryProfileDocument>();
        for (const salary of salaryDocuments)
          if (!salaries.has(salary.employeeId))
            salaries.set(salary.employeeId, salary);
        const attendance = await database
          .collection<AttendanceDocument>("attendanceRecords")
          .find(
            {
              tenantId: context.tenantId,
              employeeId: { $in: employeeIds },
              storeId: { $in: scopeStoreIds },
              workDate: { $gte: input.periodStart, $lte: input.periodEnd },
            },
            {
              session,
              projection: { employeeId: 1, workedMinutes: 1, status: 1 },
            },
          )
          .limit(10_000)
          .toArray();
        const worked = new Map<string, { minutes: number; days: number }>();
        for (const record of attendance) {
          const aggregate = worked.get(record.employeeId) ?? {
            minutes: 0,
            days: 0,
          };
          aggregate.minutes += record.workedMinutes;
          if (["present", "late", "half_day"].includes(record.status))
            aggregate.days += 1;
          worked.set(record.employeeId, aggregate);
        }
        const prepared = employees.flatMap((employee) => {
          const salary = salaries.get(employee._id);
          if (!salary) return [];
          const activity = worked.get(employee._id) ?? { minutes: 0, days: 0 };
          const standardMinutes = activity.days * 8 * 60;
          const overtimeMinutes = Math.max(
            0,
            activity.minutes - standardMinutes,
          );
          return [
            {
              employee,
              salary,
              activity,
              overtimeMinutes,
              calculation: calculatePayrollItem({
                compensationType: salary.compensationType,
                baseAmountMinor: salary.baseAmountMinor,
                allowanceMinor: salary.allowanceMinor,
                deductionMinor: salary.deductionMinor,
                overtimeRateMinor: salary.overtimeRateMinor,
                workedMinutes: activity.minutes,
                overtimeMinutes,
                payableDays: activity.days,
              }),
            },
          ];
        });
        if (prepared.length === 0)
          throw new EmployeeDomainError(
            "No eligible employees with effective salary profiles were found.",
          );
        const sequence = await database
          .collection<{ _id: string; value: number }>("sequenceCounters")
          .findOneAndUpdate(
            { _id: `${context.tenantId}:payroll` },
            {
              $inc: { value: 1 },
              $setOnInsert: {
                tenantId: context.tenantId,
                sequenceType: "payroll",
                createdAt: new Date(),
              },
              $set: { updatedAt: new Date() },
            },
            { session, upsert: true, returnDocument: "after" },
          );
        if (!sequence) throw new Error("Payroll number generation failed.");
        const runNumber = `PAY-${String(sequence.value).padStart(6, "0")}`;
        const id = createOpaqueId("pay");
        const now = new Date();
        const grossMinor = prepared.reduce(
          (sum, row) => sum + row.calculation.grossMinor,
          0,
        );
        const deductionMinor = prepared.reduce(
          (sum, row) => sum + row.calculation.deductionMinor,
          0,
        );
        const netMinor = prepared.reduce(
          (sum, row) => sum + row.calculation.netMinor,
          0,
        );
        await runs.insertOne(
          {
            _id: id,
            tenantId: context.tenantId,
            runNumber,
            storeId,
            scopeStoreIds,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            payDate: input.payDate,
            currency: profile.currency,
            status: "draft",
            employeeCount: prepared.length,
            grossMinor,
            deductionMinor,
            netMinor,
            requestFingerprint: fingerprint,
            idempotencyKey: input.idempotencyKey,
            version: 1,
            createdAt: now,
            updatedAt: now,
            createdBy: context.userId,
            updatedBy: context.userId,
          },
          { session },
        );
        await database
          .collection<PayrollItemDocument>("payrollItems")
          .insertMany(
            prepared.map((row) => ({
              _id: createOpaqueId("pit"),
              tenantId: context.tenantId,
              payrollRunId: id,
              employeeId: row.employee._id,
              employeeCode: row.employee.employeeCode,
              employeeName: row.employee.name,
              compensationType: row.salary.compensationType,
              ...row.calculation,
              workedMinutes: row.activity.minutes,
              overtimeMinutes: row.overtimeMinutes,
              payableDays: row.activity.days,
              status: "draft" as const,
              createdAt: now,
            })),
            { session },
          );
        await audit(database, context, session, {
          action: "payroll.prepared",
          entityType: "payrollRun",
          entityId: id,
          summary: "Prepared an operational payroll run.",
          changes: {
            after: {
              runNumber,
              status: "draft",
              employeeCount: prepared.length,
              storeCount: scopeStoreIds.length,
            },
          },
        });
        return { id, runNumber, replayed: false };
      }),
    );
    if (!result) throw new Error("Payroll preparation did not complete.");
    return result;
  }

  async transition(context: TenantContext, untrusted: TransitionPayrollInput) {
    const input = transitionPayrollSchema.parse(untrusted);
    const requiredPermission =
      input.targetStatus === "review"
        ? "payroll:prepare"
        : input.targetStatus === "approved"
          ? "payroll:approve"
          : "payroll:finalize";
    requirePermission(context.permissions, requiredPermission);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const profile = await requireWriteAccess(database, context, session);
        requireFeature(requireTenantWriteEntitlement(profile), "payroll");
        const runs = database.collection<PayrollRunDocument>("payrollRuns");
        const run = await runs.findOne(
          {
            _id: input.payrollRunId,
            tenantId: context.tenantId,
            $or: [
              { storeId: { $in: [...context.allowedStoreIds] } },
              { storeId: null, createdBy: context.userId },
            ],
          },
          { session },
        );
        if (!run) throw new EmployeeNotFoundError();
        if (run.version !== input.expectedVersion)
          throw new EmployeeConflictError();
        requirePayrollTransition(run.status, input.targetStatus);
        if (input.targetStatus === "reversed" && input.reason.length < 3)
          throw new EmployeeDomainError("A reversal reason is required.");
        const now = new Date();
        const update = await runs.updateOne(
          {
            _id: run._id,
            tenantId: context.tenantId,
            version: input.expectedVersion,
            status: run.status,
          },
          {
            $set: {
              status: input.targetStatus,
              ...(input.targetStatus === "finalized"
                ? { finalizedAt: now, finalizedBy: context.userId }
                : {}),
              ...(input.targetStatus === "reversed"
                ? {
                    reversedAt: now,
                    reversedBy: context.userId,
                    reversalReason: input.reason,
                  }
                : {}),
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new EmployeeConflictError();
        if (input.targetStatus === "finalized") {
          const items = await database
            .collection<PayrollItemDocument>("payrollItems")
            .find(
              {
                tenantId: context.tenantId,
                payrollRunId: run._id,
                status: "draft",
              },
              { session },
            )
            .toArray();
          await database
            .collection<PayrollItemDocument>("payrollItems")
            .updateMany(
              {
                tenantId: context.tenantId,
                payrollRunId: run._id,
                status: "draft",
              },
              { $set: { status: "finalized", finalizedAt: now } },
              { session },
            );
          if (items.length > 0) {
            await database.collection<StringIdDocument>("payslips").insertMany(
              items.map((item) => ({
                _id: createOpaqueId("psl"),
                tenantId: context.tenantId,
                payrollRunId: run._id,
                runNumber: run.runNumber,
                employeeId: item.employeeId,
                employeeCode: item.employeeCode,
                employeeName: item.employeeName,
                periodStart: run.periodStart,
                periodEnd: run.periodEnd,
                payDate: run.payDate,
                currency: run.currency,
                baseMinor: item.baseMinor,
                allowanceMinor: item.allowanceMinor,
                overtimeMinor: item.overtimeMinor,
                deductionMinor: item.deductionMinor,
                netMinor: item.netMinor,
                finalizedAt: now,
                createdAt: now,
              })),
              { session },
            );
          }
        } else if (input.targetStatus === "reversed") {
          await database
            .collection<PayrollItemDocument>("payrollItems")
            .updateMany(
              {
                tenantId: context.tenantId,
                payrollRunId: run._id,
                status: "finalized",
              },
              { $set: { status: "reversed", reversedAt: now } },
              { session },
            );
          await database
            .collection("payslips")
            .updateMany(
              { tenantId: context.tenantId, payrollRunId: run._id },
              { $set: { reversedAt: now, status: "reversed" } },
              { session },
            );
        }
        await audit(database, context, session, {
          action: `payroll.${input.targetStatus}`,
          entityType: "payrollRun",
          entityId: run._id,
          summary: `Moved an operational payroll run to ${input.targetStatus}.`,
          changes: {
            before: { status: run.status },
            after: { status: input.targetStatus },
          },
        });
        return {
          version: input.expectedVersion + 1,
          status: input.targetStatus,
        };
      }),
    );
    if (!result) throw new Error("Payroll transition did not complete.");
    return result;
  }
}
