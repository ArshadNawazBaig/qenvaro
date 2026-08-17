import "server-only";

import { createOpaqueId } from "@/lib/utils";
import { requirePermission } from "@/modules/permissions/permissions";
import { buildSalesReportCsv } from "@/modules/reports/sales-export";
import type { SalesReportQuery } from "@/modules/reports/sales-schemas";
import { getDatabase } from "@/server/db/client";
import { SalesReportRepository } from "@/server/repositories/sales-reports";
import type { TenantContext } from "@/server/tenancy/context";

type StringIdDocument = { _id: string } & Record<string, unknown>;

export class SalesReportExportService {
  async export(
    context: TenantContext,
    query: SalesReportQuery,
    now = new Date(),
  ): Promise<{ csv: string; rowCount: number }> {
    requirePermission(context.permissions, "report:export");
    const report = await new SalesReportRepository().overview(
      context,
      { ...query, page: 1 },
      now,
    );
    const result = buildSalesReportCsv(report);
    const database = await getDatabase();
    const jobId = createOpaqueId("exp");
    await Promise.all([
      database.collection<StringIdDocument>("importExportJobs").insertOne({
        _id: jobId,
        tenantId: context.tenantId,
        type: "sales_report_csv_export",
        status: "completed",
        rowCount: result.rowCount,
        filters: { range: query.range, store: query.store },
        createdAt: now,
        createdBy: context.userId,
        completedAt: now,
        updatedAt: now,
        updatedBy: context.userId,
      }),
      database.collection<StringIdDocument>("auditLogs").insertOne({
        _id: createOpaqueId("aud"),
        tenantId: context.tenantId,
        actorId: context.userId,
        action: "report.sales_csv_export.completed",
        entityType: "import_export_job",
        entityId: jobId,
        requestId: context.requestId,
        summary: "Exported the store-scoped sales report as CSV.",
        changes: {
          range: query.range,
          store: query.store,
          rowCount: result.rowCount,
        },
        createdAt: now,
      }),
    ]);
    return result;
  }
}
