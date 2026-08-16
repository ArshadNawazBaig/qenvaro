import { z } from "zod";

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export const MAX_PRODUCT_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_PRODUCT_CSV_ROWS = 500;
export const MAX_PRODUCT_CSV_COLUMNS = 30;
export const MAX_PRODUCT_CSV_CELL_CHARACTERS = 1_000;

export const productCsvFields = [
  "name",
  "sku",
  "subtitle",
  "category",
  "price",
  "openingStock",
  "reorderLevel",
  "status",
  "tags",
] as const;
export type ProductCsvField = (typeof productCsvFields)[number];
export const productCsvDuplicateBehaviorSchema = z.enum([
  "reject",
  "skip",
  "update",
]);
export type ProductCsvDuplicateBehavior = z.infer<
  typeof productCsvDuplicateBehaviorSchema
>;

const requiredColumnSchema = z.string().trim().min(1).max(120);
const optionalColumnSchema = z.string().trim().max(120).default("");

export const productCsvMappingSchema = z
  .object({
    name: requiredColumnSchema,
    sku: requiredColumnSchema,
    subtitle: optionalColumnSchema,
    category: requiredColumnSchema,
    price: requiredColumnSchema,
    openingStock: optionalColumnSchema,
    reorderLevel: optionalColumnSchema,
    status: optionalColumnSchema,
    tags: optionalColumnSchema,
  })
  .strict()
  .superRefine((mapping, context) => {
    const selected = Object.values(mapping).filter(Boolean);
    if (new Set(selected).size !== selected.length)
      context.addIssue({
        code: "custom",
        message: "Each CSV column can map to only one product field.",
      });
  });

export const productCsvPreviewMutationSchema = z
  .object({
    previewId: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9_-]+$/),
    expectedVersion: z.number().int().positive(),
    mapping: productCsvMappingSchema,
    duplicateSkuBehavior: productCsvDuplicateBehaviorSchema,
  })
  .strict();

export const productCsvCommitSchema = productCsvPreviewMutationSchema
  .pick({ previewId: true, expectedVersion: true })
  .strict();

export type ProductCsvMapping = z.infer<typeof productCsvMappingSchema>;
export type ProductCsvPreviewMutationInput = z.infer<
  typeof productCsvPreviewMutationSchema
>;
export type ProductCsvCommitInput = z.infer<typeof productCsvCommitSchema>;

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export interface ProductCsvPreviewResult {
  previewId: string;
  version: number;
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  suggestedMapping: ProductCsvMapping;
  expiresAt: string;
}

export interface ProductCsvRowIssue {
  rowNumber: number;
  field: ProductCsvField | "row";
  message: string;
}

export interface ProductCsvRowWarning {
  rowNumber: number;
  message: string;
}

export interface ProductCsvValidationResult {
  previewId: string;
  version: number;
  totalRows: number;
  validRows: number;
  createCount: number;
  updateCount: number;
  skipCount: number;
  issues: ProductCsvRowIssue[];
  warnings: ProductCsvRowWarning[];
}

export interface ProductCsvImportResult {
  previewId: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  alreadyImported: boolean;
}

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

export function escapeCsvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function rowsToCsv(
  rows: readonly (readonly (string | number | null)[])[],
): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

function normalizeHeader(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function pushCell(row: string[], cell: string) {
  if (cell.length > MAX_PRODUCT_CSV_CELL_CHARACTERS)
    throw new CsvParseError(
      `CSV cells cannot exceed ${MAX_PRODUCT_CSV_CELL_CHARACTERS.toLocaleString()} characters.`,
    );
  row.push(cell);
  if (row.length > MAX_PRODUCT_CSV_COLUMNS)
    throw new CsvParseError(
      `CSV files cannot exceed ${MAX_PRODUCT_CSV_COLUMNS} columns.`,
    );
}

export function parseCsv(source: string): ParsedCsv {
  if (new TextEncoder().encode(source).byteLength > MAX_PRODUCT_CSV_BYTES)
    throw new CsvParseError("CSV files cannot exceed 2 MB.");
  const text = source.startsWith("\uFEFF") ? source.slice(1) : source;
  if (!text.trim()) throw new CsvParseError("The CSV file is empty.");
  if (text.includes("\0"))
    throw new CsvParseError("The CSV file contains unsupported null bytes.");

  const parsedRows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let afterQuote = false;
  let endedWithRowBreak = false;

  const pushRow = () => {
    pushCell(row, cell);
    if (parsedRows.length === 0 || row.some((value) => value.trim()))
      parsedRows.push(row);
    row = [];
    cell = "";
    if (parsedRows.length > MAX_PRODUCT_CSV_ROWS + 1)
      throw new CsvParseError(
        `CSV imports cannot exceed ${MAX_PRODUCT_CSV_ROWS.toLocaleString()} data rows.`,
      );
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    endedWithRowBreak = false;
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        cell += character;
      }
      if (cell.length > MAX_PRODUCT_CSV_CELL_CHARACTERS)
        throw new CsvParseError(
          `CSV cells cannot exceed ${MAX_PRODUCT_CSV_CELL_CHARACTERS.toLocaleString()} characters.`,
        );
      continue;
    }

    if (afterQuote) {
      if (character === ",") {
        pushCell(row, cell);
        cell = "";
        afterQuote = false;
        continue;
      }
      if (character === "\n" || character === "\r") {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        pushRow();
        afterQuote = false;
        endedWithRowBreak = true;
        continue;
      }
      throw new CsvParseError(
        "Unexpected characters appear after a quoted CSV value.",
      );
    }

    if (character === '"') {
      if (cell.length > 0)
        throw new CsvParseError(
          "Quotes must begin at the start of a CSV cell.",
        );
      inQuotes = true;
    } else if (character === ",") {
      pushCell(row, cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      pushRow();
      endedWithRowBreak = true;
    } else {
      cell += character;
      if (cell.length > MAX_PRODUCT_CSV_CELL_CHARACTERS)
        throw new CsvParseError(
          `CSV cells cannot exceed ${MAX_PRODUCT_CSV_CELL_CHARACTERS.toLocaleString()} characters.`,
        );
    }
  }

  if (inQuotes) throw new CsvParseError("A quoted CSV value is not closed.");
  if (!endedWithRowBreak || row.length > 0 || cell.length > 0) pushRow();

  const headerRow = parsedRows[0];
  if (!headerRow) throw new CsvParseError("The CSV header row is missing.");
  const headers = headerRow.map((header) => header.trim());
  if (headers.some((header) => !header))
    throw new CsvParseError("CSV column names cannot be empty.");
  const normalizedHeaders = headers.map(normalizeHeader);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length)
    throw new CsvParseError("CSV column names must be unique.");
  const rows = parsedRows.slice(1).map((dataRow, index) => {
    if (dataRow.length > headers.length)
      throw new CsvParseError(
        `Row ${index + 2} has more values than the header row.`,
      );
    return [
      ...dataRow,
      ...Array.from({ length: headers.length - dataRow.length }, () => ""),
    ];
  });
  if (rows.length === 0)
    throw new CsvParseError("The CSV file has no product rows.");
  if (rows.length > MAX_PRODUCT_CSV_ROWS)
    throw new CsvParseError(
      `CSV imports cannot exceed ${MAX_PRODUCT_CSV_ROWS.toLocaleString()} data rows.`,
    );
  return { headers, rows };
}

const headerAliases: Record<ProductCsvField, readonly string[]> = {
  name: ["name", "product name"],
  sku: ["sku", "product sku"],
  subtitle: ["subtitle", "description"],
  category: ["category", "category name"],
  price: ["price", "unit price"],
  openingStock: ["opening_stock", "opening stock"],
  reorderLevel: ["reorder_level", "reorder level", "reorder threshold"],
  status: ["status", "product status"],
  tags: ["tags", "tag names"],
};

export function suggestProductCsvMapping(
  headers: readonly string[],
): ProductCsvMapping {
  const normalized = new Map(
    headers.map((header) => [normalizeHeader(header), header] as const),
  );
  const suggestion = Object.fromEntries(
    productCsvFields.map((field) => [
      field,
      headerAliases[field]
        .map((alias) => normalized.get(alias))
        .find(Boolean) ?? "",
    ]),
  );
  return suggestion as ProductCsvMapping;
}

export function mappedCsvCell(
  parsed: ParsedCsv,
  row: readonly string[],
  column: string,
): string {
  if (!column) return "";
  const index = parsed.headers.indexOf(column);
  if (index < 0) return "";
  return row[index] ?? "";
}
