import { z } from "zod";

export const MAX_PRODUCT_IMAGES = 8;
export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

const opaqueIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);

export const productImageAltTextSchema = z.string().trim().min(2).max(160);

const cloudinaryUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Cloudinary must return a secure image URL.",
  })
  .refine((value) => new URL(value).hostname === "res.cloudinary.com", {
    message: "The image URL must use Cloudinary delivery.",
  });

export const attachProductImageSchema = z
  .object({
    productId: opaqueIdSchema,
    imageId: opaqueIdSchema,
    altText: productImageAltTextSchema,
    upload: z
      .object({
        publicId: z.string().trim().min(1).max(500),
        assetId: z.string().trim().min(1).max(200),
        version: z.number().int().positive(),
        secureUrl: cloudinaryUrlSchema,
        width: z.number().int().positive().max(20_000),
        height: z.number().int().positive().max(20_000),
        format: z.string().trim().min(1).max(20),
        bytes: z.number().int().positive().max(MAX_PRODUCT_IMAGE_BYTES),
      })
      .strict(),
  })
  .strict();

export const productImageMutationSchema = z
  .object({
    productId: opaqueIdSchema,
    imageId: opaqueIdSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const updateProductImageAltSchema = productImageMutationSchema
  .extend({ altText: productImageAltTextSchema })
  .strict();

export const moveProductImageSchema = productImageMutationSchema
  .extend({ direction: z.enum(["previous", "next"]) })
  .strict();

export type AttachProductImageInput = z.infer<typeof attachProductImageSchema>;
export type ProductImageMutationInput = z.infer<
  typeof productImageMutationSchema
>;
export type UpdateProductImageAltInput = z.infer<
  typeof updateProductImageAltSchema
>;
export type MoveProductImageInput = z.infer<typeof moveProductImageSchema>;

export interface ProductImageItem {
  id: string;
  url: string;
  altText: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  isPrimary: boolean;
  position: number;
  version: number;
}
