import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  LeaveManagement,
  NewLeaveDialog,
} from "@/components/employees/leave-management";
import { WorkforceNav } from "@/components/employees/workforce-nav";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionDenied } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { env } from "@/config/env";
import {
  demoEmployees,
  demoEmployeeStores,
  demoLeaveRequests,
} from "@/modules/employees/demo-data";
import { hasPermission } from "@/modules/permissions/permissions";
import {
  EmployeeRepository,
  type EmployeeReferenceData,
} from "@/server/repositories/employees";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Leave" };

export default async function LeavePage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  let items = demoLeaveRequests;
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
  let canCreate = false;
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
          repository.leaveRequests(context),
          repository.referenceData(context),
        ]);
        canCreate =
          hasPermission(context.permissions, "attendance:manage") ||
          hasPermission(context.permissions, "attendance:createOwn");
        canManage = hasPermission(context.permissions, "attendance:manage");
      }
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }
  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 p-4 sm:p-6 lg:p-8">
      <WorkforceNav tenantSlug={tenantSlug} current="/leave" />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isDemo ? "warning" : "success"}>
          {isDemo ? "Demo data" : "Live tenant data"}
        </Badge>
        <span className="text-muted-foreground text-xs">
          Calendar-day operational leave tracking
        </span>
      </div>
      <PageHeader
        eyebrow="People"
        title="Leave"
        description="Create, review, and retain employee leave decisions without assuming jurisdiction-specific entitlement rules."
        actions={
          <NewLeaveDialog
            tenantSlug={tenantSlug}
            reference={reference}
            disabled={
              isDemo || denied || !canCreate || reference.employees.length === 0
            }
          />
        }
      />
      {denied ? (
        <PermissionDenied />
      ) : (
        <Card>
          <LeaveManagement
            tenantSlug={tenantSlug}
            items={items}
            canManage={canManage}
            isDemo={isDemo}
          />
        </Card>
      )}
    </div>
  );
}
