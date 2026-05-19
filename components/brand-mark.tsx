import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  size?: number;
  withWordmark?: boolean;
  variant?: "default" | "on-dark";
};

export function BrandMark({
  className,
  size = 36,
  withWordmark = false,
  variant = "default",
}: BrandMarkProps) {
  const radius = size * 0.22;
  const isOnDark = variant === "on-dark";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        style={{ borderRadius: radius }}
        aria-label="AILA"
      >
        <defs>
          <linearGradient id="aila-bg" x1="0" y1="0" x2="48" y2="48">
            <stop offset="0%" stopColor="oklch(0.38 0.085 162)" />
            <stop offset="100%" stopColor="oklch(0.24 0.06 161)" />
          </linearGradient>
          <linearGradient id="aila-mark" x1="0" y1="0" x2="48" y2="48">
            <stop offset="0%" stopColor="oklch(0.86 0.175 80)" />
            <stop offset="100%" stopColor="oklch(0.74 0.17 70)" />
          </linearGradient>
        </defs>

        <rect width="48" height="48" rx="10" fill="url(#aila-bg)" />

        <path
          d="M14 34L23 14C23.4 13.1 24.6 13.1 25 14L34 34"
          stroke="url(#aila-mark)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M18.5 27H29.5"
          stroke="url(#aila-mark)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <circle cx="34" cy="34" r="2.4" fill="url(#aila-mark)" />
      </svg>

      {withWordmark && (
        <div className="flex flex-col leading-none">
          <span
            className={cn(
              "text-base font-semibold tracking-tight",
              isOnDark ? "text-sidebar-foreground" : "text-foreground"
            )}
          >
            AILA
          </span>
          <span
            className={cn(
              "mt-0.5 text-[10px] uppercase tracking-[0.18em]",
              isOnDark
                ? "text-sidebar-foreground/60"
                : "text-muted-foreground"
            )}
          >
            Lead Intelligence
          </span>
        </div>
      )}
    </div>
  );
}
