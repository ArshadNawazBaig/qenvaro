import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth/auth";
import { getDatabase } from "@/server/db/client";

const recoveryPaths = new Set(["settings/billing", "settings/security"]);

export async function proxy(request: NextRequest) {
  const parts = request.nextUrl.pathname.split("/").filter(Boolean);
  const tenantSlug = parts[1];
  const tenantPath = parts.slice(2).join("/");
  if (!tenantSlug || recoveryPaths.has(tenantPath)) return NextResponse.next();
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.next();
    const database = await getDatabase();
    const profile = await database
      .collection<{ tenantId: string; billingStatus?: string }>(
        "tenantProfiles",
      )
      .findOne(
        { slug: tenantSlug },
        { projection: { tenantId: 1, billingStatus: 1 } },
      );
    if (!profile || profile.billingStatus !== "suspended")
      return NextResponse.next();
    const membership = await database
      .collection("member")
      .findOne(
        { organizationId: profile.tenantId, userId: session.user.id },
        { projection: { _id: 1 } },
      );
    if (!membership) return NextResponse.next();
    const destination = request.nextUrl.clone();
    destination.pathname = `/app/${tenantSlug}/settings/billing`;
    destination.search = "?access=suspended";
    return NextResponse.redirect(destination);
  } catch {
    return NextResponse.next();
  }
}

export const config = { matcher: ["/app/:tenantSlug/:path*"] };
