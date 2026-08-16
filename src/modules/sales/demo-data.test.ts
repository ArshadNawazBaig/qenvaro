import { describe, expect, it } from "vitest";
import { getDemoSaleWorkspace } from "./demo-data";
import { saleCatalogQuerySchema } from "./schemas";

describe("sale workspace demo", () => {
  it("returns only active sellable catalog items with bounded search", () => {
    const workspace = getDemoSaleWorkspace(
      saleCatalogQuerySchema.parse({ q: "counter", pageSize: 6 }),
    );
    expect(workspace.catalog.total).toBe(1);
    expect(workspace.catalog.items[0]).toMatchObject({
      productName: "Counter Kit",
      inventoryTracking: true,
    });
  });

  it("identifies services without an inventory projection", () => {
    const workspace = getDemoSaleWorkspace(
      saleCatalogQuerySchema.parse({ q: "onboarding", pageSize: 6 }),
    );
    expect(workspace.catalog.items[0]).toMatchObject({
      quantity: null,
      inventoryTracking: false,
    });
  });
});
