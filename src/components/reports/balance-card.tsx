"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/dashboard/skeleton";
import { cn } from "@/lib/utils";

interface BalanceData {
  amount: string;
  currency: string;
  fetched_at: string;
  source: string;
  tax_estimated: string | null;
}

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: BalanceData }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string };

function formatMoney(amount: string, currency: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(n);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function BalanceCard() {
  const t = useTranslations("Reports");
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/meta/billing-balance", {
        cache: "no-store",
      });
      const body = (await res.json()) as {
        data?: BalanceData;
        error?: string;
        code?: string;
      };
      if (res.status === 400 && body.code === "whatsapp_not_configured") {
        setState({
          status: "not_configured",
          message: body.error || t("notConfiguredBody"),
        });
        return;
      }
      if (!res.ok || !body.data) {
        setState({
          status: "error",
          message: body.error || t("errorTitle"),
        });
        return;
      }
      setState({ status: "success", data: body.data });
    } catch {
      setState({ status: "error", message: t("errorTitle") });
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{t("balanceTitle")}</CardTitle>
          <CardDescription>{t("balanceDescription")}</CardDescription>
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
          <div className="space-y-2">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        ) : null}

        {state.status === "success" ? (
          <div className="space-y-3">
            <p className="text-3xl font-semibold tracking-tight text-foreground">
              {formatMoney(state.data.amount, state.data.currency)}
            </p>
            {state.data.tax_estimated ? (
              <p className="text-sm text-muted-foreground">
                + {formatMoney(state.data.tax_estimated, state.data.currency)}{" "}
                estimated tax
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t("lastUpdated", {
                time: new Date(state.data.fetched_at).toLocaleString(),
              })}
            </p>
            <a
              href={t("metaBillingUrl")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              {t("viewInMeta")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : null}

        {state.status === "not_configured" ? (
          <div className="space-y-3">
            <p className="font-medium text-foreground">
              {t("notConfiguredTitle")}
            </p>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <Link
              href="/settings?tab=whatsapp"
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              {t("openSettings")}
            </Link>
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="space-y-3">
            <p className="font-medium text-foreground">{t("errorTitle")}</p>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void load()}
            >
              {t("retry")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
