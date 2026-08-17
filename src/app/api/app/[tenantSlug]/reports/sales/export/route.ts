import type { NextRequest } from "next/server";
import { z } from "zod";
import { PermissionError } from "@/modules/permissions/permissions";
import { SalesReportExportService } from "@/modules/reports/sales-export-service";
import { salesReportQuerySchema } from "@/modules/reports/sales-schemas";
import { logger } from "@/server/logging/logger";
import { TenantNotFoundError } from "@/server/tenancy/context";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  try {
    const context = await requireTenantContext(tenantSlug);
    const query = salesReportQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const result = await new SalesReportExportService().export(context, query);
    return new Response(`\uFEFF${result.csv}`, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="sales-report-${query.range}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Qenvaro-Row-Count": String(result.rowCount),
      },
    });
  } catch (error) {
    logger.warn({
      event: "sales_report_export_failed",
      tenantSlug,
      err: error,
    });
    if (error instanceof z.ZodError)
      return Response.json(
        {
          ok: false,
          message: error.issues[0]?.message ?? "Check the report filters.",
        },
        { status: 400 },
      );
    if (error instanceof PermissionError)
      return Response.json(
        { ok: false, message: error.message },
        { status: 403 },
      );
    if (error instanceof TenantNotFoundError)
      return Response.json(
        { ok: false, message: "Sales report not found." },
        { status: 404 },
      );
    return Response.json(
      { ok: false, message: "The sales report export could not be completed." },
      { status: 500 },
    );
  }
}
