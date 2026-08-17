import { PermissionError } from "@/modules/permissions/permissions";
import { OperationsReportExportService } from "@/modules/reports/operations-export-service";
import { operationsReportQuerySchema } from "@/modules/reports/operations-schemas";
import { logger } from "@/server/logging/logger";
import { TenantNotFoundError } from "@/server/tenancy/context";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  try {
    const url = new URL(request.url);
    const query = operationsReportQuerySchema.parse({
      range: url.searchParams.get("range"),
      store: url.searchParams.get("store"),
    });
    const context = await requireTenantContext(tenantSlug);
    const result = await new OperationsReportExportService().export(
      context,
      query,
    );
    return new Response(`\uFEFF${result.csv}`, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="operations-report-${query.range}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Qenvaro-Row-Count": String(result.rowCount),
      },
    });
  } catch (error) {
    logger.warn({
      event: "operations_report_export_failed",
      tenantSlug,
      err: error,
    });
    if (error instanceof PermissionError)
      return Response.json(
        { ok: false, message: error.message },
        { status: 403 },
      );
    if (error instanceof TenantNotFoundError)
      return Response.json(
        { ok: false, message: "Operations report not found." },
        { status: 404 },
      );
    return Response.json(
      {
        ok: false,
        message: "The operations report export could not be completed.",
      },
      { status: 500 },
    );
  }
}
