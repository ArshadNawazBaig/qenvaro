"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BillingAccessError } from "@/modules/billing/entitlements";
import { PermissionError } from "@/modules/permissions/permissions";
import { tagColorSchema } from "@/modules/tags/schemas";
import {
  TagArchivedError,
  TagDuplicateError,
  TagInUseError,
  TagNotFoundError,
  TagService,
  TagVersionConflictError,
} from "@/modules/tags/service";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

const createFormSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(240),
    color: tagColorSchema,
  })
  .strict();

const updateFormSchema = createFormSchema.extend({
  expectedVersion: z.coerce.number().int().min(1),
});

const archiveFormSchema = z
  .object({ expectedVersion: z.coerce.number().int().min(1) })
  .strict();

export interface TagActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  version?: number;
}

function failure(error: unknown): TagActionState {
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Check the tag fields.",
    };
  if (error instanceof TagVersionConflictError)
    return {
      status: "conflict",
      message: "This tag changed in another session. Reload before retrying.",
    };
  if (error instanceof TagDuplicateError || error instanceof TagArchivedError)
    return { status: "error", message: error.message };
  if (error instanceof TagInUseError)
    return {
      status: "error",
      message: `Reassign the ${error.productCount} active product${error.productCount === 1 ? "" : "s"} using this tag before archiving it.`,
    };
  if (error instanceof TagNotFoundError)
    return { status: "error", message: "Tag not found or unavailable." };
  if (error instanceof PermissionError || error instanceof BillingAccessError)
    return { status: "error", message: error.message };
  if (
    error instanceof Error &&
    error.name === "MongoServerError" &&
    "code" in error &&
    error.code === 11000
  )
    return { status: "error", message: "A tag with that name already exists." };
  return {
    status: "error",
    message: "The tag change could not be completed. Try again.",
  };
}

function revalidateTagViews(tenantSlug: string) {
  revalidatePath(`/app/${tenantSlug}/products`);
  revalidatePath(`/app/${tenantSlug}/products/tags`);
}

export async function createTagAction(
  tenantSlug: string,
  _previous: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = createFormSchema.parse(Object.fromEntries(formData));
    const result = await new TagService().create(context, input);
    revalidateTagViews(context.tenantSlug);
    return {
      status: "success",
      message: "Tag created.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateTagAction(
  tenantSlug: string,
  tagId: string,
  _previous: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = updateFormSchema.parse(Object.fromEntries(formData));
    const result = await new TagService().update(context, {
      tagId,
      expectedVersion: input.expectedVersion,
      name: input.name,
      description: input.description,
      color: input.color,
    });
    revalidateTagViews(context.tenantSlug);
    return {
      status: "success",
      message: "Tag updated.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveTagAction(
  tenantSlug: string,
  tagId: string,
  _previous: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = archiveFormSchema.parse(Object.fromEntries(formData));
    const result = await new TagService().archive(context, {
      tagId,
      expectedVersion: input.expectedVersion,
    });
    revalidateTagViews(context.tenantSlug);
    return {
      status: "success",
      message: result.alreadyArchived
        ? "Tag is already archived."
        : "Tag archived.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}
