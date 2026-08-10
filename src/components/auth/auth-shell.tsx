import type { ReactNode } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

/**
 * Shared chrome for login / signup / forgot-password.
 * Brand-first: ReplyFlow wordmark is the hero signal; teal atmosphere
 * is fixed (not the user's accent picker) so first impression stays
 * ReplyFlow rather than a generic purple admin card.
 */
export function AuthShell({
  children,
  subtitle,
}: {
  children: ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-background"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.62_0.16_162/0.22),transparent),radial-gradient(ellipse_60%_40%_at_100%_100%,oklch(0.7_0.12_195/0.12),transparent),radial-gradient(ellipse_50%_30%_at_0%_80%,oklch(0.55_0.1_162/0.08),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,oklch(0.5_0.01_260/0.06)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.5_0.01_260/0.06)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link
            href="/login"
            className="group flex flex-col items-center gap-3 outline-none"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[oklch(0.62_0.16_162)] text-[oklch(0.16_0.02_162)] shadow-[0_12px_40px_-12px_oklch(0.62_0.16_162/0.55)] transition-transform duration-300 group-hover:scale-[1.03]">
              <MessageSquare className="h-6 w-6" strokeWidth={2.25} />
            </div>
            <span className="text-3xl font-semibold tracking-tight text-foreground">
              ReplyFlow
            </span>
          </Link>
          {subtitle ? (
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
