import "server-only";
import type { Filter, Sort } from "mongodb";
import {
  hasPermission,
  requirePermission,
} from "@/modules/permissions/permissions";
import type {
  AttendanceListItem,
  EmployeeListItem,
  EmployeeListQuery,
  LeaveListItem,
  PayrollRunListItem,
  PayslipListItem,
  SalarySummary,
} from "@/modules/employees/schemas";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

interface EmployeeDocument {
  _id: string;
  tenantId: string;
  employeeCode: string;
  name: string;
  normalizedName: string;
  workEmail: string;
  phone: string;
  jobTitle: string;
  department: string;
  employmentType: EmployeeListItem["employmentType"];
  hireDate: string;
  storeIds: string[];
  status: EmployeeListItem["status"];
  linkedUserId?: string;
  linkedAccountEmail?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
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
  status: AttendanceListItem["status"];
  note: string;
}

interface LeaveDocument {
  _id: string;
  tenantId: string;
  employeeId: string;
  type: LeaveListItem["type"];
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: LeaveListItem["status"];
  decisionNote: string;
  version: number;
  createdAt: Date;
}

interface SalaryDocument {
  _id: string;
  tenantId: string;
  employeeId: string;
  compensationType: SalarySummary["compensationType"];
  baseAmountMinor: number;
  allowanceMinor: number;
  deductionMinor: number;
  overtimeRateMinor: number;
  effectiveDate: string;
  paySchedule: SalarySummary["paySchedule"];
  createdAt: Date;
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
  status: PayrollRunListItem["status"];
  employeeCount: number;
  grossMinor: number;
  deductionMinor: number;
  netMinor: number;
  version: number;
  finalizedAt?: Date;
  createdAt: Date;
  createdBy: string;
}

interface PayslipDocument extends Omit<PayslipListItem, "id" | "finalizedAt"> {
  _id: string;
  tenantId: string;
  finalizedAt: Date;
  status?: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function employeeReadFilter(context: TenantContext): Filter<EmployeeDocument> {
  if (hasPermission(context.permissions, "employee:read")) {
    return {
      tenantId: context.tenantId,
      storeIds: { $in: [...context.allowedStoreIds] },
    };
  }
  requirePermission(context.permissions, "employee:readOwn");
  return { tenantId: context.tenantId, linkedUserId: context.userId };
}

function canReadOwnWorkforce(context: TenantContext): boolean {
  return (
    hasPermission(context.permissions, "attendance:readOwn") ||
    hasPermission(context.permissions, "payroll:readOwn")
  );
}

export interface EmployeeReferenceData {
  currency: string;
  stores: { id: string; code: string; name: string }[];
  employees: {
    id: string;
    employeeCode: string;
    name: string;
    version: number;
    storeIds: string[];
  }[];
}

export class EmployeeRepository {
  async list(
    context: TenantContext,
    query: EmployeeListQuery,
  ): Promise<{ items: EmployeeListItem[]; total: number }> {
    const filter = employeeReadFilter(context);
    if (query.status !== "all") filter.status = query.status;
    if (query.store !== "all") {
      if (!context.allowedStoreIds.has(query.store)) {
        return { items: [], total: 0 };
      }
      filter.storeIds = query.store;
    }
    if (query.q) {
      const safe = escapeRegex(query.q);
      filter.$or = [
        { name: { $regex: safe, $options: "i" } },
        { employeeCode: { $regex: safe, $options: "i" } },
        { jobTitle: { $regex: safe, $options: "i" } },
        { department: { $regex: safe, $options: "i" } },
        { workEmail: { $regex: safe, $options: "i" } },
      ];
    }
    const sortFields: Record<EmployeeListQuery["sort"], string> = {
      name: "normalizedName",
      hireDate: "hireDate",
      updatedAt: "updatedAt",
    };
    const sort: Sort = {
      [sortFields[query.sort]]: query.direction === "asc" ? 1 : -1,
      _id: 1,
    };
    const database = await getDatabase();
    const [documents, total] = await Promise.all([
      database
        .collection<EmployeeDocument>("employees")
        .find(filter, {
          projection: {
            tenantId: 0,
            normalizedName: 0,
            linkedUserId: 0,
          },
        })
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .toArray(),
      database.collection<EmployeeDocument>("employees").countDocuments(filter),
    ]);
    return {
      items: documents.map((employee) => ({
        id: employee._id,
        employeeCode: employee.employeeCode,
        name: employee.name,
        workEmail: employee.workEmail ?? "",
        phone: employee.phone ?? "",
        jobTitle: employee.jobTitle,
        department: employee.department ?? "",
        employmentType: employee.employmentType,
        hireDate: employee.hireDate,
        storeIds: employee.storeIds,
        status: employee.status,
        linkedAccountEmail: employee.linkedAccountEmail ?? "",
        version: employee.version,
        createdAt: employee.createdAt.toISOString(),
        updatedAt: employee.updatedAt.toISOString(),
      })),
      total,
    };
  }

  async metrics(context: TenantContext) {
    const match = employeeReadFilter(context);
    const database = await getDatabase();
    const result = await database
      .collection<EmployeeDocument>("employees")
      .aggregate<{
        total: number;
        active: number;
        onLeave: number;
        linked: number;
      }>([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
            onLeave: {
              $sum: { $cond: [{ $eq: ["$status", "on_leave"] }, 1, 0] },
            },
            linked: {
              $sum: {
                $cond: [{ $eq: [{ $type: "$linkedUserId" }, "string"] }, 1, 0],
              },
            },
          },
        },
      ])
      .next();
    return {
      total: result?.total ?? 0,
      active: result?.active ?? 0,
      onLeave: result?.onLeave ?? 0,
      linked: result?.linked ?? 0,
    };
  }

  async referenceData(context: TenantContext): Promise<EmployeeReferenceData> {
    if (
      !hasPermission(context.permissions, "employee:read") &&
      !canReadOwnWorkforce(context)
    )
      requirePermission(context.permissions, "employee:read");
    const database = await getDatabase();
    const [profile, stores, employees] = await Promise.all([
      database
        .collection<{ currency: string }>("tenantProfiles")
        .findOne(
          { tenantId: context.tenantId },
          { projection: { currency: 1 } },
        ),
      database
        .collection<{ _id: string; code: string; name: string }>("stores")
        .find(
          {
            tenantId: context.tenantId,
            _id: { $in: [...context.allowedStoreIds] },
            status: "active",
            deletedAt: { $exists: false },
          },
          { projection: { code: 1, name: 1 } },
        )
        .sort({ name: 1, _id: 1 })
        .limit(100)
        .toArray(),
      database
        .collection<EmployeeDocument>("employees")
        .find(employeeReadFilter(context), {
          projection: { employeeCode: 1, name: 1, version: 1, storeIds: 1 },
        })
        .sort({ normalizedName: 1, _id: 1 })
        .limit(500)
        .toArray(),
    ]);
    if (!profile) throw new Error("Employee workspace profile is unavailable.");
    return {
      currency: profile.currency,
      stores: stores.map((store) => ({
        id: store._id,
        code: store.code,
        name: store.name,
      })),
      employees: employees.map((employee) => ({
        id: employee._id,
        employeeCode: employee.employeeCode,
        name: employee.name,
        version: employee.version,
        storeIds: employee.storeIds,
      })),
    };
  }

  async attendance(context: TenantContext): Promise<AttendanceListItem[]> {
    const database = await getDatabase();
    let employeeFilter: Filter<EmployeeDocument>;
    if (hasPermission(context.permissions, "attendance:read")) {
      employeeFilter = {
        tenantId: context.tenantId,
        storeIds: { $in: [...context.allowedStoreIds] },
      };
    } else {
      requirePermission(context.permissions, "attendance:readOwn");
      employeeFilter = {
        tenantId: context.tenantId,
        linkedUserId: context.userId,
      };
    }
    const employees = await database
      .collection<EmployeeDocument>("employees")
      .find(employeeFilter, { projection: { employeeCode: 1, name: 1 } })
      .limit(500)
      .toArray();
    const employeeMap = new Map(
      employees.map((employee) => [employee._id, employee]),
    );
    const records = await database
      .collection<AttendanceDocument>("attendanceRecords")
      .find(
        {
          tenantId: context.tenantId,
          employeeId: { $in: [...employeeMap.keys()] },
          storeId: { $in: [...context.allowedStoreIds] },
        },
        { projection: { tenantId: 0 } },
      )
      .sort({ workDate: -1, _id: -1 })
      .limit(100)
      .toArray();
    const storeIds = [...new Set(records.map((record) => record.storeId))];
    const stores = await database
      .collection<{ _id: string; name: string }>("stores")
      .find(
        { tenantId: context.tenantId, _id: { $in: storeIds } },
        { projection: { name: 1 } },
      )
      .toArray();
    const storeMap = new Map(stores.map((store) => [store._id, store.name]));
    return records.flatMap((record) => {
      const employee = employeeMap.get(record.employeeId);
      if (!employee) return [];
      return [
        {
          id: record._id,
          employeeId: record.employeeId,
          employeeCode: employee.employeeCode,
          employeeName: employee.name,
          storeId: record.storeId,
          storeName: storeMap.get(record.storeId) ?? "Authorized store",
          workDate: record.workDate,
          clockIn: record.clockIn,
          clockOut: record.clockOut,
          breakMinutes: record.breakMinutes,
          workedMinutes: record.workedMinutes,
          status: record.status,
          note: record.note,
        },
      ];
    });
  }

  async leaveRequests(context: TenantContext): Promise<LeaveListItem[]> {
    const database = await getDatabase();
    let employeeFilter: Filter<EmployeeDocument>;
    if (hasPermission(context.permissions, "attendance:read")) {
      employeeFilter = {
        tenantId: context.tenantId,
        storeIds: { $in: [...context.allowedStoreIds] },
      };
    } else {
      requirePermission(context.permissions, "attendance:readOwn");
      employeeFilter = {
        tenantId: context.tenantId,
        linkedUserId: context.userId,
      };
    }
    const employees = await database
      .collection<EmployeeDocument>("employees")
      .find(employeeFilter, { projection: { employeeCode: 1, name: 1 } })
      .limit(500)
      .toArray();
    const employeeMap = new Map(
      employees.map((employee) => [employee._id, employee]),
    );
    const records = await database
      .collection<LeaveDocument>("leaveRequests")
      .find(
        {
          tenantId: context.tenantId,
          employeeId: { $in: [...employeeMap.keys()] },
        },
        { projection: { tenantId: 0 } },
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .toArray();
    return records.flatMap((record) => {
      const employee = employeeMap.get(record.employeeId);
      if (!employee) return [];
      return [
        {
          id: record._id,
          employeeId: record.employeeId,
          employeeCode: employee.employeeCode,
          employeeName: employee.name,
          type: record.type,
          fromDate: record.fromDate,
          toDate: record.toDate,
          days: record.days,
          reason: record.reason,
          status: record.status,
          decisionNote: record.decisionNote,
          version: record.version,
        },
      ];
    });
  }

  async salaries(context: TenantContext): Promise<SalarySummary[]> {
    requirePermission(context.permissions, "compensation:read");
    const database = await getDatabase();
    const employees = await database
      .collection<EmployeeDocument>("employees")
      .find(
        {
          tenantId: context.tenantId,
          storeIds: { $in: [...context.allowedStoreIds] },
        },
        { projection: { employeeCode: 1, name: 1 } },
      )
      .sort({ normalizedName: 1, _id: 1 })
      .limit(500)
      .toArray();
    const employeeMap = new Map(
      employees.map((employee) => [employee._id, employee]),
    );
    const documents = await database
      .collection<SalaryDocument>("salaryProfiles")
      .find({
        tenantId: context.tenantId,
        employeeId: { $in: [...employeeMap.keys()] },
      })
      .sort({ effectiveDate: -1, createdAt: -1 })
      .limit(2_000)
      .toArray();
    const current = new Map<string, SalaryDocument>();
    for (const salary of documents)
      if (!current.has(salary.employeeId))
        current.set(salary.employeeId, salary);
    return [...current.values()].flatMap((salary) => {
      const employee = employeeMap.get(salary.employeeId);
      if (!employee) return [];
      return [
        {
          employeeId: salary.employeeId,
          employeeCode: employee.employeeCode,
          employeeName: employee.name,
          compensationType: salary.compensationType,
          baseAmountMinor: salary.baseAmountMinor,
          allowanceMinor: salary.allowanceMinor,
          deductionMinor: salary.deductionMinor,
          overtimeRateMinor: salary.overtimeRateMinor,
          effectiveDate: salary.effectiveDate,
          paySchedule: salary.paySchedule,
        },
      ];
    });
  }

  async payrollRuns(context: TenantContext): Promise<PayrollRunListItem[]> {
    requirePermission(context.permissions, "payroll:read");
    const database = await getDatabase();
    const runs = await database
      .collection<PayrollRunDocument>("payrollRuns")
      .find(
        {
          tenantId: context.tenantId,
          $or: [
            { storeId: { $in: [...context.allowedStoreIds] } },
            { storeId: null, createdBy: context.userId },
          ],
        },
        {
          projection: { tenantId: 0, requestFingerprint: 0, idempotencyKey: 0 },
        },
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .toArray();
    const storeIds = runs.flatMap((run) => (run.storeId ? [run.storeId] : []));
    const stores = await database
      .collection<{ _id: string; name: string }>("stores")
      .find(
        { tenantId: context.tenantId, _id: { $in: storeIds } },
        { projection: { name: 1 } },
      )
      .toArray();
    const storeMap = new Map(stores.map((store) => [store._id, store.name]));
    return runs.map((run) => ({
      id: run._id,
      runNumber: run.runNumber,
      storeId: run.storeId,
      storeName: run.storeId
        ? (storeMap.get(run.storeId) ?? "Authorized store")
        : "All stores",
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      payDate: run.payDate,
      currency: run.currency,
      status: run.status,
      employeeCount: run.employeeCount,
      grossMinor: run.grossMinor,
      deductionMinor: run.deductionMinor,
      netMinor: run.netMinor,
      version: run.version,
      finalizedAt: run.finalizedAt?.toISOString() ?? "",
    }));
  }

  async payslips(context: TenantContext): Promise<PayslipListItem[]> {
    const database = await getDatabase();
    let employeeIds: string[];
    if (hasPermission(context.permissions, "payroll:read")) {
      employeeIds = (
        await database
          .collection<EmployeeDocument>("employees")
          .find(
            {
              tenantId: context.tenantId,
              storeIds: { $in: [...context.allowedStoreIds] },
            },
            { projection: { _id: 1 } },
          )
          .limit(500)
          .toArray()
      ).map((employee) => employee._id);
    } else {
      requirePermission(context.permissions, "payroll:readOwn");
      employeeIds = (
        await database
          .collection<EmployeeDocument>("employees")
          .find(
            { tenantId: context.tenantId, linkedUserId: context.userId },
            { projection: { _id: 1 } },
          )
          .limit(1)
          .toArray()
      ).map((employee) => employee._id);
    }
    const payslips = await database
      .collection<PayslipDocument>("payslips")
      .find(
        {
          tenantId: context.tenantId,
          employeeId: { $in: employeeIds },
          status: { $ne: "reversed" },
        },
        { projection: { tenantId: 0 } },
      )
      .sort({ finalizedAt: -1, _id: -1 })
      .limit(100)
      .toArray();
    return payslips.map((payslip) => ({
      id: payslip._id,
      payrollRunId: payslip.payrollRunId,
      runNumber: payslip.runNumber,
      employeeId: payslip.employeeId,
      employeeCode: payslip.employeeCode,
      employeeName: payslip.employeeName,
      periodStart: payslip.periodStart,
      periodEnd: payslip.periodEnd,
      payDate: payslip.payDate,
      currency: payslip.currency,
      baseMinor: payslip.baseMinor,
      allowanceMinor: payslip.allowanceMinor,
      overtimeMinor: payslip.overtimeMinor,
      deductionMinor: payslip.deductionMinor,
      netMinor: payslip.netMinor,
      finalizedAt: payslip.finalizedAt.toISOString(),
    }));
  }
}
