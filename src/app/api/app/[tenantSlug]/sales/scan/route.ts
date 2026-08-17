import type { NextRequest } from "next/server";
import { z } from "zod";
import { PermissionError } from "@/modules/permissions/permissions";
import { saleScanQuerySchema } from "@/modules/sales/schemas";
import { logger } from "@/server/logging/logger";
import { SaleRepository } from "@/server/repositories/sales";
import { TenantNotFoundError } from "@/server/tenancy/context";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  try {
    const { code } = saleScanQuerySchema.parse({
      code: request.nextUrl.searchParams.get("code"),
    });
    const context = await requireTenantContext(tenantSlug);
    const item = await new SaleRepository().scan(context, code);
    if (!item)
      return Response.json(
        {
          ok: false,
          message:
            "No active product with that barcode or SKU is available at this store.",
        },
        { status: 404 },
      );
    return Response.json(
      { ok: true, item },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          ok: false,
          message: error.issues[0]?.message ?? "Scan a valid barcode.",
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
        { ok: false, message: "Sale workspace not found." },
        { status: 404 },
      );
    logger.warn({ event: "sale_barcode_scan_failed", tenantSlug, err: error });
    return Response.json(
      { ok: false, message: "The barcode could not be scanned right now." },
      { status: 500 },
    );
  }
}
