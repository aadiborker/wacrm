"use client";

/**
 * Idle-reset control — how long a customer can sit without advancing
 * before the active run times out and they can trigger the flow again.
 */

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { resolveIdleTimeoutMinutes } from "@/lib/flows/fallback";
import {
  DEFAULT_FALLBACK_POLICY,
  type FlowFallbackPolicy,
} from "@/lib/flows/types";

const PRESETS = [15, 30, 60, 120] as const;

export function IdleResetField({
  policy,
  onChange,
  className,
}: {
  policy: FlowFallbackPolicy;
  onChange: (next: FlowFallbackPolicy) => void;
  className?: string;
}) {
  const t = useTranslations("Flows.builder");
  const minutes = resolveIdleTimeoutMinutes(policy);
  const usingCustomIdle =
    typeof policy.on_idle_minutes === "number" && policy.on_idle_minutes > 0;

  return (
    <div className={className}>
      <label className="text-muted-foreground mb-1 block text-xs font-medium">
        {t("idleResetLabel")}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          min={1}
          max={10080}
          step={1}
          value={minutes}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n) || n <= 0) return;
            onChange({
              ...policy,
              on_idle_minutes: Math.min(10080, Math.floor(n)),
            });
          }}
          className="bg-muted w-24"
          aria-label={t("idleResetLabel")}
        />
        <span className="text-muted-foreground text-xs">{t("idleResetUnit")}</span>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() =>
                onChange({ ...policy, on_idle_minutes: p })
              }
              className={
                usingCustomIdle && policy.on_idle_minutes === p
                  ? "rounded-md bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary"
                  : "rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              }
            >
              {p}m
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                ...policy,
                on_idle_minutes: null,
                on_timeout_hours:
                  policy.on_timeout_hours ||
                  DEFAULT_FALLBACK_POLICY.on_timeout_hours,
              })
            }
            className={
              !usingCustomIdle
                ? "rounded-md bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary"
                : "rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            }
            title={t("idleResetDefaultHint")}
          >
            {t("idleResetDefault")}
          </button>
        </div>
      </div>
      <p className="text-muted-foreground mt-1.5 text-[11px] leading-relaxed">
        {t("idleResetHelp")}
      </p>
    </div>
  );
}
