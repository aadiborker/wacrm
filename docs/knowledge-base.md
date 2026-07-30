# ReplyFlow knowledge base guide

The knowledge base teaches your AI assistant (inbox drafts, auto-reply, and Playground) about your business — FAQs, pricing, project details, policies, and website pages.

## Where to open it

1. Sign in to ReplyFlow.
2. Go to **AI Agents** in the sidebar.
3. Open the **Setup** tab.
4. Scroll to **Knowledge base**.

You need an **admin** (or owner) role to add or edit documents. Other members can view them.

## Before you start

1. In **AI Agents → Setup**, configure your AI provider and API key.
2. (Recommended) Add an **embeddings** API key (OpenAI-compatible).  
   - With embeddings: **semantic search** (better matching).  
   - Without: **keyword search** still works.
3. After adding an embeddings key later, click **Reindex** so existing docs get vectors.

## Add content

### Option A — Paste text

1. Click **Add document**.
2. Leave **Paste text** selected.
3. Pick or type a **Category** (FAQ, Pricing, Products, Policies, Company, Projects, or your own).
4. Enter a clear **Title**.
5. Paste the **Content**.
6. Click **Save document**.

### Option B — Import a website URL

1. Click **Add document**.
2. Switch to **Website URL**.
3. Choose a **Category**.
4. Paste a public page URL, e.g. `https://yoursite.com/faq`.
5. Optionally override the title (otherwise we use the page title).
6. Click **Import website**.

ReplyFlow fetches the HTML, extracts readable text, stores it, and indexes it. The source URL is kept on the document for reference.

**Limits / tips**

- Works best on normal HTML pages (marketing sites, FAQ pages).
- Heavy JavaScript-only apps may return little text — paste manually instead.
- PDFs and images are **not** imported yet.
- Private/local URLs are blocked for security.
- Very large pages are truncated.

## Categories

Categories help you organize docs in the list (filter chips at the top). They do not change how retrieval works yet — the AI still searches across the whole knowledge base.

Suggested labels:

| Category  | Good for                         |
|-----------|----------------------------------|
| FAQ       | Common customer questions        |
| Pricing   | Plans, packages, payment terms   |
| Products  | Features, specs                  |
| Policies  | Refunds, privacy, terms          |
| Company   | About us, contact, hours         |
| Projects  | Township / project-specific pages |

## How the AI uses it

When someone chats in WhatsApp or you click **Draft with AI** in the inbox:

1. ReplyFlow searches your knowledge documents for relevant chunks.
2. Those excerpts are added to the system prompt.
3. The model answers using that context when it can; otherwise it can hand off to a human (per your Setup behaviour).

Same retrieval path powers:

- Inbox **Draft with AI**
- **Auto-reply** bot (if enabled)
- **Playground** (for testing)

Flows do **not** read the knowledge base today.

## Good content habits

- Prefer short, focused docs (one topic per document) over one giant dump.
- Use the real wording customers use (“site visit”, “possession”, “EMI”).
- Re-import or edit when your website pricing / FAQ changes.
- Test answers in **Playground** before relying on auto-reply.

## Apply the database migration

New columns: `category`, `source_url` on `ai_knowledge_documents`.

On your Supabase project, run migration:

`supabase/migrations/037_ai_knowledge_source_category.sql`

(Same way you applied earlier migrations — SQL editor or your pooler script.)

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| Import fails / little text | Paste the page content instead |
| Answers ignore the KB | Confirm docs exist; add embeddings key + **Reindex** |
| “Permission” errors | Need admin/owner role |
| Old answers after an edit | Edit saved the new text; if you only changed embeddings key, **Reindex** |

## Related files (developers)

- UI: `src/components/settings/ai-knowledge.tsx`
- Import API: `src/app/api/ai/knowledge/from-url/route.ts`
- Fetch/extract: `src/lib/ai/fetch-url.ts`
- Retrieval: `src/lib/ai/knowledge.ts`
- Migration: `supabase/migrations/037_ai_knowledge_source_category.sql`
