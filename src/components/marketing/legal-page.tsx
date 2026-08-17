import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { brand } from "@/config/brand";

export function LegalPage({
  title,
  summary,
  sections,
}: {
  title: string;
  summary: string;
  sections: { title: string; body: string }[];
}) {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex h-18 max-w-5xl items-center px-5">
        <Link href="/" className="flex items-center gap-2.5 font-semibold">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold">
            {brand.logoMark}
          </span>
          {brand.name}
        </Link>
        <Button asChild variant="ghost" className="ml-auto">
          <Link href="/">Back home</Link>
        </Button>
      </header>
      <article className="mx-auto max-w-3xl px-5 py-16">
        <Badge variant="warning">
          <AlertTriangle className="size-3" /> Legal review required
        </Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-4 text-lg leading-8">
          {summary}
        </p>
        <Card className="bg-warning/8 mt-8 p-5 text-sm leading-6">
          <strong>Placeholder notice:</strong> This document is an
          implementation placeholder and is not legal advice. Replace it with
          counsel-approved language before production launch.
        </Card>
        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="text-muted-foreground mt-2 leading-7">
                {section.body}
              </p>
            </section>
          ))}
        </div>
        <p className="text-muted-foreground mt-12 border-t pt-6 text-sm">
          Last placeholder revision: 17 August 2026.
        </p>
      </article>
    </main>
  );
}
