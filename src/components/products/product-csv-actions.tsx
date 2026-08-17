"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import {
  MAX_PRODUCT_CSV_BYTES,
  rowsToCsv,
  type ProductCsvDuplicateBehavior,
  type ProductCsvField,
  type ProductCsvImportResult,
  type ProductCsvMapping,
  type ProductCsvPreviewResult,
  type ProductCsvValidationResult,
} from "@/modules/products/csv";

const fieldDefinitions: Array<{
  field: ProductCsvField;
  label: string;
  required: boolean;
  help: string;
}> = [
  {
    field: "name",
    label: "Product name",
    required: true,
    help: "2–120 characters",
  },
  { field: "sku", label: "SKU", required: true, help: "Unique per tenant" },
  {
    field: "category",
    label: "Category",
    required: true,
    help: "Created if new",
  },
  { field: "price", label: "Price", required: true, help: "Example: 129.95" },
  {
    field: "subtitle",
    label: "Subtitle",
    required: false,
    help: "Up to 160 characters",
  },
  {
    field: "openingStock",
    label: "Opening stock",
    required: false,
    help: "New SKUs only",
  },
  {
    field: "reorderLevel",
    label: "Reorder level",
    required: false,
    help: "Whole number",
  },
  {
    field: "status",
    label: "Status",
    required: false,
    help: "active or draft",
  },
  {
    field: "tags",
    label: "Tags",
    required: false,
    help: "Active names separated by |",
  },
];

const productCsvTemplate = `${rowsToCsv([
  [
    "name",
    "sku",
    "subtitle",
    "category",
    "price",
    "opening_stock",
    "reorder_level",
    "status",
    "tags",
  ],
  [
    "Classic T-shirt",
    "TSHIRT-001",
    "Everyday cotton tee",
    "Apparel",
    "29.95",
    "20",
    "5",
    "active",
    "",
  ],
])}\r\n`;

function downloadCsv(filename: string, contents: string) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", contents], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function endpoint(tenantSlug: string, operation: string): string {
  return `/api/app/${encodeURIComponent(tenantSlug)}/products/csv/${operation}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { message?: string } & T;
  if (!response.ok)
    throw new Error(
      body.message ?? "The CSV operation could not be completed.",
    );
  return body;
}

function ColumnMapping({
  preview,
  mapping,
  disabled,
  onChange,
}: {
  preview: ProductCsvPreviewResult;
  mapping: ProductCsvMapping;
  disabled: boolean;
  onChange: (mapping: ProductCsvMapping) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Column mapping</CardTitle>
        <CardDescription>
          Match source columns explicitly before any catalog data changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fieldDefinitions.map((definition) => (
          <label key={definition.field} className="min-w-0 space-y-1.5">
            <span className="flex items-center gap-1 text-sm font-medium">
              {definition.label}
              {definition.required && (
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              )}
            </span>
            <SelectField
              ariaLabel={`${definition.label} CSV column`}
              value={mapping[definition.field] || "not-mapped"}
              onValueChange={(value) =>
                onChange({
                  ...mapping,
                  [definition.field]: value === "not-mapped" ? "" : value,
                })
              }
              required={definition.required}
              disabled={disabled}
              options={[
                {
                  value: "not-mapped",
                  label: definition.required ? "Choose a column" : "Not mapped",
                },
                ...preview.headers.map((header) => ({
                  value: header,
                  label: header,
                })),
              ]}
            />
            <span className="text-muted-foreground block text-xs">
              {definition.help}
            </span>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}

function SampleRows({ preview }: { preview: ProductCsvPreviewResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Source preview</CardTitle>
        <CardDescription>
          First {preview.sampleRows.length.toLocaleString()} of{" "}
          {preview.rowCount.toLocaleString()} rows
        </CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Row</th>
              {preview.headers.map((header) => (
                <th key={header} className="px-4 py-3 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {preview.sampleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="text-muted-foreground px-4 py-3">
                  {rowIndex + 2}
                </td>
                {preview.headers.map((header, columnIndex) => (
                  <td
                    key={header}
                    className="max-w-56 truncate px-4 py-3"
                    title={row[columnIndex] ?? ""}
                  >
                    {row[columnIndex] || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ValidationSummary({ result }: { result: ProductCsvValidationResult }) {
  const valid = result.issues.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {valid ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="size-4 text-amber-600" />
          )}
          {valid ? "Ready to import" : "Rows need attention"}
        </CardTitle>
        <CardDescription>
          Validation is tenant-scoped and does not modify products.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{result.totalRows} total</Badge>
          <Badge variant="success">{result.createCount} new</Badge>
          <Badge variant="info">{result.updateCount} updates</Badge>
          {result.skipCount > 0 && (
            <Badge variant="outline">{result.skipCount} skipped</Badge>
          )}
          {result.issues.length > 0 && (
            <Badge variant="destructive">{result.issues.length} errors</Badge>
          )}
          {result.warnings.length > 0 && (
            <Badge variant="warning">{result.warnings.length} warnings</Badge>
          )}
        </div>
        {result.issues.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">
                Correct these rows in the source file, then upload it again.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadCsv(
                    "product-import-errors.csv",
                    `${rowsToCsv([
                      ["row", "field", "error"],
                      ...result.issues.map((issue) => [
                        issue.rowNumber,
                        issue.field,
                        issue.message,
                      ]),
                    ])}\r\n`,
                  )
                }
              >
                <Download /> Download errors
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-muted/60 text-muted-foreground border-b text-xs">
                  <tr>
                    <th className="px-4 py-3 font-medium">Row</th>
                    <th className="px-4 py-3 font-medium">Field</th>
                    <th className="px-4 py-3 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.issues.slice(0, 100).map((issue, index) => (
                    <tr key={`${issue.rowNumber}:${issue.field}:${index}`}>
                      <td className="px-4 py-3 font-mono">{issue.rowNumber}</td>
                      <td className="px-4 py-3 capitalize">{issue.field}</td>
                      <td className="text-destructive px-4 py-3">
                        {issue.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {result.warnings.length > 0 && (
          <ul className="bg-muted/50 space-y-2 rounded-lg p-4 text-sm">
            {result.warnings.slice(0, 20).map((warning) => (
              <li key={`${warning.rowNumber}:${warning.message}`}>
                <span className="font-medium">Row {warning.rowNumber}:</span>{" "}
                <span className="text-muted-foreground">{warning.message}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ProductCsvImportDialog({
  tenantSlug,
  disabled,
  disabledReason,
}: {
  tenantSlug: string;
  disabled: boolean;
  disabledReason: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<ProductCsvPreviewResult | null>(
    null,
  );
  const [mapping, setMapping] = React.useState<ProductCsvMapping | null>(null);
  const [duplicateSkuBehavior, setDuplicateSkuBehavior] =
    React.useState<ProductCsvDuplicateBehavior>("update");
  const [validation, setValidation] =
    React.useState<ProductCsvValidationResult | null>(null);
  const [completed, setCompleted] =
    React.useState<ProductCsvImportResult | null>(null);
  const [pending, setPending] = React.useState<
    "preview" | "validate" | "import" | null
  >(null);
  const [error, setError] = React.useState("");

  function reset() {
    setPreview(null);
    setMapping(null);
    setDuplicateSkuBehavior("update");
    setValidation(null);
    setCompleted(null);
    setPending(null);
    setError("");
  }

  async function uploadPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a CSV file to preview.");
      return;
    }
    if (file.size > MAX_PRODUCT_CSV_BYTES) {
      setError("Choose a CSV file smaller than 2 MB.");
      return;
    }
    setPending("preview");
    try {
      const response = await fetch(endpoint(tenantSlug, "preview"), {
        method: "POST",
        body: formData,
      });
      const body = await readJson<{ preview: ProductCsvPreviewResult }>(
        response,
      );
      setPreview(body.preview);
      setMapping(body.preview.suggestedMapping);
      setDuplicateSkuBehavior("update");
      setValidation(null);
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "The CSV preview could not be created.",
      );
    } finally {
      setPending(null);
    }
  }

  async function validate() {
    if (!preview || !mapping) return;
    setPending("validate");
    setError("");
    try {
      const response = await fetch(endpoint(tenantSlug, "validate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previewId: preview.previewId,
          expectedVersion: preview.version,
          mapping,
          duplicateSkuBehavior,
        }),
      });
      const body = await readJson<{ result: ProductCsvValidationResult }>(
        response,
      );
      setValidation(body.result);
      setPreview({ ...preview, version: body.result.version });
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "The CSV rows could not be validated.",
      );
    } finally {
      setPending(null);
    }
  }

  async function commit() {
    if (!preview || !validation || validation.issues.length > 0) return;
    setPending("import");
    setError("");
    try {
      const response = await fetch(endpoint(tenantSlug, "import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previewId: preview.previewId,
          expectedVersion: validation.version,
        }),
      });
      const body = await readJson<{ result: ProductCsvImportResult }>(response);
      setCompleted(body.result);
      router.refresh();
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "The products could not be imported.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled} title={disabledReason}>
          <Upload /> Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-4 sm:p-6">
        <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
          <FileSpreadsheet className="size-5" /> Import products from CSV
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Preview and validate up to 500 rows before choosing whether existing
          SKUs are rejected, skipped, or updated.
        </DialogDescription>

        {completed ? (
          <Card className="mt-5">
            <CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <CheckCircle2 className="size-6" />
              </div>
              <h3 className="mt-4 font-semibold">Import completed</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {completed.createdCount} products created and{" "}
                {completed.updatedCount} products updated.{" "}
                {completed.skippedCount} existing products were skipped.
              </p>
              <Button className="mt-5" onClick={() => setOpen(false)}>
                Return to catalog
              </Button>
            </CardContent>
          </Card>
        ) : !preview || !mapping ? (
          <Card className="mt-5">
            <CardHeader>
              <CardTitle>Choose source file</CardTitle>
              <CardDescription>
                UTF-8 CSV, maximum 2 MB and 500 data rows.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={uploadPreview} className="space-y-4">
                <Input
                  type="file"
                  name="file"
                  accept=".csv,text/csv"
                  required
                  disabled={pending !== null}
                  aria-label="Product CSV file"
                  className="h-auto py-2"
                />
                <div className="bg-muted/50 rounded-lg p-4 text-sm">
                  <p className="font-medium">Recommended columns</p>
                  <p className="text-muted-foreground mt-1 font-mono text-xs leading-5 break-words">
                    name, sku, subtitle, category, price, opening_stock,
                    reorder_level, status, tags
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    downloadCsv(
                      "qenvaro-product-import-template.csv",
                      productCsvTemplate,
                    )
                  }
                >
                  <Download /> Download template
                </Button>
                {error && (
                  <p role="alert" className="text-destructive text-sm">
                    {error}
                  </p>
                )}
                <div className="flex justify-end">
                  <Button type="submit" disabled={pending !== null}>
                    {pending === "preview" ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Upload />
                    )}
                    Preview CSV
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {preview.rowCount.toLocaleString()} product rows detected
                </p>
                <p className="text-muted-foreground text-xs">
                  Preview expires at{" "}
                  {new Date(preview.expiresAt).toLocaleTimeString()}.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                disabled={pending !== null}
              >
                <RotateCcw /> Choose another file
              </Button>
            </div>
            <ColumnMapping
              preview={preview}
              mapping={mapping}
              disabled={pending !== null}
              onChange={(nextMapping) => {
                setMapping(nextMapping);
                setValidation(null);
              }}
            />
            <Card>
              <CardHeader>
                <CardTitle>Existing SKU behavior</CardTitle>
                <CardDescription>
                  This applies only when a CSV SKU already belongs to an active
                  or draft product in this tenant.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <label className="block max-w-md space-y-1.5 text-sm font-medium">
                  Duplicate handling
                  <SelectField
                    ariaLabel="Existing SKU behavior"
                    value={duplicateSkuBehavior}
                    disabled={pending !== null}
                    onValueChange={(value) => {
                      setDuplicateSkuBehavior(
                        value as ProductCsvDuplicateBehavior,
                      );
                      setValidation(null);
                    }}
                    options={[
                      {
                        value: "update",
                        label: "Update allowed catalog fields",
                      },
                      { value: "skip", label: "Skip existing SKUs" },
                      { value: "reject", label: "Reject existing SKUs" },
                    ]}
                  />
                  <span className="text-muted-foreground block text-xs font-normal">
                    Updates never change inventory for an existing product.
                  </span>
                </label>
              </CardContent>
            </Card>
            <SampleRows preview={preview} />
            {validation && <ValidationSummary result={validation} />}
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending !== null}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={validate}
                disabled={pending !== null}
              >
                {pending === "validate" && (
                  <LoaderCircle className="animate-spin" />
                )}
                {validation ? "Validate again" : "Validate rows"}
              </Button>
              <Button
                onClick={commit}
                disabled={
                  pending !== null ||
                  !validation ||
                  validation.issues.length > 0
                }
              >
                {pending === "import" ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <CheckCircle2 />
                )}
                Import{" "}
                {validation
                  ? validation.createCount + validation.updateCount
                  : 0}{" "}
                products
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ProductCsvActions({
  tenantSlug,
  exportHref,
  importDisabled,
  exportDisabled,
  importDisabledReason,
  exportDisabledReason,
}: {
  tenantSlug: string;
  exportHref: string;
  importDisabled: boolean;
  exportDisabled: boolean;
  importDisabledReason: string;
  exportDisabledReason: string;
}) {
  return (
    <>
      <ProductCsvImportDialog
        tenantSlug={tenantSlug}
        disabled={importDisabled}
        disabledReason={importDisabledReason}
      />
      {exportDisabled ? (
        <Button variant="outline" disabled title={exportDisabledReason}>
          <Download /> Export
        </Button>
      ) : (
        <Button asChild variant="outline">
          <a href={exportHref} download>
            <Download /> Export
          </a>
        </Button>
      )}
    </>
  );
}
