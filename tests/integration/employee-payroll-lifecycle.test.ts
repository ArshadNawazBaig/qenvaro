import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { employeeListQuerySchema } from "@/modules/employees/schemas";
import {
  EmployeeNotFoundError,
  EmployeeService,
  PayrollService,
  WorkforceService,
} from "@/modules/employees/service";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import { EmployeeRepository } from "@/server/repositories/employees";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("employee and operational payroll lifecycle", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_employee_${suffix}`;
  const otherTenantId = `org_employee_other_${suffix}`;
  const storeId = `store_employee_${suffix}`;
  const otherStoreId = `store_employee_other_${suffix}`;
  const userId = `usr_employee_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  let employeeId: string;
  let payrollRunId: string;

  const ownerContext: TenantContext = {
    tenantId,
    tenantSlug: `employee-${suffix}`,
    userId: `owner_employee_${suffix}`,
    sessionId: `session_employee_${suffix}`,
    membershipId: `member_employee_${suffix}`,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([storeId]),
    activeStoreId: storeId,
    requestId: `request_employee_${suffix}`,
  };
  const fields = {
    name: "Mina Rahman",
    workEmail: "mina.private@example.test",
    phone: "+92 300 111 2233",
    jobTitle: "Operations specialist",
    department: "People operations",
    employmentType: "full_time" as const,
    hireDate: "2026-01-10",
    storeIds: [storeId],
  };

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringIdDocument>("tenantProfiles").insertMany([
      {
        _id: `profile_employee_${suffix}`,
        tenantId,
        slug: ownerContext.tenantSlug,
        businessName: "Employee Integration",
        currency: "PKR",
        locale: "en-PK",
        timezone: "Asia/Karachi",
        planKey: "growth",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `profile_employee_other_${suffix}`,
        tenantId: otherTenantId,
        slug: `employee-other-${suffix}`,
        businessName: "Other Employee Integration",
        currency: "PKR",
        locale: "en-PK",
        timezone: "Asia/Karachi",
        planKey: "starter",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringIdDocument>("stores").insertMany([
      {
        _id: storeId,
        tenantId,
        code: "MAIN",
        name: "Main Store",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: otherStoreId,
        tenantId: otherTenantId,
        code: "MAIN",
        name: "Other Store",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  afterAll(async () => {
    for (const collection of [
      "attendanceRecords",
      "auditLogs",
      "employees",
      "leaveRequests",
      "payrollItems",
      "payrollRuns",
      "payslips",
      "salaryProfiles",
      "sequenceCounters",
      "stores",
      "tenantProfiles",
    ])
      await database.collection(collection).deleteMany({
        tenantId: { $in: [tenantId, otherTenantId] },
      });
    await client.close();
  });

  it("creates a scoped employee without exposing compensation", async () => {
    const service = new EmployeeService();
    const created = await service.create(ownerContext, fields);
    employeeId = created.id;
    expect(created.employeeCode).toMatch(/^E-[A-Z0-9_-]{8}$/);

    const repository = new EmployeeRepository();
    const directory = await repository.list(
      ownerContext,
      employeeListQuerySchema.parse({ q: "Mina" }),
    );
    expect(directory).toMatchObject({ total: 1 });
    expect(directory.items[0]).toMatchObject({
      id: employeeId,
      name: "Mina Rahman",
      storeIds: [storeId],
      status: "active",
    });
    expect(JSON.stringify(directory)).not.toContain("baseAmountMinor");

    await expect(
      service.create(
        {
          ...ownerContext,
          roles: ["VIEWER"],
          permissions: resolvePermissions(["VIEWER"]),
        },
        { ...fields, name: "Unauthorized Employee" },
      ),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      service.update(ownerContext, {
        ...fields,
        employeeId: `emp_other_${suffix}`,
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundError);
  });

  it("records attendance and decides leave only inside authorized stores", async () => {
    const workforce = new WorkforceService();
    await workforce.recordAttendance(ownerContext, {
      employeeId,
      storeId,
      workDate: "2026-08-01",
      clockIn: "2026-08-01T04:00:00.000Z",
      clockOut: "2026-08-01T14:00:00.000Z",
      breakMinutes: 60,
      status: "present",
      note: "Private attendance note",
    });
    const leave = await workforce.createLeave(ownerContext, {
      employeeId,
      type: "annual",
      fromDate: "2026-08-20",
      toDate: "2026-08-22",
      reason: "Private leave reason",
    });
    await expect(
      workforce.decideLeave(ownerContext, {
        leaveRequestId: leave.id,
        expectedVersion: 1,
        decision: "approved",
        note: "Coverage arranged",
      }),
    ).resolves.toEqual({ version: 2 });

    const repository = new EmployeeRepository();
    const [attendance, leaves] = await Promise.all([
      repository.attendance(ownerContext),
      repository.leaveRequests(ownerContext),
    ]);
    expect(attendance[0]).toMatchObject({ workedMinutes: 540, storeId });
    expect(leaves[0]).toMatchObject({ status: "approved", days: 3 });

    await expect(
      workforce.recordAttendance(ownerContext, {
        employeeId,
        storeId: otherStoreId,
        workDate: "2026-08-02",
        clockIn: "",
        clockOut: "",
        breakMinutes: 0,
        status: "absent",
        note: "",
      }),
    ).rejects.toBeDefined();
  });

  it("keeps compensation restricted and finalizes immutable payslips", async () => {
    const payroll = new PayrollService();
    await payroll.setSalaryProfile(ownerContext, {
      employeeId,
      compensationType: "monthly",
      baseAmountMinor: 200_000,
      allowanceMinor: 25_000,
      deductionMinor: 10_000,
      overtimeRateMinor: 1_500,
      effectiveDate: "2026-01-01",
      paySchedule: "monthly",
      expectedEmployeeVersion: 1,
    });
    await expect(
      new EmployeeRepository().salaries({
        ...ownerContext,
        roles: ["MANAGER"],
        permissions: resolvePermissions(["MANAGER"]),
      }),
    ).rejects.toBeInstanceOf(PermissionError);

    const prepared = await payroll.prepare(ownerContext, {
      storeId,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      payDate: "2026-09-01",
      idempotencyKey: crypto.randomUUID(),
    });
    payrollRunId = prepared.id;
    await payroll.transition(ownerContext, {
      payrollRunId,
      expectedVersion: 1,
      targetStatus: "review",
      reason: "",
    });
    await payroll.transition(ownerContext, {
      payrollRunId,
      expectedVersion: 2,
      targetStatus: "approved",
      reason: "",
    });
    await payroll.transition(ownerContext, {
      payrollRunId,
      expectedVersion: 3,
      targetStatus: "finalized",
      reason: "",
    });

    const [run, payslip, salaryAudit] = await Promise.all([
      database
        .collection<StringIdDocument>("payrollRuns")
        .findOne({ _id: payrollRunId, tenantId }),
      database
        .collection<StringIdDocument>("payslips")
        .findOne({ payrollRunId, tenantId }),
      database
        .collection<StringIdDocument>("auditLogs")
        .findOne({ tenantId, action: "compensation.profile_created" }),
    ]);
    expect(run).toMatchObject({ status: "finalized", employeeCount: 1 });
    expect(payslip).toMatchObject({ employeeId, netMinor: 216_500 });
    const auditJson = JSON.stringify(salaryAudit);
    expect(auditJson).not.toContain("200000");
    expect(auditJson).not.toContain("mina.private@example.test");

    await payroll.transition(ownerContext, {
      payrollRunId,
      expectedVersion: 4,
      targetStatus: "reversed",
      reason: "Correction required",
    });
    await expect(
      database.collection("payslips").findOne({ tenantId, payrollRunId }),
    ).resolves.toMatchObject({ status: "reversed" });
  });

  it("supports employee-only payslip reads and migration-backed indexes", async () => {
    await database
      .collection<StringIdDocument>("employees")
      .updateOne(
        { _id: employeeId, tenantId },
        { $set: { linkedUserId: userId } },
      );
    const employeeContext: TenantContext = {
      ...ownerContext,
      userId,
      roles: ["EMPLOYEE"],
      permissions: resolvePermissions(["EMPLOYEE"]),
    };
    const own = await new EmployeeRepository().payslips(employeeContext);
    expect(own).toHaveLength(0);
    expect(
      (await database.collection("employees").indexes()).map(
        (index) => index.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "tenant_employee_code_unique",
        "tenant_employee_linked_user_unique",
        "tenant_store_employee_directory",
      ]),
    );
    expect(
      (await database.collection("payrollRuns").indexes()).map(
        (index) => index.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "tenant_payroll_number_unique",
        "tenant_payroll_idempotency_unique",
        "tenant_store_payroll_runs",
      ]),
    );
  });
});
