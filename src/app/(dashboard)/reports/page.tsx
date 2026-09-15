"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { canEditSettings } from "@/lib/auth/roles";
import { BalanceCard } from "@/components/reports/balance-card";

export default function ReportsPage() {
  const t = useTranslations("Reports");
  const router = useRouter();
  const { accountRole, profileLoading } = useAuth();

  useEffect(() => {
    if (profileLoading) return;
    if (!accountRole || !canEditSettings(accountRole)) {
      router.replace("/dashboard");
    }
  }, [accountRole, profileLoading, router]);

  if (profileLoading || !accountRole || !canEditSettings(accountRole)) {
    return (
      <div className="p-6 text-sm text-muted-foreground">{t("loading")}</div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <BalanceCard />

      <p className="text-sm text-muted-foreground">{t("comingSoon")}</p>
    </div>
  );
}
