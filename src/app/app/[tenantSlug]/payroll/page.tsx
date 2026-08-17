import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  PayrollManagement,
  PreparePayrollDialog,
  SalaryProfileDialog,
} from "@/components/employees/payroll-management";
import { WorkforceNav } from "@/components/employees/workforce-nav";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionDenied } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { env } from "@/config/env";
import {
  demoEmployees,
  demoEmployeeStores,
  demoPayrollRuns,
  demoPayslips,
  demoSalaries,
} from "@/modules/employees/demo-data";
import { hasPermission } from "@/modules/permissions/permissions";
import {
  EmployeeRepository,
  type EmployeeReferenceData,
} from "@/server/repositories/employees";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  let runs = demoPayrollRuns;
  let salaries = demoSalaries;
  let payslips = demoPayslips;
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
  let canManageSalary = false;
  let permissions = {
    canPrepare: false,
    canApprove: false,
    canFinalize: false,
  };
  let allowAllStores = false;
  if (tenantSlug !== "demo" && env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      isDemo = false;
      const canReadPayroll = hasPermission(context.permissions, "payroll:read");
      const canReadOwn = hasPermission(context.permissions, "payroll:readOwn");
      if (!canReadPayroll && !canReadOwn) denied = true;
      else {
        const repository = new EmployeeRepository();
        reference = await repository.referenceData(context);
        payslips = await repository.payslips(context);
        runs = canReadPayroll ? await repository.payrollRuns(context) : [];
        salaries = hasPermission(context.permissions, "compensation:read")
          ? await repository.salaries(context)
          : [];
        canManageSalary = hasPermission(
          context.permissions,
          "compensation:manage",
        );
        permissions = {
          canPrepare: hasPermission(context.permissions, "payroll:prepare"),
          canApprove: hasPermission(context.permissions, "payroll:approve"),
          canFinalize: hasPermission(context.permissions, "payroll:finalize"),
        };
        allowAllStores = context.roles.some(
          (role) => role === "OWNER" || role === "ADMIN",
        );
      }
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }
  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 p-4 sm:p-6 lg:p-8">
      <WorkforceNav tenantSlug={tenantSlug} current="/payroll" />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isDemo ? "warning" : "success"}>
          {isDemo ? "Demo data" : "Live tenant data"}
        </Badge>
        <span className="text-muted-foreground text-xs">
          Compensation access is separately permission-gated
        </span>
      </div>
      <PageHeader
        eyebrow="People"
        title="Payroll"
        description="Prepare, approve, finalize, reverse, and review operational payroll with immutable finalized payslips."
        actions={
          <>
            <SalaryProfileDialog
              tenantSlug={tenantSlug}
              reference={reference}
              disabled={
                isDemo ||
                denied ||
                !canManageSalary ||
                reference.employees.length === 0
              }
            />
            <PreparePayrollDialog
              tenantSlug={tenantSlug}
              reference={reference}
              disabled={
                isDemo ||
                denied ||
                !permissions.canPrepare ||
                reference.employees.length === 0
              }
              allowAllStores={allowAllStores}
            />
          </>
        }
      />
      {denied ? (
        <PermissionDenied />
      ) : (
        <PayrollManagement
          tenantSlug={tenantSlug}
          runs={runs}
          salaries={salaries}
          payslips={payslips}
          currency={reference.currency}
          permissions={permissions}
          isDemo={isDemo}
        />
      )}
    </div>
  );
}
