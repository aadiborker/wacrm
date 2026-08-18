"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

/** Footer links shown on login / signup / forgot-password. */
export function AuthLegalLinks() {
  const t = useTranslations("Legal");

  return (
    <p className="mt-6 text-center text-xs text-muted-foreground">
      <Link href="/privacy" className="hover:text-foreground hover:underline">
        {t("privacyPolicy")}
      </Link>
    </p>
  );
}
