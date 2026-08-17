import "server-only";

import { createOpaqueId } from "@/lib/utils";
import { requirePermission } from "@/modules/permissions/permissions";
import { rowsToCsv } from "@/modules/products/csv";
import type { OperationsReportQuery } from "@/modules/reports/operations-schemas";
import { getDatabase } from "@/server/db/client";
import { PurchasingRepository } from "@/server/repositories/purchasing";
import type { TenantContext } from "@/server/tenancy/context";

type StringIdDocument = { _id: string } & Record<string, unknown>;

export class OperationsReportExportService {
  async export(
    context: TenantContext,
    query: OperationsReportQuery = { range: "90d", store: "all" },
    now = new Date(),
  ): Promise<{ csv: string; rowCount: number }> {
    requirePermission(context.permissions, "report:export");
    const summary = await new PurchasingRepository().operationsSummary(
      context,
      query,
      now,
    );
    const rows: Array<Array<string | number | null>> = [
      ["row_type", "label", "amount", "currency", "record_count"],
      [
        "summary",
        "Approved expenses",
        (summary.approvedExpenseMinor / 100).toFixed(2),
        summary.currency,
        summary.expenseCount,
      ],
      [
        "summary",
        "Pending approval",
        (summary.submittedExpenseMinor / 100).toFixed(2),
        summary.currency,
        null,
      ],
      [
        "summary",
        "Received purchases",
        (summary.receivedPurchaseMinor / 100).toFixed(2),
        summary.currency,
        summary.receiptCount,
      ],
      [
        "summary",
        "Open commitments",
        (summary.openPurchaseMinor / 100).toFixed(2),
        summary.currency,
        null,
      ],
      ...summary.expenseCategories.map((category) => [
        "approved_expense_category",
        category.name,
        (category.amountMinor / 100).toFixed(2),
        summary.currency,
        null,
      ]),
    ];
    const rowCount = rows.length - 1;
    const jobId = createOpaqueId("exp");
    const database = await getDatabase();
    await database.collection<StringIdDocument>("importExportJobs").insertOne({
      _id: jobId,
      tenantId: context.tenantId,
      type: "operations_report_csv_export",
      status: "completed",
      rowCount,
      filters: { range: query.range, store: query.store },
      createdAt: now,
      createdBy: context.userId,
      completedAt: now,
      updatedAt: now,
      updatedBy: context.userId,
    });
    await database.collection<StringIdDocument>("auditLogs").insertOne({
      _id: createOpaqueId("aud"),
      tenantId: context.tenantId,
      actorId: context.userId,
      action: "report.operations_csv_export.completed",
      entityType: "import_export_job",
      entityId: jobId,
      requestId: context.requestId,
      summary: "Exported the store-scoped operations report as CSV.",
      changes: { range: query.range, store: query.store, rowCount },
      createdAt: now,
    });
    return { csv: rowsToCsv(rows), rowCount };
  }
}
