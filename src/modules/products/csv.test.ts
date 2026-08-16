import { describe, expect, it } from "vitest";
import {
  CsvParseError,
  MAX_PRODUCT_CSV_BYTES,
  MAX_PRODUCT_CSV_ROWS,
  escapeCsvCell,
  parseCsv,
  productCsvMappingSchema,
  productCsvPreviewMutationSchema,
  rowsToCsv,
  suggestProductCsvMapping,
} from "./csv";

describe("CSV output", () => {
  it.each(["=2+2", "+SUM(A:A)", "-1+1", "@evil", "\tcommand"])(
    "neutralizes formula payload %s",
    (value) => {
      expect(escapeCsvCell(value).startsWith("'")).toBe(true);
    },
  );
  it("quotes delimiters and quotes", () => {
    expect(
      rowsToCsv([
        ["name", "note"],
        ["A, B", 'say "hello"'],
      ]),
    ).toBe('name,note\r\n"A, B","say ""hello"""');
  });

  it("parses BOM, quoted delimiters, escaped quotes, and line breaks", () => {
    expect(
      parseCsv(
        '\uFEFFname,sku,note\r\n"Oxford, Shirt",OX-1,"Line one\nLine ""two"""\r\n',
      ),
    ).toEqual({
      headers: ["name", "sku", "note"],
      rows: [["Oxford, Shirt", "OX-1", 'Line one\nLine "two"']],
    });
  });

  it("pads short rows and skips empty data lines", () => {
    expect(
      parseCsv("name,sku,subtitle\nOxford,OX-1\n,,\nCap,CAP-1,Daily"),
    ).toEqual({
      headers: ["name", "sku", "subtitle"],
      rows: [
        ["Oxford", "OX-1", ""],
        ["Cap", "CAP-1", "Daily"],
      ],
    });
  });

  it("rejects malformed, duplicate-header, and oversized CSV input", () => {
    expect(() => parseCsv('name,sku\n"Unclosed,OX-1')).toThrow(CsvParseError);
    expect(() => parseCsv("name, NAME\nOxford,Other")).toThrow(
      "CSV column names must be unique",
    );
    const oversized = [
      "name,sku",
      ...Array.from(
        { length: MAX_PRODUCT_CSV_ROWS + 1 },
        (_, index) => `Product ${index},SKU-${index}`,
      ),
    ].join("\n");
    expect(() => parseCsv(oversized)).toThrow(
      `CSV imports cannot exceed ${MAX_PRODUCT_CSV_ROWS.toLocaleString()} data rows.`,
    );
    expect(() => parseCsv("a".repeat(MAX_PRODUCT_CSV_BYTES + 1))).toThrow(
      "CSV files cannot exceed 2 MB.",
    );
  });

  it("suggests common columns and rejects mapping reuse", () => {
    expect(
      suggestProductCsvMapping([
        "Product Name",
        "SKU",
        "Category",
        "Unit Price",
        "Opening Stock",
      ]),
    ).toMatchObject({
      name: "Product Name",
      sku: "SKU",
      category: "Category",
      price: "Unit Price",
      openingStock: "Opening Stock",
    });
    expect(() =>
      productCsvMappingSchema.parse({
        name: "name",
        sku: "name",
        subtitle: "",
        category: "category",
        price: "price",
        openingStock: "",
        reorderLevel: "",
        status: "",
        tags: "",
      }),
    ).toThrow("Each CSV column can map to only one product field");
  });

  it("requires an explicit duplicate-SKU policy", () => {
    const request = {
      previewId: "imp_123",
      expectedVersion: 1,
      mapping: {
        name: "name",
        sku: "sku",
        subtitle: "",
        category: "category",
        price: "price",
        openingStock: "",
        reorderLevel: "",
        status: "",
        tags: "",
      },
    };
    expect(() => productCsvPreviewMutationSchema.parse(request)).toThrow();
    expect(
      productCsvPreviewMutationSchema.parse({
        ...request,
        duplicateSkuBehavior: "skip",
      }).duplicateSkuBehavior,
    ).toBe("skip");
  });
});
