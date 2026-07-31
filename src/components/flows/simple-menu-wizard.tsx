"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  Trash2,
  Sparkles,
  Save,
  History,
  PauseCircle,
  PlayCircle,
  CircleDot,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  blankSimpleMenuSpec,
  buildSimpleMenuFlow,
  SIMPLE_MENU_BUTTON_LABEL_MAX,
  SIMPLE_MENU_TITLE_MAX,
  validateSimpleMenuSpec,
  type SimpleMenuLeaf,
  type SimpleMenuOption,
  type SimpleMenuOptionAction,
  type SimpleLeafAction,
  type SimpleMenuSpec,
} from "@/lib/flows/simple-menu";
import { SimpleMenuCanvasPreview } from "@/components/flows/simple-menu-canvas-preview";
import type { FlowRow } from "@/lib/flows/types";

type Step = 1 | 2 | 3;
type FlowStatus = FlowRow["status"];

function CharCount({ value, max }: { value: string; max: number }) {
  const n = value.length;
  return (
    <span
      className={cn(
        "text-[11px] tabular-nums",
        n > max ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {n}/{max}
    </span>
  );
}

export function SimpleMenuWizard({
  existingFlowId = null,
  initialSpec,
  initialActivate = true,
  initialStatus = "draft",
  initialExecutionCount = 0,
}: {
  /** When set, saves update this flow instead of creating a new one. */
  existingFlowId?: string | null;
  initialSpec?: SimpleMenuSpec;
  initialActivate?: boolean;
  initialStatus?: FlowStatus;
  initialExecutionCount?: number;
} = {}) {
  const router = useRouter();
  const t = useTranslations("Flows.simpleMenu");
  const tList = useTranslations("Flows.list");
  const [step, setStep] = useState<Step>(1);
  const [spec, setSpec] = useState<SimpleMenuSpec>(
    () => initialSpec ?? blankSimpleMenuSpec(),
  );
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [activate, setActivate] = useState(initialActivate);
  /** Set after first Save draft — further saves update this flow. */
  const [flowId, setFlowId] = useState<string | null>(existingFlowId);
  const [status, setStatus] = useState<FlowStatus>(
    initialStatus === "active" ? "active" : initialStatus === "archived" ? "archived" : "draft",
  );
  const [executionCount] = useState(initialExecutionCount);

  const issues = useMemo(() => validateSimpleMenuSpec(spec), [spec]);
  const busy = creating || saving || statusBusy;

  function patch(p: Partial<SimpleMenuSpec>) {
    setSpec((s) => ({ ...s, ...p }));
  }

  async function persistDraft(): Promise<string> {
    if (issues.length > 0) {
      throw new Error(issues[0]!.message);
    }

    if (flowId) {
      const built = buildSimpleMenuFlow(spec);
      const res = await fetch(`/api/flows/${flowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: built.name,
          description: built.description,
          trigger_type: built.trigger_type,
          trigger_config: built.trigger_config,
          entry_node_id: built.entry_node_id,
          nodes: built.nodes,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? `Save failed: ${res.status}`);
      }
      return flowId;
    }

    const res = await fetch("/api/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simple_menu: spec, activate: false }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error ?? `Save failed: ${res.status}`);
    }
    const id = json.flow?.id as string | undefined;
    if (!id) throw new Error(t("createError"));
    setFlowId(id);
    setStatus("draft");
    return id;
  }

  async function handleSaveDraft() {
    if (issues.length > 0) {
      toast.error(issues[0]!.message);
      return;
    }
    setSaving(true);
    try {
      await persistDraft();
      toast.success(t("savedDraft"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSetStatus(next: "draft" | "active") {
    if (!flowId) return;
    setStatusBusy(true);
    try {
      if (next === "active") {
        await persistDraft();
      }
      const res = await fetch(`/api/flows/${flowId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          Array.isArray(json.issues) && json.issues[0]?.message
            ? json.issues[0].message
            : (json.error ?? `Status change failed: ${res.status}`);
        throw new Error(msg);
      }
      setStatus(next);
      setActivate(next === "active");
      toast.success(next === "active" ? t("statusActivated") : t("statusPaused"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("statusError"));
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleDelete() {
    if (!flowId) return;
    const yes = window.confirm(
      tList("deleteConfirm", { name: spec.name || t("title") }),
    );
    if (!yes) return;
    setStatusBusy(true);
    try {
      const res = await fetch(`/api/flows/${flowId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      toast.success(tList("deleteSuccess"));
      router.push("/flows");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tList("deleteError"));
      setStatusBusy(false);
    }
  }

  async function handleCreate() {
    if (issues.length > 0) {
      toast.error(issues[0]!.message);
      return;
    }
    setCreating(true);
    try {
      const id = await persistDraft();

      if (activate) {
        const res = await fetch(`/api/flows/${id}/activate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error ?? `Activate failed: ${res.status}`);
        }
        setStatus("active");
        toast.success(t("createdActive"));
      } else {
        setStatus("draft");
        toast.success(t("createdDraft"));
      }
      // Stay in the simple-menu world — don't dump users on the node canvas.
      router.push("/flows");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("createError"));
    } finally {
      setCreating(false);
    }
  }

  function updateOption(index: number, patchOpt: Partial<SimpleMenuOption>) {
    setSpec((s) => ({
      ...s,
      options: s.options.map((o, i) =>
        i === index ? { ...o, ...patchOpt } : o,
      ),
    }));
  }

  function addOption() {
    if (spec.options.length >= 10) return;
    setSpec((s) => ({
      ...s,
      options: [
        ...s.options,
        { title: "", action: "handoff" as const, handoffNote: "" },
      ],
    }));
  }

  function removeOption(index: number) {
    setSpec((s) => ({
      ...s,
      options: s.options.filter((_, i) => i !== index),
    }));
  }

  function updateLeaf(
    optIndex: number,
    leafIndex: number,
    patchLeaf: Partial<SimpleMenuLeaf>,
  ) {
    setSpec((s) => ({
      ...s,
      options: s.options.map((o, i) => {
        if (i !== optIndex) return o;
        const submenuOptions = [...(o.submenuOptions ?? [])];
        submenuOptions[leafIndex] = {
          ...submenuOptions[leafIndex]!,
          ...patchLeaf,
        };
        return { ...o, submenuOptions };
      }),
    }));
  }

  function updateNestedLeaf(
    optIndex: number,
    leafIndex: number,
    nestedIndex: number,
    patchLeaf: Partial<SimpleMenuLeaf>,
  ) {
    setSpec((s) => ({
      ...s,
      options: s.options.map((o, i) => {
        if (i !== optIndex) return o;
        const submenuOptions = [...(o.submenuOptions ?? [])];
        const parent = submenuOptions[leafIndex];
        if (!parent) return o;
        const nested = [...(parent.submenuOptions ?? [])];
        nested[nestedIndex] = { ...nested[nestedIndex]!, ...patchLeaf };
        submenuOptions[leafIndex] = { ...parent, submenuOptions: nested };
        return { ...o, submenuOptions };
      }),
    }));
  }

  function addLeaf(optIndex: number) {
    setSpec((s) => ({
      ...s,
      options: s.options.map((o, i) => {
        if (i !== optIndex) return o;
        const submenuOptions = [
          ...(o.submenuOptions ?? []),
          { title: "", action: "handoff" as const },
        ];
        if (submenuOptions.length > 10) return o;
        return { ...o, submenuOptions };
      }),
    }));
  }

  function addNestedLeaf(optIndex: number, leafIndex: number) {
    setSpec((s) => ({
      ...s,
      options: s.options.map((o, i) => {
        if (i !== optIndex) return o;
        const submenuOptions = [...(o.submenuOptions ?? [])];
        const parent = submenuOptions[leafIndex];
        if (!parent) return o;
        const nested = [
          ...(parent.submenuOptions ?? []),
          { title: "", action: "handoff" as const },
        ];
        if (nested.length > 10) return o;
        submenuOptions[leafIndex] = { ...parent, submenuOptions: nested };
        return { ...o, submenuOptions };
      }),
    }));
  }

  function removeLeaf(optIndex: number, leafIndex: number) {
    setSpec((s) => ({
      ...s,
      options: s.options.map((o, i) => {
        if (i !== optIndex) return o;
        return {
          ...o,
          submenuOptions: (o.submenuOptions ?? []).filter(
            (_, j) => j !== leafIndex,
          ),
        };
      }),
    }));
  }

  function removeNestedLeaf(
    optIndex: number,
    leafIndex: number,
    nestedIndex: number,
  ) {
    setSpec((s) => ({
      ...s,
      options: s.options.map((o, i) => {
        if (i !== optIndex) return o;
        const submenuOptions = [...(o.submenuOptions ?? [])];
        const parent = submenuOptions[leafIndex];
        if (!parent) return o;
        submenuOptions[leafIndex] = {
          ...parent,
          submenuOptions: (parent.submenuOptions ?? []).filter(
            (_, j) => j !== nestedIndex,
          ),
        };
        return { ...o, submenuOptions };
      }),
    }));
  }

  function canGoNext(): boolean {
    if (step === 1) {
      return (
        !!spec.name.trim() &&
        !!spec.keyword.trim() &&
        !!spec.welcomeText.trim() &&
        (spec.buttonLabel ?? "View options").trim().length <=
          SIMPLE_MENU_BUTTON_LABEL_MAX
      );
    }
    if (step === 2) {
      return (
        spec.options.length >= 1 &&
        spec.options.every(
          (o) =>
            o.title.trim().length > 0 &&
            o.title.trim().length <= SIMPLE_MENU_TITLE_MAX,
        )
      );
    }
    return issues.length === 0;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          onClick={() => router.push("/flows")}
          className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            <h1 className="text-2xl font-semibold text-foreground">
              {spec.name.trim() || t("title")}
            </h1>
            {flowId && <StatusChip status={status} t={t} />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {flowId && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/flows/${flowId}/runs`)}
              disabled={busy}
            >
              <History className="h-4 w-4" />
              {t("runs")}
              <span className="ml-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {executionCount}
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleDelete()}
              disabled={busy}
              className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" />
              {t("delete")}
            </Button>
            {status === "active" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleSetStatus("draft")}
                disabled={busy}
              >
                {statusBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PauseCircle className="h-4 w-4" />
                )}
                {t("pause")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleSetStatus("active")}
                disabled={busy || issues.length > 0}
                title={
                  issues.length > 0 ? issues[0]?.message : undefined
                }
              >
                {statusBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4" />
                )}
                {t("activate")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSaveDraft()}
              disabled={busy || issues.length > 0}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t("save")}
            </Button>
          </div>
        )}
      </div>

      <ol className="flex gap-2 text-xs font-medium">
        {([1, 2, 3] as Step[]).map((s) => (
          <li
            key={s}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-center",
              step === s
                ? "bg-primary text-primary-foreground"
                : step > s
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {t(`step${s}`)}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="space-y-2">
            <Label htmlFor="sm-name">{t("nameLabel")}</Label>
            <Input
              id="sm-name"
              value={spec.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder={t("namePlaceholder")}
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sm-keyword">{t("keywordLabel")}</Label>
            <Input
              id="sm-keyword"
              value={spec.keyword}
              onChange={(e) => patch({ keyword: e.target.value })}
              placeholder="Help"
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">{t("keywordHint")}</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="sm-welcome">{t("welcomeLabel")}</Label>
              <CharCount value={spec.welcomeText} max={1024} />
            </div>
            <Textarea
              id="sm-welcome"
              value={spec.welcomeText}
              onChange={(e) => patch({ welcomeText: e.target.value })}
              placeholder={t("welcomePlaceholder")}
              rows={4}
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="sm-btn">{t("buttonLabel")}</Label>
              <CharCount
                value={spec.buttonLabel ?? ""}
                max={SIMPLE_MENU_BUTTON_LABEL_MAX}
              />
            </div>
            <Input
              id="sm-btn"
              value={spec.buttonLabel ?? ""}
              onChange={(e) => patch({ buttonLabel: e.target.value })}
              placeholder="View options"
              className="bg-muted"
            />
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("optionsHint")}</p>
          {spec.options.map((opt, i) => (
            <OptionCard
              key={i}
              index={i}
              option={opt}
              t={t}
              onChange={(p) => updateOption(i, p)}
              onRemove={() => removeOption(i)}
              canRemove={spec.options.length > 1}
              onAddLeaf={() => addLeaf(i)}
              onUpdateLeaf={(j, p) => updateLeaf(i, j, p)}
              onRemoveLeaf={(j) => removeLeaf(i, j)}
              onAddNestedLeaf={(j) => addNestedLeaf(i, j)}
              onUpdateNestedLeaf={(j, k, p) => updateNestedLeaf(i, j, k, p)}
              onRemoveNestedLeaf={(j, k) => removeNestedLeaf(i, j, k)}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={addOption}
            disabled={spec.options.length >= 10}
          >
            <Plus className="h-4 w-4" />
            {t("addOption")}
          </Button>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">
            {t("reviewTitle")}
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("nameLabel")}</dt>
              <dd className="text-foreground">{spec.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("keywordLabel")}</dt>
              <dd className="font-mono text-foreground">{spec.keyword}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("optionsCount")}</dt>
              <dd className="text-foreground">{spec.options.length}</dd>
            </div>
          </dl>
          <ul className="space-y-2 border-t border-border pt-3 text-sm">
            {spec.options.map((o, i) => (
              <li key={i} className="text-muted-foreground">
                <span className="font-medium text-foreground">{o.title}</span>
                {" → "}
                {o.action === "submenu"
                  ? t("actionSubmenuWith", {
                      count: o.submenuOptions?.length ?? 0,
                    })
                  : o.action === "message"
                    ? t("actionMessage")
                    : o.action === "end"
                      ? t("actionEnd")
                      : t("actionHandoff")}
              </li>
            ))}
          </ul>

          <div className="space-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">
              {t("canvasPreview")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("canvasPreviewHint")}
            </p>
            <SimpleMenuCanvasPreview spec={spec} />
          </div>

          {issues.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {issues[0]!.message}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={activate}
              onChange={(e) => setActivate(e.target.checked)}
              className="rounded border-border"
            />
            {t("activateNow")}
          </label>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          disabled={step === 1 || busy}
          onClick={() => setStep((s) => (s === 1 ? 1 : ((s - 1) as Step)))}
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || issues.length > 0}
            title={
              issues.length > 0 ? issues[0]!.message : t("saveDraftHint")
            }
            onClick={() => void handleSaveDraft()}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("saveDraft")}
          </Button>
          {step < 3 ? (
            <Button
              type="button"
              disabled={!canGoNext() || busy}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              {t("next")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy || issues.length > 0}
              onClick={() => void handleCreate()}
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {activate ? t("createActivate") : t("createDraft")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function OptionCard({
  index,
  option,
  t,
  onChange,
  onRemove,
  canRemove,
  onAddLeaf,
  onUpdateLeaf,
  onRemoveLeaf,
  onAddNestedLeaf,
  onUpdateNestedLeaf,
  onRemoveNestedLeaf,
}: {
  index: number;
  option: SimpleMenuOption;
  t: ReturnType<typeof useTranslations>;
  onChange: (p: Partial<SimpleMenuOption>) => void;
  onRemove: () => void;
  canRemove: boolean;
  onAddLeaf: () => void;
  onUpdateLeaf: (j: number, p: Partial<SimpleMenuLeaf>) => void;
  onRemoveLeaf: (j: number) => void;
  onAddNestedLeaf: (j: number) => void;
  onUpdateNestedLeaf: (
    j: number,
    k: number,
    p: Partial<SimpleMenuLeaf>,
  ) => void;
  onRemoveNestedLeaf: (j: number, k: number) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("optionN", { n: index + 1 })}
        </p>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-destructive hover:opacity-80"
            aria-label={t("removeOption")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t("optionTitle")}</Label>
          <CharCount value={option.title} max={SIMPLE_MENU_TITLE_MAX} />
        </div>
        <Input
          value={option.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={t("optionTitlePlaceholder")}
          className="bg-muted"
        />
      </div>
      <div className="space-y-2">
        <Label>{t("whenTapped")}</Label>
        <ActionPicker
          value={option.action}
          t={t}
          includeSubmenu
          includeEnd
          onChange={(action) => {
            onChange({
              action: action as SimpleMenuOptionAction,
              submenuOptions:
                action === "submenu"
                  ? option.submenuOptions?.length
                    ? option.submenuOptions
                    : [{ title: "", action: "handoff" }]
                  : option.submenuOptions,
              submenuBody:
                action === "submenu"
                  ? option.submenuBody || ""
                  : option.submenuBody,
            });
          }}
        />
      </div>

      {option.action === "message" && (
        <div className="space-y-2">
          <Label>{t("messageLabel")}</Label>
          <Textarea
            value={option.messageText ?? ""}
            onChange={(e) => onChange({ messageText: e.target.value })}
            placeholder={t("messagePlaceholder")}
            rows={3}
            className="bg-muted"
          />
        </div>
      )}

      {(option.action === "handoff" || option.action === "message") && (
        <div className="space-y-2">
          <Label>{t("handoffNoteLabel")}</Label>
          <Input
            value={option.handoffNote ?? ""}
            onChange={(e) => onChange({ handoffNote: e.target.value })}
            placeholder={t("handoffNotePlaceholder")}
            className="bg-muted"
          />
        </div>
      )}

      {option.action === "submenu" && (
        <div className="space-y-3 rounded-lg border border-border/80 bg-muted/30 p-3">
          <div className="space-y-2">
            <Label>{t("submenuBodyLabel")}</Label>
            <Textarea
              value={option.submenuBody ?? ""}
              onChange={(e) => onChange({ submenuBody: e.target.value })}
              placeholder={t("submenuBodyPlaceholder")}
              rows={2}
              className="bg-muted"
            />
          </div>
          {(option.submenuOptions ?? []).map((leaf, j) => (
            <LeafCard
              key={j}
              leaf={leaf}
              index={j}
              t={t}
              canRemove={(option.submenuOptions?.length ?? 0) > 1}
              allowNestedSubmenu
              onChange={(p) => onUpdateLeaf(j, p)}
              onRemove={() => onRemoveLeaf(j)}
              onAddNested={() => onAddNestedLeaf(j)}
              onUpdateNested={(k, p) => onUpdateNestedLeaf(j, k, p)}
              onRemoveNested={(k) => onRemoveNestedLeaf(j, k)}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddLeaf}
            disabled={(option.submenuOptions?.length ?? 0) >= 10}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("addSubOption")}
          </Button>
        </div>
      )}
    </div>
  );
}

function LeafCard({
  leaf,
  index,
  t,
  canRemove,
  allowNestedSubmenu,
  onChange,
  onRemove,
  onAddNested,
  onUpdateNested,
  onRemoveNested,
}: {
  leaf: SimpleMenuLeaf;
  index: number;
  t: ReturnType<typeof useTranslations>;
  canRemove: boolean;
  allowNestedSubmenu: boolean;
  onChange: (p: Partial<SimpleMenuLeaf>) => void;
  onRemove: () => void;
  onAddNested: () => void;
  onUpdateNested: (k: number, p: Partial<SimpleMenuLeaf>) => void;
  onRemoveNested: (k: number) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {t("subOptionN", { n: index + 1 })}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Input
          value={leaf.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={t("optionTitlePlaceholder")}
          className="bg-muted"
        />
        <CharCount value={leaf.title} max={SIMPLE_MENU_TITLE_MAX} />
      </div>
      <ActionPicker
        value={leaf.action}
        t={t}
        includeSubmenu={allowNestedSubmenu}
        includeEnd
        onChange={(action) => {
          const next = action as SimpleLeafAction;
          onChange({
            action: next,
            submenuOptions:
              next === "submenu"
                ? leaf.submenuOptions?.length
                  ? leaf.submenuOptions
                  : [{ title: "", action: "handoff" }]
                : leaf.submenuOptions,
            submenuBody:
              next === "submenu" ? leaf.submenuBody || "" : leaf.submenuBody,
          });
        }}
      />
      {leaf.action === "message" && (
        <Textarea
          value={leaf.messageText ?? ""}
          onChange={(e) => onChange({ messageText: e.target.value })}
          placeholder={t("messagePlaceholder")}
          rows={2}
          className="bg-muted"
        />
      )}
      {(leaf.action === "handoff" || leaf.action === "message") && (
        <Input
          value={leaf.handoffNote ?? ""}
          onChange={(e) => onChange({ handoffNote: e.target.value })}
          placeholder={t("handoffNotePlaceholder")}
          className="bg-muted"
        />
      )}
      {leaf.action === "submenu" && allowNestedSubmenu && (
        <div className="space-y-2 rounded-md border border-border/60 bg-muted/40 p-2">
          <Label>{t("submenuBodyLabel")}</Label>
          <Textarea
            value={leaf.submenuBody ?? ""}
            onChange={(e) => onChange({ submenuBody: e.target.value })}
            placeholder={t("submenuBodyPlaceholder")}
            rows={2}
            className="bg-muted"
          />
          {(leaf.submenuOptions ?? []).map((nested, k) => (
            <LeafCard
              key={k}
              leaf={nested}
              index={k}
              t={t}
              canRemove={(leaf.submenuOptions?.length ?? 0) > 1}
              allowNestedSubmenu={false}
              onChange={(p) => onUpdateNested(k, p)}
              onRemove={() => onRemoveNested(k)}
              onAddNested={() => undefined}
              onUpdateNested={() => undefined}
              onRemoveNested={() => undefined}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddNested}
            disabled={(leaf.submenuOptions?.length ?? 0) >= 10}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("addSubOption")}
          </Button>
        </div>
      )}
    </div>
  );
}

function ActionPicker({
  value,
  t,
  includeSubmenu,
  includeEnd,
  onChange,
}: {
  value: string;
  t: ReturnType<typeof useTranslations>;
  includeSubmenu: boolean;
  includeEnd: boolean;
  onChange: (action: string) => void;
}) {
  const items: [string, string][] = [
    ["handoff", t("actionHandoff")],
    ["message", t("actionMessage")],
  ];
  if (includeSubmenu) items.push(["submenu", t("actionSubmenu")]);
  if (includeEnd) items.push(["end", t("actionEnd")]);

  return (
    <div className="grid gap-2">
      {items.map(([action, label]) => (
        <button
          key={action}
          type="button"
          onClick={() => onChange(action)}
          className={cn(
            "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
            value === action
              ? "border-primary bg-primary/10 font-medium text-foreground"
              : "border-border bg-muted text-muted-foreground hover:border-primary/40 hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function StatusChip({
  status,
  t,
}: {
  status: FlowStatus;
  t: ReturnType<typeof useTranslations>;
}) {
  const cfg =
    status === "active"
      ? {
          cls: "border-emerald-600/40 bg-emerald-500/10 text-emerald-300",
          label: t("statusActive"),
        }
      : status === "archived"
        ? {
            cls: "border-border bg-muted/50 text-muted-foreground",
            label: t("statusArchived"),
          }
        : {
            cls: "border-border bg-muted text-muted-foreground",
            label: t("statusDraft"),
          };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
        cfg.cls,
      )}
    >
      <CircleDot className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
