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
    <section className="relative isolate overflow-hidden rounded-xl border border-black/80 bg-[#18181b] p-3 text-white shadow-[0_1px_2px_rgb(0_0_0/0.16)]">
      <span
        aria-hidden="true"
        className="absolute -top-10 -left-8 -z-10 size-28 rounded-full bg-white/[0.035]"
      />
      <span
        aria-hidden="true"
        className="absolute -top-14 -right-12 -z-10 size-36 rounded-full border-[24px] border-white opacity-[0.035]"
      />

      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 text-sm leading-[18px] font-semibold tracking-[-0.02em]">
            Upgrade your plan
          </h2>
          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[9px] leading-3 font-semibold tracking-[0.08em] text-white/75 uppercase">
            {planName}
          </span>
        </div>
        <p className="mt-0.5 text-[9px] leading-[13px] text-white/55">
          Unlock higher limits and more business tools.
        </p>
      </div>

      <div className="mt-3" aria-label="Product usage">
        <div className="mb-1.5 flex items-center justify-between text-[9px]">
          <span className="font-medium text-white/75">Product usage</span>
          <span className="text-white/55 tabular-nums">
            {productLimit ? `${usage}%` : "Flexible"}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#676cf4] transition-[width]"
            style={{ width: productLimit ? `${usage}%` : "0%" }}
          />
        </div>
        <p className="mt-1.5 text-[9px] text-white/60 tabular-nums">
          {productCount.toLocaleString()}
          {productLimit ? ` of ${productLimit.toLocaleString()}` : ""} products
        </p>
      </div>

      {href && (
        <Link
          href={href}
          onClick={onNavigate}
          className="mt-3 flex h-8 w-full items-center justify-center rounded-lg bg-[#5157ed] px-3 text-[10px] font-semibold text-white shadow-[0_4px_10px_rgb(81_87_237/0.22)] transition-colors hover:bg-[#5d63f3] focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#18181b] focus-visible:outline-none"
        >
          Explore upgrade options
        </Link>
      )}
    </section>
  );
}
