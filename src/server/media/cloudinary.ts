import "server-only";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { env } from "@/config/env";

export interface CloudinaryProductImageUpload {
  publicId: string;
  assetId: string;
  version: number;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

export class CloudinaryNotConfiguredError extends Error {
  constructor() {
    super("Cloudinary image storage is not configured.");
    this.name = "CloudinaryNotConfiguredError";
  }
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET,
  );
}

function configureCloudinary() {
  if (!isCloudinaryConfigured()) throw new CloudinaryNotConfiguredError();
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function toProductImageUpload(
  response: UploadApiResponse,
): CloudinaryProductImageUpload {
  if (typeof response.asset_id !== "string" || response.asset_id.length === 0)
    throw new Error("Cloudinary returned incomplete asset metadata.");
  return {
    publicId: response.public_id,
    assetId: response.asset_id,
    version: response.version,
    secureUrl: response.secure_url,
    width: response.width,
    height: response.height,
    format: response.format,
    bytes: response.bytes,
  };
}

export async function uploadProductImage(input: {
  bytes: Buffer;
  tenantId: string;
  productId: string;
  imageId: string;
}): Promise<CloudinaryProductImageUpload> {
  configureCloudinary();
  const response = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder: `qenvaro/products/${input.tenantId}/${input.productId}`,
        public_id: input.imageId,
        unique_filename: false,
        use_filename: false,
        overwrite: false,
        allowed_formats: ["jpg", "jpeg", "png", "webp", "avif"],
        transformation: [
          {
            width: 2400,
            height: 2400,
            crop: "limit",
            quality: "auto:good",
            flags: "strip_profile",
          },
        ],
      },
      (error, result) => {
        if (error) reject(error);
        else if (!result)
          reject(new Error("Cloudinary returned no upload result."));
        else resolve(result);
      },
    );
    stream.end(input.bytes);
  });
  return toProductImageUpload(response);
}

export async function deleteProductImage(publicId: string): Promise<void> {
  configureCloudinary();
  const result = (await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  })) as { result?: string };
  if (result.result !== "ok" && result.result !== "not found")
    throw new Error("Cloudinary did not confirm image deletion.");
}
