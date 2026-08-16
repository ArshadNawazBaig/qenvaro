import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { ProductCsvService } from "@/modules/products/csv-service";
import {
  hasTrustedMutationOrigin,
  readBoundedJson,
} from "@/server/http/request-security";
import { logger } from "@/server/logging/logger";
import { requireTenantContext } from "@/server/tenancy/resolve-context";
import { csvJsonError, productCsvErrorResponse } from "../errors";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return csvJsonError("Invalid request origin.", 403);
  const { tenantSlug } = await params;
  try {
    const context = await requireTenantContext(tenantSlug);
    const result = await new ProductCsvService().commitImport(
      context,
      await readBoundedJson(request),
    );
    revalidatePath(`/app/${context.tenantSlug}/products`);
    return Response.json({ ok: true, result });
  } catch (error) {
    logger.warn({
      event: "product_csv_import_failed",
      tenantSlug,
      err: error,
    });
    return productCsvErrorResponse(error);
  }
}
