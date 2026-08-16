import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { brand } from "@/config/brand";
import { findFirstWorkspaceForUser } from "@/modules/tenants/onboarding-service";
import { auth } from "@/server/auth/auth";

export const metadata: Metadata = { title: "Set up your workspace" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect("/sign-in?callbackURL=/onboarding");
  const existing = await findFirstWorkspaceForUser(session.user.id);
  if (existing) redirect(`/app/${existing.tenantSlug}`);

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[minmax(18rem,0.72fr)_minmax(42rem,1.28fr)]">
      <aside className="bg-primary text-primary-foreground relative hidden overflow-hidden p-10 lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_38%)]" />
        <Link
          href="/"
          className="relative flex items-center gap-3 font-semibold"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/15 font-bold">
            {brand.logoMark}
          </span>
          {brand.name}
        </Link>
        <div className="relative my-auto max-w-md">
          <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-white/15">
            <Sparkles className="size-5" />
          </span>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            Your operating workspace, ready in minutes.
          </h1>
          <p className="mt-4 text-sm leading-6 text-white/75">
            We’ll establish the business boundary, first store, regional rules,
            and plan limits together.
          </p>
          <ul className="mt-8 space-y-4 text-sm">
            {[
              "Organization-scoped data from the first record",
              "Owner access and store assignment created automatically",
              "A reversible 14-day trial with no card today",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <CheckCircle2 className="size-4 text-white/80" /> {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-white/65">
          <ShieldCheck className="size-4" /> Tenant identity is derived from
          your verified session.
        </p>
      </aside>
      <section className="bg-background px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 flex items-center justify-between lg:justify-end">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold lg:hidden"
            >
              <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold">
                {brand.logoMark}
              </span>
              {brand.name}
            </Link>
            <span className="text-muted-foreground text-xs">
              Signed in as {session.user.email}
            </span>
          </div>
          <div className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight">
              Build your workspace
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              These choices establish your tenant, first location, and initial
              operating limits.
            </p>
          </div>
          <OnboardingForm />
        </div>
      </section>
    </main>
  );
}
