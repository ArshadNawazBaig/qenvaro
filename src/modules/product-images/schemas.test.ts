import { describe, expect, it } from "vitest";
import {
  attachProductImageSchema,
  MAX_PRODUCT_IMAGE_BYTES,
  moveProductImageSchema,
  productImageAltTextSchema,
} from "./schemas";

const validUpload = {
  publicId: "qenvaro/products/org_1/prd_1/img_1",
  assetId: "asset_1",
  version: 1,
  secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/img_1.webp",
  width: 1200,
  height: 900,
  format: "webp",
  bytes: 240_000,
};

describe("product image schemas", () => {
  it("accepts bounded Cloudinary metadata and trims alternative text", () => {
    const parsed = attachProductImageSchema.parse({
      productId: "prd_1",
      imageId: "img_1",
      altText: "  Front view of the product  ",
      upload: validUpload,
    });
    expect(parsed.altText).toBe("Front view of the product");
  });

  it("rejects non-Cloudinary and insecure delivery URLs", () => {
    expect(() =>
      attachProductImageSchema.parse({
        productId: "prd_1",
        imageId: "img_1",
        altText: "Front view",
        upload: { ...validUpload, secureUrl: "https://example.com/image.webp" },
      }),
    ).toThrow();
    expect(() =>
      attachProductImageSchema.parse({
        productId: "prd_1",
        imageId: "img_1",
        altText: "Front view",
        upload: {
          ...validUpload,
          secureUrl: "http://res.cloudinary.com/demo/image.webp",
        },
      }),
    ).toThrow();
  });

  it("enforces accessible text and storage bounds", () => {
    expect(() => productImageAltTextSchema.parse(" ")).toThrow();
    expect(() =>
      attachProductImageSchema.parse({
        productId: "prd_1",
        imageId: "img_1",
        altText: "Front view",
        upload: { ...validUpload, bytes: MAX_PRODUCT_IMAGE_BYTES + 1 },
      }),
    ).toThrow();
  });

  it("accepts only bounded ordering directions", () => {
    expect(
      moveProductImageSchema.parse({
        productId: "prd_1",
        imageId: "img_1",
        expectedVersion: 1,
        direction: "previous",
      }).direction,
    ).toBe("previous");
    expect(() =>
      moveProductImageSchema.parse({
        productId: "prd_1",
        imageId: "img_1",
        expectedVersion: 1,
        direction: "up",
      }),
    ).toThrow();
  });
});
