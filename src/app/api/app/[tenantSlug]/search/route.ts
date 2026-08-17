import type { NextRequest } from "next/server";
import { z } from "zod";
import { globalSearchQuerySchema } from "@/modules/search/schemas";
import { logger } from "@/server/logging/logger";
import { GlobalSearchRepository } from "@/server/repositories/global-search";
import { TenantNotFoundError } from "@/server/tenancy/context";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  try {
    const { q } = globalSearchQuerySchema.parse({
      q: request.nextUrl.searchParams.get("q"),
    });
    const context = await requireTenantContext(tenantSlug);
    const results = await new GlobalSearchRepository().search(context, q);
    return Response.json(
      { ok: true, results },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ ok: true, results: [] }, { status: 200 });
    if (error instanceof TenantNotFoundError)
      return Response.json(
        { ok: false, message: "Workspace not found." },
        { status: 404 },
      );
    logger.warn({ event: "global_search_failed", tenantSlug, err: error });
    return Response.json(
      { ok: false, message: "Search is temporarily unavailable." },
      { status: 500 },
    );
  }
}
