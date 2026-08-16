import type { NextRequest } from "next/server";
import { MAX_PRODUCT_CSV_BYTES } from "@/modules/products/csv";
import { ProductCsvService } from "@/modules/products/csv-service";
import { hasTrustedMutationOrigin } from "@/server/http/request-security";
import { logger } from "@/server/logging/logger";
import { requireTenantContext } from "@/server/tenancy/resolve-context";
import { csvJsonError, productCsvErrorResponse } from "../errors";

export const runtime = "nodejs";

const MAX_MULTIPART_BYTES = MAX_PRODUCT_CSV_BYTES + 256 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return csvJsonError("Invalid request origin.", 403);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES)
    return csvJsonError("Choose a CSV file smaller than 2 MB.", 413);
  const { tenantSlug } = await params;
  try {
    const context = await requireTenantContext(tenantSlug);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0)
      return csvJsonError("Choose a CSV file to preview.", 400);
    if (file.size > MAX_PRODUCT_CSV_BYTES)
      return csvJsonError("Choose a CSV file smaller than 2 MB.", 413);
    if (!file.name.toLowerCase().endsWith(".csv"))
      return csvJsonError("Choose a file with the .csv extension.", 415);
    let csvText: string;
    try {
      csvText = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
    } catch {
      return csvJsonError("The CSV file must use UTF-8 text encoding.", 400);
    }
    const preview = await new ProductCsvService().createPreview(
      context,
      csvText,
    );
    return Response.json({ ok: true, preview });
  } catch (error) {
    logger.warn({
      event: "product_csv_preview_failed",
      tenantSlug,
      err: error,
    });
    return productCsvErrorResponse(error);
  }
}
