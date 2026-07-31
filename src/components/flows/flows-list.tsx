"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Workflow,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  MessageSquare,
  PlayCircle,
  PauseCircle,
  Archive,
  HelpCircle,
  UserPlus,
  FileText,
  Sparkles,
} from "lucide-react";

import { useTranslations } from "next-intl";
import { useCan } from "@/hooks/use-can";
import { Button } from "@/components/ui/button";
import { GatedButton } from "@/components/ui/gated-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FlowRow } from "@/lib/flows/types";
import type { FlowTemplateSummary } from "@/lib/flows/templates";

/**
 * Flows list UI. Receives initial rows + template summaries from the
 * server page so the first paint doesn't wait on a client fetch
 * waterfall (auth spinner → /api/flows → /api/flows/templates).
 */

const STATUS_LABELS = (
  t: ReturnType<typeof useTranslations>,
): Record<FlowRow["status"], string> => ({
  draft: t("statusDraft"),
  active: t("statusActive"),
  archived: t("statusArchived"),
});

const STATUS_COLORS: Record<FlowRow["status"], string> = {
  draft: "border-border bg-muted text-muted-foreground",
  active: "border-emerald-600/40 bg-emerald-500/10 text-emerald-300",
  archived: "border-border bg-muted/50 text-muted-foreground",
};

const TEMPLATE_ICONS = {
  MessageSquare,
  HelpCircle,
  UserPlus,
} as const;

interface Props {
  initialFlows: FlowRow[];
  initialTemplates: FlowTemplateSummary[];
}

export function FlowsList({ initialFlows, initialTemplates }: Props) {
  const router = useRouter();
  const canCreate = useCan("send-messages");
  const t = useTranslations("Flows.list");
  const [flows, setFlows] = useState<FlowRow[]>(initialFlows);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [templates] = useState<FlowTemplateSummary[]>(initialTemplates);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          trigger_type: "keyword",
          trigger_config: { keywords: [] },
        }),
      });
      if (!res.ok) throw new Error(`Create failed: ${res.status}`);
      const json = (await res.json()) as { flow: FlowRow };
      setCreateOpen(false);
      setNewName("");
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      console.error(err);
      toast.error(t("createError"));
    } finally {
      setCreating(false);
    }
  }

  async function handleUseTemplate(slug: string) {
    setCreating(true);
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_slug: slug }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Clone failed: ${res.status}`);
      }
      const json = (await res.json()) as { flow: FlowRow };
      setCreateOpen(false);
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("cloneError");
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(flow: FlowRow) {
    const yes = window.confirm(t("deleteConfirm", { name: flow.name }));
    if (!yes) return;
    try {
      const res = await fetch(`/api/flows/${flow.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setFlows((prev) => prev.filter((f) => f.id !== flow.id));
      toast.success(t("deleteSuccess"));
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error(t("deleteError"));
    }
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground">
              {t("title")}
            </h1>
            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              {t("beta")}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <GatedButton
          canAct={canCreate}
          gateReason="create flows"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {t("newFlow")}
        </GatedButton>
      </header>

      {flows.length === 0 ? (
        <EmptyState
          onCreate={() => setCreateOpen(true)}
          canCreate={canCreate}
          t={t}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flows.map((flow) => (
            <FlowCard
              key={flow.id}
              flow={flow}
              onEdit={() => router.push(`/flows/${flow.id}`)}
              onDelete={() => handleDelete(flow)}
              t={t}
            />
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        {/* `sm:max-w-4xl` not `max-w-4xl` — shadcn's DialogContent has
            `sm:max-w-sm` baked into its default classes. Without the
            sm: prefix our override applies at base only and the
            sm-scoped 384px wins at every real desktop breakpoint.
            Cap height + scroll the body so simple-menu + templates
            don't clip off short viewports. */}
        <DialogContent className="flex max-h-[min(90dvh,calc(100vh-2rem))] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl bg-popover text-popover-foreground">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 pb-3 pt-4 pr-12">
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("createDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("startSimple")}
              </p>
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  router.push("/flows/new/simple");
                }}
                disabled={creating}
                className="flex w-full flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10 disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t("simpleMenuTitle")}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {t("simpleMenuDesc")}
                </span>
                <span className="text-xs font-medium text-primary">
                  {t("simpleMenuCta")} →
                </span>
              </button>
            </div>

            {templates.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("startTemplate")}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {templates.map((template) => {
                    const Icon = TEMPLATE_ICONS[template.icon] ?? FileText;
                    return (
                      <button
                        key={template.slug}
                        type="button"
                        onClick={() => handleUseTemplate(template.slug)}
                        disabled={creating}
                        className="flex flex-col gap-2.5 rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted disabled:opacity-50"
                      >
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="text-sm font-semibold text-popover-foreground">
                          {template.name}
                        </span>
                        <span className="text-xs leading-relaxed text-muted-foreground">
                          {template.description}
                        </span>
                        <span className="mt-auto border-t border-border pt-2 text-[11px] text-muted-foreground">
                          {t("nodeCount", { count: template.node_count })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("startBlank")}
              </p>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("placeholderName")}
                className="bg-muted"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-border">
            <Button
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("createBlank")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({
  onCreate,
  canCreate,
  t,
}: {
  onCreate: () => void;
  canCreate: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-gradient-to-b from-card/80 to-muted/20 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Workflow className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-base font-medium text-foreground">
        {t("emptyTitle")}
      </h2>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
        {t("emptyDesc")}
      </p>
      <GatedButton
        canAct={canCreate}
        gateReason="create flows"
        onClick={onCreate}
        className="mt-5"
      >
        <Plus className="h-4 w-4" />
        {t("createFirst")}
      </GatedButton>
    </div>
  );
}

function FlowCard({
  flow,
  onEdit,
  onDelete,
  t,
}: {
  flow: FlowRow;
  onEdit: () => void;
  onDelete: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const triggerSummary = describeTrigger(flow, t);
  const StatusIcon =
    flow.status === "active"
      ? PlayCircle
      : flow.status === "archived"
        ? Archive
        : PauseCircle;
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-border">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Workflow className="h-4 w-4 shrink-0 text-primary" />
          <h3 className="truncate text-sm font-semibold text-foreground">
            {flow.name}
          </h3>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 gap-1 text-[10px]",
            STATUS_COLORS[flow.status],
          )}
        >
          <StatusIcon className="h-3 w-3" />
          {STATUS_LABELS(t)[flow.status]}
        </Badge>
      </div>

      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
        {flow.description || triggerSummary}
      </p>

      <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          {t("runCount", { count: flow.execution_count })}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
          {t("edit")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("delete")}
        </Button>
      </div>
    </div>
  );
}

function describeTrigger(
  flow: FlowRow,
  t: ReturnType<typeof useTranslations>,
): string {
  if (flow.trigger_type === "keyword") {
    const keywords = Array.isArray(flow.trigger_config.keywords)
      ? (flow.trigger_config.keywords as string[])
      : [];
    if (keywords.length === 0) return t("triggerKeywordNone");
    return t("triggerKeyword", { keywords: keywords.join(", ") });
  }
  if (flow.trigger_type === "first_inbound_message") {
    return t("triggerFirstInbound");
  }
  return t("triggerManual");
}
