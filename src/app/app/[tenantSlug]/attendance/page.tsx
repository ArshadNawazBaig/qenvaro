import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AttendanceManagement,
  RecordAttendanceDialog,
} from "@/components/employees/attendance-management";
import { WorkforceNav } from "@/components/employees/workforce-nav";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionDenied } from "@/components/shared/states";
import { Card } from "@/components/ui/card";
import { env } from "@/config/env";
import {
  demoAttendance,
  demoEmployees,
  demoEmployeeStores,
} from "@/modules/employees/demo-data";
import { hasPermission } from "@/modules/permissions/permissions";
import {
  EmployeeRepository,
  type EmployeeReferenceData,
} from "@/server/repositories/employees";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  let items = demoAttendance;
  let reference: EmployeeReferenceData = {
    currency: "PKR",
    stores: demoEmployeeStores,
    employees: demoEmployees.map((employee) => ({
      id: employee.id,
      employeeCode: employee.employeeCode,
      name: employee.name,
      version: employee.version,
      storeIds: employee.storeIds,
    })),
  };
  let isDemo = true;
  let denied = false;
  let canManage = false;
  if (tenantSlug !== "demo" && env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      isDemo = false;
      if (
        !hasPermission(context.permissions, "attendance:read") &&
        !hasPermission(context.permissions, "attendance:readOwn")
      )
        denied = true;
      else {
        const repository = new EmployeeRepository();
        [items, reference] = await Promise.all([
          repository.attendance(context),
          repository.referenceData(context),
        ]);
        canManage =
          hasPermission(context.permissions, "attendance:manage") ||
          hasPermission(context.permissions, "attendance:createOwn");
      }
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }
  return (
    <PageContainer>
      <WorkforceNav tenantSlug={tenantSlug} current="/attendance" />
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo data" : "Live tenant data"}
        detail="Most recent 100 authorized records"
      />
      <PageHeader
        eyebrow="People"
        title="Attendance"
        description="Record daily presence and worked time for employees assigned to your authorized stores."
        actions={
          <RecordAttendanceDialog
            tenantSlug={tenantSlug}
            reference={reference}
            disabled={
              isDemo || denied || !canManage || reference.employees.length === 0
            }
          />
        }
      />
      {denied ? (
        <PermissionDenied />
      ) : (
        <Card>
          <AttendanceManagement items={items} />
        </Card>
      )}
    </PageContainer>
  );
}
