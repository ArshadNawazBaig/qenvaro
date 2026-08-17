import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tenantSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9-]+$/);

export async function GET(request: NextRequest) {
  const parsedSlug = tenantSlugSchema.safeParse(
    request.nextUrl.searchParams.get("tenantSlug"),
  );
  if (!parsedSlug.success)
    return new NextResponse(null, {
      status: 401,
      headers: { "cache-control": "private, no-store" },
    });

  try {
    const context = await requireTenantContext(parsedSlug.data, {
      allowSuspended: true,
    });
    return NextResponse.json(
      {
        tenantId: context.tenantId,
        tenantSlug: context.tenantSlug,
        userId: context.userId,
        roles: context.roles,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch {
    return new NextResponse(null, {
      status: 401,
      headers: { "cache-control": "private, no-store" },
    });
  }
}
