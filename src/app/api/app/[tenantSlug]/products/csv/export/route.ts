import type { NextRequest } from "next/server";
import { productListQuerySchema } from "@/modules/products/schemas";
import { ProductCsvService } from "@/modules/products/csv-service";
import { logger } from "@/server/logging/logger";
import { requireTenantContext } from "@/server/tenancy/resolve-context";
import { productCsvErrorResponse } from "../errors";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  try {
    const context = await requireTenantContext(tenantSlug);
    const query = productListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const result = await new ProductCsvService().export(context, query);
    return new Response(`\uFEFF${result.csv}`, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'attachment; filename="products.csv"',
        "Content-Type": "text/csv; charset=utf-8",
        "X-Qenvaro-Row-Count": String(result.rowCount),
      },
    });
  } catch (error) {
    logger.warn({
      event: "product_csv_export_failed",
      tenantSlug,
      err: error,
    });
    return productCsvErrorResponse(error);
  }
}
