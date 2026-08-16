import Link from "next/link";
import { brand } from "@/config/brand";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_0.9fr]">
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[420px]">
          <Link
            href="/"
            className="mb-10 flex w-fit items-center gap-2.5 font-semibold"
          >
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold">
              {brand.logoMark}
            </span>
            {brand.name}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{description}</p>
          <div className="mt-8">{children}</div>
          {footer && (
            <div className="text-muted-foreground mt-7 text-center text-sm">
              {footer}
            </div>
          )}
        </div>
      </section>
      <aside className="bg-foreground text-background relative hidden overflow-hidden border-l p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="bg-primary/60 absolute -top-44 -right-44 size-[480px] rounded-full blur-3xl" />
        <div className="relative flex items-center gap-2 text-sm font-medium">
          <span className="bg-success size-2 rounded-full" /> Secure workspace
          access
        </div>
        <blockquote className="relative max-w-xl">
          <p className="text-3xl leading-snug font-medium tracking-tight">
            “We stopped reconciling five separate tools and started making
            decisions from one dependable view.”
          </p>
          <footer className="text-background/65 mt-6 text-sm">
            Avery Nelson · Northstar Goods
          </footer>
        </blockquote>
        <p className="text-background/50 relative text-xs">
          Tenant-scoped by default · Encrypted sessions · Audited sensitive
          actions
        </p>
      </aside>
    </main>
  );
}
