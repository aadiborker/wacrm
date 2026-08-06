"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";

/**
 * Workspace company name — shown in the sidebar brand and set at
 * signup. Admin+ can rename via PATCH /api/account.
 */
export function CompanySettings() {
  const {
    account,
    canEditSettings,
    profileLoading,
    refreshProfile,
  } = useAuth();
  const t = useTranslations("Settings.company");

  const [name, setName] = useState(account?.name ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(account?.name ?? "");
  }, [account?.name]);

  const dirty = name.trim() !== (account?.name ?? "").trim();

  async function handleSave() {
    if (!canEditSettings || !dirty) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("emptyError"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? t("saveFailed"));
      }
      await refreshProfile();
      toast.success(t("saveSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t("title")} description={t("description")} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Building2 className="h-4 w-4 text-primary" />
            {t("cardTitle")}
          </CardTitle>
          <CardDescription>{t("cardDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">{t("nameLabel")}</Label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              disabled={profileLoading || !canEditSettings || saving}
              maxLength={80}
              className="bg-muted"
            />
            {!canEditSettings && (
              <p className="text-xs text-muted-foreground">{t("adminOnly")}</p>
            )}
          </div>
          {canEditSettings && (
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={!dirty || saving || profileLoading}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {t("save")}
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
