"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BillingAccessError } from "@/modules/billing/entitlements";
import {
  archiveCustomerSchema,
  createCustomerSchema,
  updateCustomerSchema,
} from "@/modules/customers/schemas";
import {
  CustomerArchivedError,
  CustomerNotFoundError,
  CustomerService,
  CustomerVersionConflictError,
} from "@/modules/customers/service";
import { PermissionError } from "@/modules/permissions/permissions";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export interface CustomerActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  version?: number;
}

function customerFields(formData: FormData) {
  return {
    name: formData.get("name"),
    company: formData.get("company"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: {
      line1: formData.get("addressLine1"),
      line2: formData.get("addressLine2"),
      city: formData.get("city"),
      region: formData.get("region"),
      postalCode: formData.get("postalCode"),
      countryCode: formData.get("countryCode"),
    },
    notes: formData.get("notes"),
  };
}

function failure(error: unknown): CustomerActionState {
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Check the customer details.",
    };
  if (error instanceof CustomerVersionConflictError)
    return {
      status: "conflict",
      message:
        "This customer changed in another session. Reload before retrying.",
    };
  if (error instanceof CustomerArchivedError)
    return { status: "error", message: error.message };
  if (error instanceof CustomerNotFoundError)
    return { status: "error", message: "Customer not found or unavailable." };
  if (error instanceof PermissionError || error instanceof BillingAccessError)
    return { status: "error", message: error.message };
  return {
    status: "error",
    message: "The customer change could not be completed. Try again.",
  };
}

function revalidateCustomerViews(tenantSlug: string) {
  revalidatePath(`/app/${tenantSlug}`);
  revalidatePath(`/app/${tenantSlug}/customers`);
}

export async function createCustomerAction(
  tenantSlug: string,
  _previous: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = createCustomerSchema.parse(customerFields(formData));
    const result = await new CustomerService().create(context, input);
    revalidateCustomerViews(context.tenantSlug);
    return {
      status: "success",
      message: `Customer ${result.code} created.`,
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCustomerAction(
  tenantSlug: string,
  customerId: string,
  _previous: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = updateCustomerSchema.parse({
      ...customerFields(formData),
      customerId,
      expectedVersion: Number(formData.get("expectedVersion")),
    });
    const result = await new CustomerService().update(context, input);
    revalidateCustomerViews(context.tenantSlug);
    return {
      status: "success",
      message: "Customer updated.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveCustomerAction(
  tenantSlug: string,
  customerId: string,
  _previous: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = archiveCustomerSchema.parse({
      customerId,
      expectedVersion: Number(formData.get("expectedVersion")),
    });
    const result = await new CustomerService().archive(context, input);
    revalidateCustomerViews(context.tenantSlug);
    return {
      status: "success",
      message: result.alreadyArchived
        ? "Customer is already archived."
        : "Customer archived.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}
