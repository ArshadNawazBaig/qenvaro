import { describe, expect, it } from "vitest";
import {
  createTagSchema,
  normalizeTagName,
  productTagIdsSchema,
  tagListQuerySchema,
  updateTagSchema,
} from "./schemas";

describe("tag schemas", () => {
  it("normalizes names and deduplicates product assignments", () => {
    expect(normalizeTagName("  New   Arrival  ")).toBe("new arrival");
    expect(
      productTagIdsSchema.parse(["tag_one", "tag_one", "tag_two"]),
    ).toEqual(["tag_one", "tag_two"]);
  });

  it("accepts bounded create and update payloads", () => {
    expect(
      createTagSchema.parse({
        name: "Featured",
        description: "Homepage products",
        color: "blue",
      }),
    ).toMatchObject({ name: "Featured", color: "blue" });
    expect(
      updateTagSchema.parse({
        tagId: "tag_featured",
        expectedVersion: 2,
        name: "Staff pick",
        description: "Curated by the retail team",
        color: "violet",
      }),
    ).toMatchObject({ expectedVersion: 2, color: "violet" });
  });

  it("rejects invalid colors and safely defaults list queries", () => {
    expect(() =>
      createTagSchema.parse({
        name: "Featured",
        description: "",
        color: "neon",
      }),
    ).toThrow();
    expect(
      tagListQuerySchema.parse({ page: "invalid", status: "missing" }),
    ).toMatchObject({
      page: 1,
      status: "all",
      sort: "name",
    });
  });
});
