import { z } from "zod";
import { PlanLimitError } from "@/config/plans";
import { BillingAccessError } from "@/modules/billing/entitlements";
import { PermissionError } from "@/modules/permissions/permissions";
import { CsvParseError } from "@/modules/products/csv";
import {
  ProductCsvExportLimitError,
  ProductCsvFeatureUnavailableError,
  ProductCsvImportConflictError,
  ProductCsvMappingError,
  ProductCsvPreviewConflictError,
  ProductCsvPreviewNotFoundError,
  ProductCsvRateLimitError,
  ProductCsvStoreRequiredError,
  ProductCsvValidationError,
} from "@/modules/products/csv-service";
import { RequestPayloadError } from "@/server/http/request-security";
import { TenantNotFoundError } from "@/server/tenancy/context";

export function csvJsonError(message: string, status: number) {
  return Response.json({ ok: false, message }, { status });
}

export function productCsvErrorResponse(error: unknown): Response {
  if (error instanceof RequestPayloadError)
    return csvJsonError(error.message, error.status);
  if (error instanceof ProductCsvRateLimitError)
    return csvJsonError(error.message, 429);
  if (
    error instanceof ProductCsvPreviewNotFoundError ||
    error instanceof TenantNotFoundError
  )
    return csvJsonError("CSV preview or catalog not found.", 404);
  if (error instanceof PermissionError) return csvJsonError(error.message, 403);
  if (error instanceof ProductCsvFeatureUnavailableError)
    return csvJsonError(error.message, 403);
  if (
    error instanceof ProductCsvPreviewConflictError ||
    error instanceof ProductCsvImportConflictError ||
    error instanceof ProductCsvStoreRequiredError ||
    error instanceof BillingAccessError ||
    error instanceof PlanLimitError
  )
    return csvJsonError(error.message, 409);
  if (
    error instanceof ProductCsvValidationError ||
    error instanceof ProductCsvExportLimitError
  )
    return csvJsonError(error.message, 422);
  if (
    error instanceof CsvParseError ||
    error instanceof ProductCsvMappingError ||
    error instanceof z.ZodError
  )
    return csvJsonError(
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? "Check the CSV request.")
        : error.message,
      400,
    );
  if (
    error instanceof Error &&
    error.name === "MongoServerError" &&
    "code" in error &&
    error.code === 11000
  )
    return csvJsonError(
      "The catalog changed while the import was running. Validate again.",
      409,
    );
  return csvJsonError("The CSV operation could not be completed.", 500);
}
