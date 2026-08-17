import { BadgeCheck, CalendarClock, IdCard, Link2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  EmployeeManagement,
  NewEmployeeDialog,
} from "@/components/employees/employee-management";
import { WorkforceNav } from "@/components/employees/workforce-nav";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionDenied } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
    <PageContainer>
      <WorkforceNav tenantSlug={tenantSlug} current="/employees" />
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo data" : "Live tenant data"}
        detail="General employee records exclude compensation values"
      />
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
              <Input
                name="q"
                defaultValue={query.q}
                placeholder="Search employees, codes, roles…"
              />
              <Select name="status" defaultValue={query.status}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="on_leave">On leave</option>
                <option value="terminated">Terminated</option>
                <option value="archived">Archived</option>
              </Select>
              <Select name="store" defaultValue={query.store}>
                <option value="all">All stores</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </Select>
              <Button type="submit">Apply filters</Button>
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
    </PageContainer>
  );
}
