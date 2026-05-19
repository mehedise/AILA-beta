import { Sparkles, ShieldCheck, Workflow } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

type AuthShellProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

const HIGHLIGHTS = [
  {
    icon: Sparkles,
    title: "AI extraction & classification",
    body: "OpenAI structures contacts and tags every lead with GICS 2023 sector → sub-industry.",
  },
  {
    icon: Workflow,
    title: "Batch in, reviewed out",
    body: "Upload Excel or PDF business cards. Review, approve, deduplicate—then export.",
  },
  {
    icon: ShieldCheck,
    title: "Field-level confidence",
    body: "Every field is scored and vision-verified, so you know what to trust at a glance.",
  },
];

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
}: AuthShellProps) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 15% 10%, color-mix(in oklab, var(--brand-marigold) 22%, transparent) 0%, transparent 55%), radial-gradient(circle at 90% 90%, color-mix(in oklab, var(--brand-marigold) 14%, transparent) 0%, transparent 50%)",
          }}
        />
        <div className="relative">
          <BrandMark withWordmark size={40} variant="on-dark" />
        </div>

        <div className="relative max-w-md space-y-6">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-brand-marigold">
            AILA · Lead Intelligence
          </p>
          <h1 className="text-3xl font-semibold leading-tight">
            Turn messy contacts into{" "}
            <span className="brand-gradient-text">structured, classified leads</span>.
          </h1>
          <ul className="space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span
                  className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{
                    background:
                      "color-mix(in oklab, var(--brand-marigold) 22%, transparent)",
                    color: "var(--brand-marigold)",
                  }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold">{title}</div>
                  <div className="text-sm text-sidebar-foreground/75">
                    {body}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-xs text-sidebar-foreground/55">
          © {new Date().getFullYear()} AILA · Beta
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center lg:text-left">
            {eyebrow && (
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {eyebrow}
              </p>
            )}
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>

          <div className="rounded-lg border border-border/70 bg-card/95 p-2 shadow-[0_8px_30px_-12px_rgba(15,40,30,0.18)] sm:p-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
