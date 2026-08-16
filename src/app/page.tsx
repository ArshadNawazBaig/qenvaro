import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  Check,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { brand } from "@/config/brand";

export default function HomePage() {
  return (
    <main className="bg-background min-h-screen overflow-hidden">
      <header className="mx-auto flex h-18 max-w-7xl items-center px-5 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-semibold">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold">
            {brand.logoMark}
          </span>
          {brand.name}
        </Link>
        <nav
          className="text-muted-foreground ml-10 hidden items-center gap-7 text-sm md:flex"
          aria-label="Public navigation"
        >
          <a href="#features" className="hover:text-foreground">
            Features
          </a>
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <a href="#security" className="hover:text-foreground">
            Security
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/app/northstar-goods">
              Explore demo <ArrowRight />
            </Link>
          </Button>
        </div>
      </header>
      <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-28">
        <div className="bg-primary/10 pointer-events-none absolute -top-64 -right-64 size-[620px] rounded-full blur-3xl" />
        <div className="relative">
          <Badge variant="info" className="mb-5">
            <Sparkles className="size-3" /> Built for ambitious operators
          </Badge>
          <h1 className="max-w-2xl text-5xl leading-[1.06] font-semibold tracking-[-0.04em] sm:text-6xl">
            Every store.
            <br />
            <span className="text-primary">One clear view.</span>
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-8">
            {brand.description} Keep decisions fast without losing control of
            the details.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/sign-up">
                Start 14-day trial <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/app/northstar-goods">Open live preview</Link>
            </Button>
          </div>
          <div className="text-muted-foreground mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {["No credit card", "Guided setup", "Cancel anytime"].map(
              (item) => (
                <span key={item} className="flex items-center gap-2">
                  <Check className="text-success-foreground size-4" />
                  {item}
                </span>
              ),
            )}
          </div>
        </div>
        <div className="relative">
          <div className="from-primary/12 to-success/15 absolute -inset-8 rounded-[2rem] bg-gradient-to-br via-transparent blur-2xl" />
          <div className="bg-card relative overflow-hidden rounded-2xl border p-3 shadow-[0_24px_70px_rgb(35_30_25/0.12)]">
            <div className="flex items-center gap-1.5 border-b px-2 pb-3">
              <span className="bg-destructive/50 size-2.5 rounded-full" />
              <span className="bg-warning/70 size-2.5 rounded-full" />
              <span className="bg-success/60 size-2.5 rounded-full" />
              <span className="bg-muted ml-4 h-6 w-44 rounded-md" />
            </div>
            <div className="grid grid-cols-[108px_1fr] gap-4 pt-3">
              <div className="space-y-2 border-r pr-3">
                {["w-20", "w-16", "w-20", "w-14", "w-20", "w-16"].map(
                  (width, index) => (
                    <div
                      key={index}
                      className={`bg-muted h-7 rounded-md ${width} ${index === 1 ? "bg-accent" : ""}`}
                    />
                  ),
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="bg-muted h-3 w-16 rounded" />
                    <div className="bg-foreground/80 mt-2 h-6 w-32 rounded" />
                  </div>
                  <div className="bg-primary h-8 w-24 rounded-md" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["$228K", "1,284", "39.0%"].map((value) => (
                    <div key={value} className="rounded-lg border p-3">
                      <div className="bg-muted h-2 w-12 rounded" />
                      <p className="mt-2 text-base font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="h-36 rounded-lg border bg-[linear-gradient(to_top_right,transparent_48%,var(--chart-1)_49%,var(--chart-1)_51%,transparent_52%)] opacity-70" />
                <div className="space-y-2">
                  {[1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-3 rounded-lg border p-2"
                    >
                      <div className="bg-accent size-8 rounded-md" />
                      <div className="bg-muted h-2 w-24 rounded" />
                      <div className="bg-success/35 ml-auto h-5 w-14 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="features" className="bg-card/60 border-y">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 py-20 md:grid-cols-3 lg:px-8">
          {[
            {
              icon: Building2,
              title: "Multi-store by design",
              text: "Scoped inventory, staff, and performance for every authorized location.",
            },
            {
              icon: Boxes,
              title: "Operations in sync",
              text: "Catalog, stock, sales, purchasing, people, and reporting share one source of truth.",
            },
            {
              icon: ShieldCheck,
              title: "Control without friction",
              text: "Tenant isolation, fine-grained permissions, audit history, and protected sensitive data.",
            },
          ].map((feature) => (
            <Card key={feature.title}>
              <CardContent>
                <div className="bg-accent text-accent-foreground mb-5 flex size-10 items-center justify-center rounded-lg">
                  <feature.icon className="size-5" />
                </div>
                <h2 className="font-semibold">{feature.title}</h2>
                <p className="text-muted-foreground mt-2 text-sm leading-6">
                  {feature.text}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section
        id="security"
        className="mx-auto flex max-w-7xl flex-col items-center px-5 py-20 text-center lg:px-8"
      >
        <BarChart3 className="text-primary mb-5 size-8" />
        <h2 className="text-3xl font-semibold tracking-tight">
          Clarity that compounds.
        </h2>
        <p className="text-muted-foreground mt-3 max-w-2xl">
          Qenvaro is being built in complete, secure vertical slices. Explore
          the working catalog experience while the broader operations roadmap
          advances.
        </p>
      </section>
    </main>
  );
}
