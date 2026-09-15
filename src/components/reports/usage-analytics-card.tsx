"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/dashboard/skeleton";

interface UsageData {
  days: number;
  fetched_at: string;
  waba_id: string;
  totals: {
    conversations: number | null;
    conversation_cost: number | null;
    message_volume: number | null;
    pricing_cost: number | null;
  };
}

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: UsageData }
  | { status: "unavailable"; message: string; wabaId?: string }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string };

function formatCount(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat(undefined).format(n);
}

function formatCost(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

export function UsageAnalyticsCard() {
  const t = useTranslations("Reports");
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/meta/usage-analytics?days=7", {
        cache: "no-store",
      });
      const raw = await res.text();
      let body: {
        data?: UsageData | null;
        error?: string;
        code?: string;
        unavailable?: { message?: string; waba_id?: string };
      } = {};
      try {
        body = raw ? (JSON.parse(raw) as typeof body) : {};
      } catch {
        setState({
          status: "error",
          message: `HTTP ${res.status}: non-JSON response`,
        });
        return;
      }

      if (res.status === 400 && body.code === "whatsapp_not_configured") {
        setState({
          status: "not_configured",
          message: body.error || t("notConfiguredBody"),
        });
        return;
      }
      if (res.ok && body.unavailable) {
        setState({
          status: "unavailable",
          message: body.unavailable.message || t("usageUnavailableBody"),
          wabaId: body.unavailable.waba_id,
        });
        return;
      }
      if (!res.ok || !body.data) {
        setState({
          status: "error",
          message:
            body.error ||
            body.unavailable?.message ||
            `HTTP ${res.status}: ${t("usageErrorTitle")}`,
        });
        return;
      }
      setState({ status: "success", data: body.data });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : t("usageErrorTitle"),
      });
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{t("usageTitle")}</CardTitle>
          <CardDescription>{t("usageDescription")}</CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={state.status === "loading"}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("refresh")}
        </Button>
      </CardHeader>
      <CardContent>
        {state.status === "loading" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : null}

        {state.status === "success" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric
                label={t("usageConversations")}
                value={formatCount(state.data.totals.conversations)}
              />
              <Metric
                label={t("usageConversationCost")}
                value={formatCost(state.data.totals.conversation_cost)}
              />
              <Metric
                label={t("usageMessageVolume")}
                value={formatCount(state.data.totals.message_volume)}
              />
              <Metric
                label={t("usagePricingCost")}
                value={formatCost(state.data.totals.pricing_cost)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("usageWindow", { days: state.data.days })} ·{" "}
              {t("lastUpdated", {
                time: new Date(state.data.fetched_at).toLocaleString(),
              })}
            </p>
          </div>
        ) : null}

        {state.status === "unavailable" ||
        state.status === "not_configured" ||
        state.status === "error" ? (
          <div className="space-y-3">
            <p className="font-medium text-foreground">
              {state.status === "not_configured"
                ? t("notConfiguredTitle")
                : state.status === "unavailable"
                  ? t("usageUnavailableTitle")
                  : t("usageErrorTitle")}
            </p>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            {state.status === "unavailable" && state.wabaId ? (
              <p className="text-xs text-muted-foreground">
                WABA ID: {state.wabaId}
              </p>
            ) : null}
            {state.status !== "not_configured" ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void load()}
              >
                {t("retry")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
