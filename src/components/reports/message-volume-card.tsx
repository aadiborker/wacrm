"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CATEGORY_KEYS,
  formatDdMmYyyy,
  type CategoryBreakdown,
  type OutboundMessageCounts,
  type TemplateCategoryKey,
} from "@/lib/reports/message-volume";

type ResultState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success";
      from: string;
      to: string;
      truncated: boolean;
      counts: OutboundMessageCounts;
      by_category: CategoryBreakdown;
    }
  | { status: "error"; message: string };

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const to = formatDdMmYyyy(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
  );
  const weekAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const from = formatDdMmYyyy(
    weekAgo.getFullYear(),
    weekAgo.getMonth() + 1,
    weekAgo.getDate(),
  );
  return { from, to };
}

function formatCount(n: number): string {
  return new Intl.NumberFormat(undefined).format(n);
}

const CATEGORY_LABEL_KEY: Record<TemplateCategoryKey, string> = {
  Marketing: "categoryMarketing",
  Utility: "categoryUtility",
  Authentication: "categoryAuthentication",
  Session: "categorySession",
  Unknown: "categoryUnknown",
};

const CATEGORY_HINT_KEY: Record<TemplateCategoryKey, string> = {
  Marketing: "categoryMarketingHint",
  Utility: "categoryUtilityHint",
  Authentication: "categoryAuthenticationHint",
  Session: "categorySessionHint",
  Unknown: "categoryUnknownHint",
};

export function MessageVolumeCard() {
  const t = useTranslations("Reports");
  const defaults = defaultRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [state, setState] = useState<ResultState>({ status: "idle" });

  const run = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/reports/messages?${params}`, {
        cache: "no-store",
      });
      const body = (await res.json()) as {
        data?: {
          from: string;
          to: string;
          truncated: boolean;
          counts: OutboundMessageCounts;
          by_category: CategoryBreakdown;
        };
        error?: string;
      };
      if (!res.ok || !body.data) {
        setState({
          status: "error",
          message: body.error || t("volumeError"),
        });
        return;
      }
      setState({
        status: "success",
        from: body.data.from,
        to: body.data.to,
        truncated: body.data.truncated,
        counts: body.data.counts,
        by_category: body.data.by_category,
      });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : t("volumeError"),
      });
    }
  }, [from, to, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("volumeTitle")}</CardTitle>
        <CardDescription>{t("volumeDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="reports-from">{t("volumeFrom")}</Label>
            <Input
              id="reports-from"
              inputMode="numeric"
              placeholder="DD/MM/YYYY"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-describedby="reports-date-hint"
            />
          </div>
          <div className="grid flex-1 gap-2">
            <Label htmlFor="reports-to">{t("volumeTo")}</Label>
            <Input
              id="reports-to"
              inputMode="numeric"
              placeholder="DD/MM/YYYY"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button
            type="button"
            onClick={() => void run()}
            disabled={state.status === "loading"}
          >
            {state.status === "loading" ? t("volumeLoading") : t("volumeRun")}
          </Button>
        </div>
        <p id="reports-date-hint" className="text-xs text-muted-foreground">
          {t("volumeDateHint")}
        </p>

        {state.status === "error" ? (
          <p className="text-sm text-destructive">{state.message}</p>
        ) : null}

        {state.status === "success" ? (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              {t("volumeRangeLabel", { from: state.from, to: state.to })}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Metric
                label={t("volumeTotal")}
                hint={t("volumeTotalHint")}
                value={formatCount(state.counts.total)}
                emphasize
              />
              <Metric
                label={t("volumeDelivered")}
                hint={t("volumeDeliveredHint")}
                value={formatCount(state.counts.delivered_or_read)}
                emphasize
              />
              <Metric
                label={t("volumeSent")}
                hint={t("volumeSentHint")}
                value={formatCount(state.counts.sent)}
              />
              <Metric
                label={t("volumeDeliveredOnly")}
                hint={t("volumeDeliveredOnlyHint")}
                value={formatCount(state.counts.delivered)}
              />
              <Metric
                label={t("volumeRead")}
                hint={t("volumeReadHint")}
                value={formatCount(state.counts.read)}
              />
              <Metric
                label={t("volumeFailed")}
                hint={t("volumeFailedHint")}
                value={formatCount(state.counts.failed)}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">
                {t("categoryTitle")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("categoryDescription")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CATEGORY_KEYS.filter(
                  (key) => state.by_category[key].total > 0 || key === "Marketing" || key === "Utility",
                ).map((key) => {
                  const bucket = state.by_category[key];
                  return (
                    <div
                      key={key}
                      className="rounded-lg border border-border bg-muted/30 px-3 py-3"
                    >
                      <p className="text-xs text-muted-foreground">
                        {t(CATEGORY_LABEL_KEY[key])}
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                        {formatCount(bucket.total)}
                      </p>
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                        {t(CATEGORY_HINT_KEY[key])}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t("categoryDeliveredLine", {
                          count: formatCount(bucket.delivered_or_read),
                        })}
                        {" · "}
                        {t("categoryFailedLine", {
                          count: formatCount(bucket.failed),
                        })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {state.truncated ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t("volumeTruncated")}
              </p>
            ) : null}
          </div>
        ) : null}

        {state.status === "idle" ? (
          <p className="text-sm text-muted-foreground">{t("volumeIdle")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  hint,
  value,
  emphasize,
}: {
  label: string;
  hint: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={
        emphasize
          ? "rounded-lg border border-primary/30 bg-primary/5 px-3 py-3"
          : "rounded-lg border border-border bg-muted/30 px-3 py-3"
      }
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
