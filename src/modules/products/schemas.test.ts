import { describe, expect, it } from "vitest";
import {
  archiveProductSchema,
  updateProductSchema,
} from "@/modules/products/schemas";

const validUpdate = {
  productId: "prd_catalog_01",
  expectedVersion: 3,
  name: "Counter Kit",
  subtitle: "Retail hardware bundle",
  sku: "CK-HW2",
  category: "Hardware",
  priceMinor: 89_000,
  reorderLevel: 18,
  status: "active" as const,
  tagIds: ["tag_featured"],
};

describe("product lifecycle schemas", () => {
  it("accepts a bounded catalog update", () => {
    expect(updateProductSchema.parse(validUpdate)).toEqual(validUpdate);
  });

  it("rejects tenant and stock fields at the mutation boundary", () => {
    expect(() =>
      updateProductSchema.parse({
        ...validUpdate,
        tenantId: "org_other",
        stock: 9_999,
      }),
    ).toThrow();
  });

  it("does not allow edits to set the archived lifecycle state", () => {
    expect(() =>
      updateProductSchema.parse({ ...validUpdate, status: "archived" }),
    ).toThrow();
  });

  it("requires a positive expected version for archive", () => {
    expect(() =>
      archiveProductSchema.parse({
        productId: validUpdate.productId,
        expectedVersion: 0,
      }),
    ).toThrow();
  });

  it("rejects extra archive selectors", () => {
    expect(() =>
      archiveProductSchema.parse({
        productId: validUpdate.productId,
        expectedVersion: 3,
        tenantId: "org_other",
      }),
    ).toThrow();
  });
});
