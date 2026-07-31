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
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  type SimpleMenuSpec,
} from "@/lib/flows/simple-menu";
import { SimpleMenuCanvasPreview } from "@/components/flows/simple-menu-canvas-preview";

type Step = 1 | 2 | 3;

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

export function SimpleMenuWizard() {
  const router = useRouter();
  const t = useTranslations("Flows.simpleMenu");
  const [step, setStep] = useState<Step>(1);
  const [spec, setSpec] = useState<SimpleMenuSpec>(() => blankSimpleMenuSpec());
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activate, setActivate] = useState(true);
  /** Set after first Save draft — further saves update this flow. */
  const [flowId, setFlowId] = useState<string | null>(null);

  const issues = useMemo(() => validateSimpleMenuSpec(spec), [spec]);
  const busy = creating || saving;

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
        toast.success(t("createdActive"));
      } else {
        toast.success(t("createdDraft"));
      }
      router.push(`/flows/${id}`);
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
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => router.push("/flows")}
          className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold text-foreground">
              {t("title")}
            </h1>
            {flowId && (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("draftSavedBadge")}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
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
        {/* Visible buttons — the Select popup was clipping the 3rd
            option ("Show another menu") on short viewports. */}
        <div className="grid gap-2">
          {(
            [
              ["handoff", t("actionHandoff")],
              ["message", t("actionMessage")],
              ["submenu", t("actionSubmenu")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                const action = value as SimpleMenuOptionAction;
                onChange({
                  action,
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
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                option.action === value
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-border bg-muted text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
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
            <div
              key={j}
              className="space-y-2 rounded-md border border-border bg-card p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {t("subOptionN", { n: j + 1 })}
                </span>
                {(option.submenuOptions?.length ?? 0) > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveLeaf(j)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Input
                  value={leaf.title}
                  onChange={(e) => onUpdateLeaf(j, { title: e.target.value })}
                  placeholder={t("optionTitlePlaceholder")}
                  className="bg-muted"
                />
                <CharCount value={leaf.title} max={SIMPLE_MENU_TITLE_MAX} />
              </div>
              <Select
                value={leaf.action}
                onValueChange={(v) =>
                  onUpdateLeaf(j, { action: v as "handoff" | "message" })
                }
              >
                <SelectTrigger className="bg-muted">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="handoff">{t("actionHandoff")}</SelectItem>
                  <SelectItem value="message">{t("actionMessage")}</SelectItem>
                </SelectContent>
              </Select>
              {leaf.action === "message" && (
                <Textarea
                  value={leaf.messageText ?? ""}
                  onChange={(e) =>
                    onUpdateLeaf(j, { messageText: e.target.value })
                  }
                  placeholder={t("messagePlaceholder")}
                  rows={2}
                  className="bg-muted"
                />
              )}
            </div>
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
