import { describe, expect, it } from "vitest";
import { saleScanQuerySchema } from "./schemas";

describe("sale scan query", () => {
  it("normalizes a bounded barcode or SKU", () => {
    expect(saleScanQuerySchema.parse({ code: "  8901234567890  " })).toEqual({
      code: "8901234567890",
    });
  });

  it("rejects empty, oversized, and unknown input", () => {
    expect(() => saleScanQuerySchema.parse({ code: "" })).toThrow();
    expect(() =>
      saleScanQuerySchema.parse({ code: "x".repeat(161) }),
    ).toThrow();
    expect(() =>
      saleScanQuerySchema.parse({ code: "SKU-1", tenantId: "untrusted" }),
    ).toThrow();
  });
});
