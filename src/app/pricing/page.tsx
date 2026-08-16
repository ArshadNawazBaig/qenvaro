import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PricingGrid } from "@/components/marketing/pricing-grid";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex h-18 max-w-7xl items-center px-5 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-semibold">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold">
            {brand.logoMark}
          </span>
          {brand.name}
        </Link>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">Start free</Link>
          </Button>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="text-primary text-sm font-semibold">
            Simple, configurable plans
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Grow without switching systems.
          </h1>
          <p className="text-muted-foreground mt-4 text-lg">
            Start with the operational essentials. Add governance, reports, and
            locations as you need them.
          </p>
        </div>
        <PricingGrid />
        <Card className="mt-12">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-semibold">
              Every plan starts with a 14-day trial.
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              No credit card required. Prices are display metadata until
              configured Stripe test Price IDs are present.
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
