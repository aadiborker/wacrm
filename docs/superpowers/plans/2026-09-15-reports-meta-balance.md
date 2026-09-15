# Reports — Meta Current Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a company-scoped `/reports` page (owner/admin) that live-fetches Meta WhatsApp current balance via that account’s `whatsapp_config` and shows it on a Current balance card.

**Architecture:** Pure Meta mapping helpers in `src/lib/whatsapp/billing-balance.ts` (unit-tested); server route `GET /api/meta/billing-balance` decrypts the account token, calls Graph API, returns JSON without secrets; client Reports page + balance card call the API. Role gate uses existing `requireRole("admin")` / `canEditSettings`.

**Tech Stack:** Next.js App Router, Supabase SSR auth, Vitest, next-intl, existing `meta-api` Graph base URL pattern (`v21.0`), `decrypt` from `@/lib/whatsapp/encryption`.

**Spec:** `docs/superpowers/specs/2026-09-15-reports-meta-balance-design.md`

## Global Constraints

- Audience: **current company only** (session `account_id`).
- Roles: **owner + admin only** (`requireRole("admin")`, UI via `canEditSettings`).
- Never invent amounts or estimated tax; omit tax unless Meta returns it.
- Never return `access_token` (or any secret) in API JSON or client logs.
- Prefer `credit_available` on `WHATSAPP_BUSINESS` extended credit line.
- Try existing `whatsapp_config` token + `waba_id` first; no new Settings Business ID fields in v1.
- No DB cache / cron in v1.

## File map

| File | Responsibility |
| --- | --- |
| `src/lib/whatsapp/billing-balance.ts` | Types, errors, pick credit line, map to balance DTO, Graph fetch helpers |
| `src/lib/whatsapp/billing-balance.test.ts` | Unit tests for mapping + fetch (mocked `fetch`) |
| `src/app/api/meta/billing-balance/route.ts` | Auth, load config, decrypt, call helper, JSON response |
| `src/components/reports/balance-card.tsx` | Client card: loading / success / error / not configured |
| `src/app/(dashboard)/reports/page.tsx` | Reports hub page |
| `src/components/layout/sidebar.tsx` | Reports nav item; hide unless `canEditSettings` |
| `src/components/layout/header.tsx` | Title key for `/reports` |
| `src/middleware.ts` | Protect `/reports` for unauthenticated users |
| `messages/en.json` | `Sidebar.reports`, `Header.reports`, `Reports.*` strings |

---

### Task 1: Billing balance mapper + Graph helpers

**Files:**
- Create: `src/lib/whatsapp/billing-balance.ts`
- Test: `src/lib/whatsapp/billing-balance.test.ts`

**Interfaces:**
- Produces:
  - `BillingBalance` — `{ amount: string; currency: string; fetched_at: string; source: string; tax_estimated: string | null }`
  - `BillingBalanceError` — `class` with `code: "whatsapp_not_configured" | "token_decrypt_failed" | "meta_permission" | "meta_upstream" | "no_credit_line"` and `message: string`
  - `pickWhatsAppCreditLine(lines: ExtendedCreditLine[]): ExtendedCreditLine | null`
  - `mapCreditLineToBalance(line: ExtendedCreditLine, currencyFallback?: string | null): BillingBalance`
  - `fetchWhatsAppBillingBalance(args: { accessToken: string; wabaId: string }): Promise<BillingBalance>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/whatsapp/billing-balance.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BillingBalanceError,
  fetchWhatsAppBillingBalance,
  mapCreditLineToBalance,
  pickWhatsAppCreditLine,
} from "./billing-balance";

describe("pickWhatsAppCreditLine", () => {
  it("prefers WHATSAPP_BUSINESS over other credit types", () => {
    const picked = pickWhatsAppCreditLine([
      {
        id: "1",
        credit_type: "ADS_BUSINESS",
        credit_available: { amount: "9.00", currency: "USD" },
      },
      {
        id: "2",
        credit_type: "WHATSAPP_BUSINESS",
        credit_available: { amount: "38.84", currency: "INR" },
      },
    ]);
    expect(picked?.id).toBe("2");
  });

  it("returns null when no lines", () => {
    expect(pickWhatsAppCreditLine([])).toBeNull();
  });
});

describe("mapCreditLineToBalance", () => {
  it("maps credit_available to BillingBalance", () => {
    const bal = mapCreditLineToBalance({
      id: "2",
      credit_type: "WHATSAPP_BUSINESS",
      credit_available: { amount: "38.84", currency: "INR" },
    });
    expect(bal.amount).toBe("38.84");
    expect(bal.currency).toBe("INR");
    expect(bal.source).toBe("extendedcredits.credit_available");
    expect(bal.tax_estimated).toBeNull();
    expect(bal.fetched_at).toMatch(/^\d{4}-/);
  });

  it("throws no_credit_line when credit_available missing", () => {
    expect(() =>
      mapCreditLineToBalance({
        id: "2",
        credit_type: "WHATSAPP_BUSINESS",
      }),
    ).toThrow(BillingBalanceError);
  });
});

describe("fetchWhatsAppBillingBalance", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves WABA owner business then extendedcredits", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "waba-1",
            currency: "INR",
            owner_business_info: { id: "biz-1", name: "Acme" },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "credit-1",
                credit_type: "WHATSAPP_BUSINESS",
                credit_available: { amount: "38.84", currency: "INR" },
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const result = await fetchWhatsAppBillingBalance({
      accessToken: "tok",
      wabaId: "waba-1",
    });
    expect(result.amount).toBe("38.84");
    expect(result.currency).toBe("INR");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstUrl).toContain("/waba-1?");
    expect(firstUrl).toContain("owner_business_info");
  });

  it("maps Meta OAuth/permission errors to meta_permission", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: "(#200) Requires business_management", code: 200 },
        }),
        { status: 403 },
      ),
    );
    await expect(
      fetchWhatsAppBillingBalance({ accessToken: "tok", wabaId: "waba-1" }),
    ).rejects.toMatchObject({ code: "meta_permission" });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/lib/whatsapp/billing-balance.test.ts`

Expected: FAIL (module not found / exports missing).

- [ ] **Step 3: Implement `billing-balance.ts`**

```ts
/**
 * Meta WhatsApp billing balance helpers.
 *
 * Maps Extended Credits `credit_available` for WHATSAPP_BUSINESS lines
 * to the Reports "Current balance" card. Token never leaves the server.
 */

const META_API_VERSION = "v21.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export type BillingBalanceErrorCode =
  | "whatsapp_not_configured"
  | "token_decrypt_failed"
  | "meta_permission"
  | "meta_upstream"
  | "no_credit_line";

export class BillingBalanceError extends Error {
  readonly code: BillingBalanceErrorCode;
  constructor(code: BillingBalanceErrorCode, message: string) {
    super(message);
    this.name = "BillingBalanceError";
    this.code = code;
  }
}

export interface CurrencyAmount {
  amount?: string;
  currency?: string;
  amount_in_hundredths?: string;
}

export interface ExtendedCreditLine {
  id: string;
  credit_type?: string;
  balance?: CurrencyAmount;
  credit_available?: CurrencyAmount;
  max_balance?: CurrencyAmount;
}

export interface BillingBalance {
  amount: string;
  currency: string;
  fetched_at: string;
  source: string;
  tax_estimated: string | null;
}

export function pickWhatsAppCreditLine(
  lines: ExtendedCreditLine[],
): ExtendedCreditLine | null {
  if (!lines.length) return null;
  const wa = lines.find((l) => l.credit_type === "WHATSAPP_BUSINESS");
  return wa ?? lines[0] ?? null;
}

export function mapCreditLineToBalance(
  line: ExtendedCreditLine,
  currencyFallback?: string | null,
): BillingBalance {
  const available = line.credit_available;
  if (!available?.amount) {
    throw new BillingBalanceError(
      "no_credit_line",
      "Meta did not return a WhatsApp credit available balance for this business.",
    );
  }
  return {
    amount: available.amount,
    currency: available.currency || currencyFallback || "USD",
    fetched_at: new Date().toISOString(),
    source: "extendedcredits.credit_available",
    tax_estimated: null,
  };
}

interface MetaErrorBody {
  error?: { message?: string; code?: number; type?: string };
}

async function readMetaJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function throwFromMetaResponse(response: Response, body: unknown): never {
  const err = (body as MetaErrorBody | null)?.error;
  const message =
    err?.message ||
    `Meta request failed with HTTP ${response.status}`;
  const permission =
    response.status === 401 ||
    response.status === 403 ||
    /permission|oauth|business_management|#10|#200/i.test(message);
  throw new BillingBalanceError(
    permission ? "meta_permission" : "meta_upstream",
    message,
  );
}

export async function fetchWhatsAppBillingBalance(args: {
  accessToken: string;
  wabaId: string;
}): Promise<BillingBalance> {
  const { accessToken, wabaId } = args;
  const wabaUrl =
    `${META_API_BASE}/${encodeURIComponent(wabaId)}` +
    `?fields=owner_business_info,currency,primary_funding_id`;

  const wabaRes = await fetch(wabaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const wabaBody = await readMetaJson(wabaRes);
  if (!wabaRes.ok) throwFromMetaResponse(wabaRes, wabaBody);

  const waba = wabaBody as {
    currency?: string;
    owner_business_info?: { id?: string };
  };
  const businessId = waba.owner_business_info?.id;
  if (!businessId) {
    throw new BillingBalanceError(
      "meta_permission",
      "Could not resolve Meta Business ID from this WhatsApp account. The access token may lack business permissions.",
    );
  }

  const creditsUrl =
    `${META_API_BASE}/${encodeURIComponent(businessId)}/extendedcredits` +
    `?fields=id,credit_type,balance,credit_available,max_balance`;

  const creditsRes = await fetch(creditsUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const creditsBody = await readMetaJson(creditsRes);
  if (!creditsRes.ok) throwFromMetaResponse(creditsRes, creditsBody);

  const lines =
    ((creditsBody as { data?: ExtendedCreditLine[] })?.data ?? []) as ExtendedCreditLine[];
  const picked = pickWhatsAppCreditLine(lines);
  if (!picked) {
    throw new BillingBalanceError(
      "no_credit_line",
      "No Meta extended credit line found for this business.",
    );
  }
  return mapCreditLineToBalance(picked, waba.currency ?? null);
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/lib/whatsapp/billing-balance.test.ts`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/billing-balance.ts src/lib/whatsapp/billing-balance.test.ts
git commit -m "Add Meta WhatsApp billing balance helpers."
```

---

### Task 2: `GET /api/meta/billing-balance` route

**Files:**
- Create: `src/app/api/meta/billing-balance/route.ts`

**Interfaces:**
- Consumes: `requireRole`, `toErrorResponse` from `@/lib/auth/account`; `decrypt` from `@/lib/whatsapp/encryption`; `fetchWhatsAppBillingBalance`, `BillingBalanceError` from `@/lib/whatsapp/billing-balance`
- Produces: `GET` → `200 { data: BillingBalance }` or structured error JSON `{ error: string, code?: string }`

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { decrypt } from "@/lib/whatsapp/encryption";
import {
  BillingBalanceError,
  fetchWhatsAppBillingBalance,
} from "@/lib/whatsapp/billing-balance";

/**
 * GET /api/meta/billing-balance
 *
 * Live Meta WhatsApp current balance for the caller's account.
 * Admin+ only. Never returns the access token.
 */
export async function GET() {
  try {
    const { supabase, accountId } = await requireRole("admin");

    const { data: config, error } = await supabase
      .from("whatsapp_config")
      .select("waba_id, access_token")
      .eq("account_id", accountId)
      .maybeSingle();

    if (error) {
      console.error("[meta/billing-balance] config fetch:", error);
      return NextResponse.json(
        { error: "Failed to load WhatsApp configuration", code: "internal" },
        { status: 500 },
      );
    }

    if (!config?.waba_id || !config.access_token) {
      return NextResponse.json(
        {
          error:
            "WhatsApp is not fully configured. Add WABA ID and access token in Settings → WhatsApp.",
          code: "whatsapp_not_configured",
        },
        { status: 400 },
      );
    }

    let accessToken: string;
    try {
      accessToken = decrypt(config.access_token);
    } catch (err) {
      console.error("[meta/billing-balance] token decrypt failed:", err);
      return NextResponse.json(
        {
          error:
            "Stored access token cannot be decrypted. Re-save the WhatsApp token in Settings.",
          code: "token_decrypt_failed",
        },
        { status: 400 },
      );
    }

    const data = await fetchWhatsAppBillingBalance({
      accessToken,
      wabaId: config.waba_id,
    });

    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof BillingBalanceError) {
      const status =
        err.code === "meta_permission" || err.code === "no_credit_line"
          ? 502
          : 502;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status },
      );
    }
    return toErrorResponse(err);
  }
}
```

- [ ] **Step 2: Typecheck the route**

Run: `npx tsc --noEmit --pretty false 2>&1 | Select-String -Pattern "billing-balance" -SimpleMatch`

Expected: no matches (no type errors in this file). Full `npm run typecheck` may still show unrelated pre-existing issues — fix only errors introduced by this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meta/billing-balance/route.ts
git commit -m "Add billing-balance API for Reports."
```

---

### Task 3: i18n + middleware + sidebar + header

**Files:**
- Modify: `messages/en.json`
- Modify: `src/middleware.ts`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/header.tsx`

**Interfaces:**
- Consumes: `canEditSettings` from `@/lib/auth/roles`; `accountRole` from `useAuth`
- Produces: nav link `/reports` visible only when `accountRole` passes `canEditSettings`

- [ ] **Step 1: Add English strings**

In `messages/en.json`:

Under `Sidebar`, add `"reports": "Reports"` (near `dashboard`).

Under `Header`, add `"reports": "Reports"`.

Add new top-level namespace:

```json
"Reports": {
  "title": "Reports",
  "subtitle": "Billing and usage for this workspace",
  "comingSoon": "More reports coming soon",
  "balanceTitle": "Current balance",
  "balanceDescription": "WhatsApp prepaid / credit available from Meta for this company",
  "lastUpdated": "Updated {time}",
  "refresh": "Refresh",
  "loading": "Loading balance…",
  "notConfiguredTitle": "WhatsApp not configured",
  "notConfiguredBody": "Connect WhatsApp in Settings to load Meta balance.",
  "openSettings": "Open WhatsApp settings",
  "errorTitle": "Could not load balance",
  "retry": "Try again",
  "viewInMeta": "View in Meta Billing",
  "metaBillingUrl": "https://business.facebook.com/billing_hub/accounts"
}
```

- [ ] **Step 2: Protect `/reports` in middleware**

In `src/middleware.ts`, extend `protectedPaths`:

```ts
const protectedPaths = [
  "/dashboard",
  "/inbox",
  "/contacts",
  "/pipelines",
  "/broadcasts",
  "/automations",
  "/settings",
  "/reports",
];
```

- [ ] **Step 3: Sidebar — add Reports, role-gate**

In `src/components/layout/sidebar.tsx`:

1. Import `Wallet` (or `Receipt`) from `lucide-react` and `canEditSettings` from `@/lib/auth/roles`.
2. Extend `NavItem`:

```ts
interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  beta?: boolean;
  /** If set, row is shown only when canEditSettings(role) — used for billing Reports. */
  adminOnly?: boolean;
}
```

3. Insert after dashboard:

```ts
{ href: "/reports", labelKey: "reports", icon: Wallet, adminOnly: true },
```

4. When rendering nav items, filter:

```ts
const visibleNavItems = navItems.filter(
  (item) =>
    !item.adminOnly ||
    (accountRole != null && canEditSettings(accountRole)),
);
```

Use `visibleNavItems` instead of `navItems` in the map.

- [ ] **Step 4: Header title**

In `src/components/layout/header.tsx` `pageTitles`:

```ts
"/reports": "reports",
```

- [ ] **Step 5: Commit**

```bash
git add messages/en.json src/middleware.ts src/components/layout/sidebar.tsx src/components/layout/header.tsx
git commit -m "Wire Reports nav, i18n, and auth middleware."
```

---

### Task 4: Reports page + balance card

**Files:**
- Create: `src/components/reports/balance-card.tsx`
- Create: `src/app/(dashboard)/reports/page.tsx`

**Interfaces:**
- Consumes: `GET /api/meta/billing-balance` → `{ data: BillingBalance }` or `{ error, code }`
- Consumes: `canEditSettings`, `useAuth`, next-intl `Reports` namespace

- [ ] **Step 1: Implement `balance-card.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { RefreshCw, ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/dashboard/skeleton";

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
            <Button asChild variant="secondary" size="sm">
              <Link href="/settings?tab=whatsapp">{t("openSettings")}</Link>
            </Button>
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="space-y-3">
            <p className="font-medium text-foreground">{t("errorTitle")}</p>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
              {t("retry")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
```

(If `Button` has no `asChild`, use `<Link href=… className={buttonVariants(…)}>` per existing patterns in the repo.)

- [ ] **Step 2: Implement reports page with role redirect**

`src/app/(dashboard)/reports/page.tsx`:

```tsx
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
```

- [ ] **Step 3: Smoke-check Skeleton / Button APIs**

Confirm `Skeleton` accepts `className` and `Button` variants match other dashboard pages. Adjust imports if the repo uses a different button path (`@/components/ui/button`).

- [ ] **Step 4: Run unit tests again**

Run: `npx vitest run src/lib/whatsapp/billing-balance.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/balance-card.tsx src/app/(dashboard)/reports/page.tsx
git commit -m "Add Reports page with Meta current balance card."
```

---

### Task 5: Manual verification + harden

**Files:** none new (verification only)

- [ ] **Step 1: Local checklist**

1. Sign in as **owner/admin** → sidebar shows **Reports** → `/reports` loads.
2. With WhatsApp configured: card shows loading then amount **or** a clear Meta permission error (both acceptable for v1; never a blank crash).
3. Sign in as **agent** (or temporarily lower role): Reports hidden; `/reports` redirects to dashboard; `GET /api/meta/billing-balance` returns **403**.
4. In browser Network tab, response body has **no** `access_token`.

- [ ] **Step 2: Production note**

If Meta returns permission errors on the live EC2 account, document in the PR that Settings may need a finance-capable token / Business ID later (per spec follow-up) — do **not** invent a balance.

- [ ] **Step 3: Final commit if any UI polish**

Only if Step 1 caused small fixes:

```bash
git add -A
git commit -m "Polish Reports balance card edge cases."
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| `/reports` + sidebar Reports | 3, 4 |
| Owner/admin only | 2 (`requireRole`), 3 (nav), 4 (redirect) |
| Current balance card + hub placeholder | 4 |
| Live Meta via `whatsapp_config` | 1, 2 |
| `credit_available` / WHATSAPP_BUSINESS | 1 |
| Structured errors, no fake amounts | 1, 2, 4 |
| Token never to browser | 2, 5 |
| Middleware protect `/reports` | 3 |
| No tax unless Meta returns it | 1 (`tax_estimated: null`), 4 (conditional render) |
| No Business ID Settings in v1 | — explicitly omitted |

## Self-review notes

- No TBD/placeholder steps.
- `BillingBalance` / error `code` names consistent across helper, route, and card.
- Reuses `canEditSettings` instead of a new role predicate (same admin+ rule as billing AI usage).
