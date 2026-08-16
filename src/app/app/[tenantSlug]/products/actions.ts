"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseDecimalToMinor } from "@/lib/money";
import { ProductService } from "@/modules/products/service";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

const formSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/),
  category: z.string().trim().min(2).max(80),
  price: z.string().trim(),
  stock: z.coerce.number().int().min(0).max(1_000_000),
});
export interface ProductActionState {
  status: "idle" | "success" | "error";
  message: string;
}

export async function createProductAction(
  tenantSlug: string,
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    const input = formSchema.parse(Object.fromEntries(formData));
    const context = await requireTenantContext(tenantSlug);
    await new ProductService().createSimple(context, {
      name: input.name,
      sku: input.sku,
      category: input.category,
      priceMinor: parseDecimalToMinor(input.price),
      openingStock: input.stock,
    });
    revalidatePath(`/app/${context.tenantSlug}/products`);
    return { status: "success", message: "Product created." };
  } catch (error) {
    if (error instanceof z.ZodError)
      return {
        status: "error",
        message: error.issues[0]?.message ?? "Check the product fields.",
      };
    if (
      error instanceof Error &&
      error.name === "MongoServerError" &&
      "code" in error &&
      error.code === 11000
    )
      return { status: "error", message: "That SKU is already in use." };
    return {
      status: "error",
      message:
        "Sign in to an authorized tenant and check your database connection.",
    };
  }
}
