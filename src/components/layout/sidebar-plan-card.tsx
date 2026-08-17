import Link from "next/link";

interface SidebarPlanCardProps {
  href?: string;
  planName: string;
  productCount: number;
  productLimit: number | null;
  onNavigate?: () => void;
}

export function SidebarPlanCard({
  href,
  planName,
  productCount,
  productLimit,
  onNavigate,
}: SidebarPlanCardProps) {
  const usage = productLimit
    ? Math.min(100, Math.round((productCount / productLimit) * 100))
    : 0;

  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-white/[0.08] bg-[#191a1f] p-3.5 text-white shadow-[0_8px_24px_rgb(15_23_42/0.12)]">
      <span
        aria-hidden="true"
        className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
      />
      <span
        aria-hidden="true"
        className="absolute -top-20 -right-16 -z-10 size-44 rounded-full bg-[#6266f4]/10 blur-2xl"
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm leading-[18px] font-semibold tracking-[-0.02em]">
            Upgrade your plan
          </h2>
          <p className="mt-1 text-[10px] leading-[14px] text-white/55">
            Get higher limits and advanced business tools.
          </p>
        </div>
        <span className="mt-0.5 shrink-0 rounded-full border border-white/[0.08] bg-white/[0.07] px-1.5 py-1 text-[8px] leading-none font-semibold tracking-[0.1em] text-white/70 uppercase">
          {planName}
        </span>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[10px] leading-none">
          <span className="font-medium text-white/75">Product usage</span>
          <span className="text-white/50 tabular-nums">
            {productLimit ? `${usage}%` : "Flexible"}
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-white/[0.09]"
          role="progressbar"
          aria-label="Product usage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={productLimit ? usage : undefined}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#696df6] to-[#8185ff] transition-[width] duration-300"
            style={{ width: productLimit ? `${usage}%` : "0%" }}
          />
        </div>
        <p className="mt-1.5 text-[9px] text-white/45 tabular-nums">
          {productCount.toLocaleString()}
          {productLimit ? ` of ${productLimit.toLocaleString()}` : ""} products
        </p>
      </div>

      {href && (
        <Link
          href={href}
          onClick={onNavigate}
          className="mt-3 flex h-8 w-full items-center justify-center rounded-lg bg-[#565af2] px-3 text-[10px] font-semibold text-white shadow-[0_5px_14px_rgb(86_90_242/0.2)] transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-[#6165f5] hover:shadow-[0_7px_18px_rgb(86_90_242/0.24)] focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#191a1f] focus-visible:outline-none active:translate-y-0"
        >
          View upgrade options
        </Link>
      )}
    </section>
  );
}
