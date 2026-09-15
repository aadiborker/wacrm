# Reports — Meta Current Balance (Design)

**Date:** 2026-09-15  
**Status:** Approved for implementation planning  
**Product:** ReplyFlow (WACRM)

## Summary

Add a **Reports** section that shows the logged-in company’s Meta WhatsApp **Current balance**, fetched live from Meta’s Graph API using that company’s existing WhatsApp configuration. v1 is a reports hub with one card; more report cards can be added later.

## Goals

- Owner/admin can open **Reports** and see Current balance for **their** company only.
- Balance is fetched live from Meta (no scraping of Business Suite HTML).
- Failures are explicit (permissions, missing config) — never invent amounts.
- Layout leaves room for future report cards.

## Non-goals (v1)

- Estimated tax unless Meta returns a tax field (do not invent).
- Conversation/spend analytics charts.
- DB caching or cron refresh.
- New Settings fields for Meta Business ID (deferred until live fetch proves insufficient).
- Platform-wide / cross-company admin balance view.
- WooCommerce integration (separate initiative).

## Decisions locked

| Topic | Decision |
| --- | --- |
| Audience | Current company only |
| Roles | Owner + Admin only |
| Page content | Reports hub; **Current balance** first |
| Fetch strategy | Live Meta via existing `whatsapp_config` token + `waba_id`; add Business ID later only if Meta rejects |
| Architecture | Approach 1 — live server-side fetch |

## UX

### Navigation

- New sidebar item: **Reports**.
- Route: `/reports`.
- Hidden (or redirect away) for agent/viewer.
- Protect `/reports` in middleware like other dashboard routes.

### Page

- Title: **Reports**.
- Primary card: **Current balance**.
- Optional quiet placeholder: “More reports coming soon”.
- Card states: loading skeleton → success → error (+ retry) → WhatsApp not configured.

### Success card contents

| Element | Rule |
| --- | --- |
| Current balance (large) | Amount from Meta credit available / prepaid remaining |
| Currency | From Meta (e.g. `INR`) |
| Last updated | Timestamp of this fetch |
| Estimated tax | Only if Meta returns it; otherwise omit |
| Refresh | Button re-calls the API |
| Optional link | “View in Meta Billing” for human verification if numbers differ |

## Data flow

```
Owner/Admin opens /reports
        ↓
GET /api/meta/billing-balance   (server-only)
        ↓
requireRole("admin")  →  session account_id
        ↓
Load whatsapp_config for that account
        ↓
Meta Graph API (token never sent to browser)
        ↓
JSON { amount, currency, fetched_at, source, … }
        ↓
Reports card renders
```

### API contract (sketch)

`GET /api/meta/billing-balance`

**Auth:** session + min role `admin` (covers owner).

**Success (200):**

```json
{
  "data": {
    "amount": "38.84",
    "currency": "INR",
    "fetched_at": "2026-09-15T07:30:00.000Z",
    "source": "extendedcredits.credit_available",
    "tax_estimated": null
  }
}
```

**Errors (structured):**

| Situation | Behavior |
| --- | --- |
| Not signed in | 401 |
| Agent/viewer | 403 |
| No / incomplete WhatsApp config | 400 + message to connect WhatsApp in Settings |
| Meta permission / no credit line | 502 or 403-style domain error with clear message (may need Business ID / finance permission later) |
| Meta timeout / upstream failure | 502 with retry guidance |

## Meta lookup order

1. Load `whatsapp_config` (`access_token`, `waba_id`) for the session account.
2. `GET /{waba_id}?fields=owner_business_info,currency,primary_funding_id`
3. If Business ID is available:  
   `GET /{business_id}/extendedcredits?fields=id,credit_type,balance,credit_available,max_balance`
4. Prefer the line where `credit_type === "WHATSAPP_BUSINESS"`.
5. Map **`credit_available`** to Current balance (closest documented match to prepaid remaining).

If any step fails, return a structured error — do not guess.

**Known risk:** The Business Suite “Current balance” UI (including estimated tax) may not map 1:1 to Extended Credits fields, and the WhatsApp Cloud API token may lack finance permissions. v1 surfaces that honestly; Settings may later store `meta_business_id` + a finance-capable token if production proves it necessary.

## Security

- Use existing `requireRole("admin")` for the API.
- Account-scoped: only that company’s `whatsapp_config`.
- Access token used only on the server; never returned in API JSON.
- Do not log full tokens or raw secrets.

## Components / files (expected)

| Area | Change |
| --- | --- |
| `src/components/layout/sidebar.tsx` | Add Reports nav item; role-gate if needed |
| `src/middleware.ts` | Protect `/reports` |
| `src/app/(dashboard)/reports/page.tsx` | Reports page |
| `src/components/reports/*` | Balance card UI |
| `src/app/api/meta/billing-balance/route.ts` | Server fetch |
| `src/lib/meta/*` or `src/lib/whatsapp/*` | Graph helper for extended credits |
| i18n message catalogs | Sidebar + Reports strings |
| Tests | Role gate + Meta mapping / error paths |

Exact paths may follow existing Meta/WhatsApp module layout during implementation.

## Testing

- Owner/admin: success path (mocked Meta) shows amount + currency.
- Agent/viewer: API 403; nav hidden / redirect.
- Missing WhatsApp config: empty/error state, no crash.
- Meta permission error: clear message, no fake balance.
- Response JSON never includes access_token.

## Acceptance criteria

1. Owner/admin can open `/reports` and see a Current balance card for their company.
2. Balance is loaded from Meta via the company’s stored WhatsApp credentials (when Meta allows).
3. Agents/viewers cannot read the billing-balance API.
4. Permission/config failures are visible and actionable.
5. Page is structured as a hub for future report cards.

## Follow-ups (post-v1)

- Persist `meta_business_id` / finance token in Settings if needed.
- Short TTL cache if Meta rate-limits.
- Additional cards: conversation analytics, spend over time.
- Resume WooCommerce order-confirmation MVP as a separate spec.
