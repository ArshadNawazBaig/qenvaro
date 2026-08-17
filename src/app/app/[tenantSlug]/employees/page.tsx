import { BadgeCheck, CalendarClock, IdCard, Link2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  EmployeeManagement,
  NewEmployeeDialog,
} from "@/components/employees/employee-management";
import { WorkforceNav } from "@/components/employees/workforce-nav";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionDenied } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { env } from "@/config/env";
import {
  demoEmployees,
  demoEmployeeStores,
} from "@/modules/employees/demo-data";
import { employeeListQuerySchema } from "@/modules/employees/schemas";
import { hasPermission } from "@/modules/permissions/permissions";
import { EmployeeRepository } from "@/server/repositories/employees";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Employees" };

export default async function EmployeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const query = employeeListQuerySchema.parse(await searchParams);
  let items = demoEmployees.filter(
    (employee) => query.status === "all" || employee.status === query.status,
  );
  if (query.q) {
    const q = query.q.toLowerCase();
    items = items.filter((employee) =>
      [
        employee.name,
        employee.employeeCode,
        employee.jobTitle,
        employee.department,
      ].some((value) => value.toLowerCase().includes(q)),
    );
  }
  let result = { items, total: items.length };
  let metrics = {
    total: demoEmployees.length,
    active: demoEmployees.filter((employee) => employee.status === "active")
      .length,
    onLeave: demoEmployees.filter((employee) => employee.status === "on_leave")
      .length,
    linked: demoEmployees.filter((employee) => employee.linkedAccountEmail)
      .length,
  };
  let stores = demoEmployeeStores;
  let isDemo = true;
  let denied = false;
  let canCreate = false;
  let canUpdate = false;
  let canArchive = false;
  if (tenantSlug !== "demo" && env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      isDemo = false;
      if (
        !hasPermission(context.permissions, "employee:read") &&
        !hasPermission(context.permissions, "employee:readOwn")
      ) {
        denied = true;
      } else {
        const repository = new EmployeeRepository();
        const reference = await repository.referenceData(context);
        [result, metrics] = await Promise.all([
          repository.list(context, query),
          repository.metrics(context),
        ]);
        stores = reference.stores;
        canCreate = hasPermission(context.permissions, "employee:create");
        canUpdate = hasPermission(context.permissions, "employee:update");
        canArchive = hasPermission(context.permissions, "employee:archive");
      }
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }
  const pageCount = Math.max(1, Math.ceil(result.total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 p-4 sm:p-6 lg:p-8">
      <WorkforceNav tenantSlug={tenantSlug} current="/employees" />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isDemo ? "warning" : "success"}>
          {isDemo ? "Demo data" : "Live tenant data"}
        </Badge>
        <span className="text-muted-foreground text-xs">
          General employee records exclude compensation values
        </span>
      </div>
      <PageHeader
        eyebrow="People"
        title="Employees"
        description="Manage employment identity, store assignments, lifecycle state, and optional workspace-account linking."
        actions={
          <NewEmployeeDialog
            tenantSlug={tenantSlug}
            stores={stores}
            disabled={isDemo || denied || !canCreate || stores.length === 0}
          />
        }
      />
      {!denied && (
        <section
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Employee summary"
        >
          <MetricCard
            label="Employees"
            value={metrics.total.toLocaleString()}
            detail="In your authorized stores"
            icon={IdCard}
          />
          <MetricCard
            label="Active"
            value={metrics.active.toLocaleString()}
            detail="Available for scheduling"
            icon={BadgeCheck}
            tone="success"
          />
          <MetricCard
            label="On leave"
            value={metrics.onLeave.toLocaleString()}
            detail="Current lifecycle state"
            icon={CalendarClock}
            tone="warning"
          />
          <MetricCard
            label="Accounts linked"
            value={metrics.linked.toLocaleString()}
            detail="Own-service access enabled"
            icon={Link2}
          />
        </section>
      )}
      {denied ? (
        <PermissionDenied />
      ) : (
        <Card>
          <CardContent className="border-b p-4">
            <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
              <input
                name="q"
                defaultValue={query.q}
                placeholder="Search employees, codes, roles…"
                className="border-input bg-card focus-visible:ring-ring min-h-10 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
              />
              <select
                name="status"
                defaultValue={query.status}
                className="border-input bg-card min-h-10 rounded-lg border px-3 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="on_leave">On leave</option>
                <option value="terminated">Terminated</option>
                <option value="archived">Archived</option>
              </select>
              <select
                name="store"
                defaultValue={query.store}
                className="border-input bg-card min-h-10 rounded-lg border px-3 text-sm"
              >
                <option value="all">All stores</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
              <button className="bg-primary text-primary-foreground min-h-10 rounded-lg px-4 text-sm font-medium">
                Apply filters
              </button>
            </form>
          </CardContent>
          <EmployeeManagement
            tenantSlug={tenantSlug}
            items={result.items}
            stores={stores}
            page={page}
            pageCount={pageCount}
            total={result.total}
            canUpdate={canUpdate}
            canArchive={canArchive}
            isDemo={isDemo}
          />
        </Card>
      )}
    </div>
  );
}
