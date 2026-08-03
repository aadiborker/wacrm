"use client";

/**
 * Editor toolbar — flow name / description, status chip, dirty
 * indicator, and the action buttons (Save, Activate/Pause, Delete,
 * View runs, Back).
 *
 * Restyled to the Flow Builder design handoff: a single compact
 * toolbar row (back · icon · inline-editable name · status chip ·
 * edited dot on the left; Runs · Delete · Activate · Save on the
 * right) followed by a subtle, full-width description "note" line.
 * Replaces the old three-row stack so the editor reads as one app
 * chrome bar above the canvas/list stage.
 *
 * Lifted out of flow-builder.tsx so the same toolbar renders above
 * both views in FlowEditorShell. Without this, canvas users had no
 * way to save without toggling to list view.
 *
 * Reads everything from the editor context (`useFlowEditor`) so it
 * stays in sync with whichever view is mutating state, and routes
 * router navigation locally (back to /flows, View runs to
 * /flows/[id]/runs) — those don't belong in the hook.
 */

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CircleDot,
  History,
  Loader2,
  PauseCircle,
  PlayCircle,
  Save,
  Trash2,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useFlowEditor,
  type BuilderState,
} from "./flow-editor-state";
import { IdleResetField } from "./forms/idle-reset-field";

export function EditorHeader() {
  const router = useRouter();
  const {
    flow,
    state,
    setState,
    dirty,
    saving,
    activating,
    canActivate,
    save,
    setStatus,
    deleteFlow,
  } = useFlowEditor();

  return (
    <div className="flex shrink-0 flex-col gap-3 px-6 pt-5">
      <div className="flex flex-wrap items-center gap-3">
        {/* ---- left: back · icon · name · status · edited ---- */}
        <button
          type="button"
          onClick={() => router.push("/flows")}
          title="Back to Flows"
          aria-label="Back to Flows"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Workflow className="h-5 w-5" />
        </span>
        <input
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          placeholder="Flow name"
          spellCheck={false}
          aria-label="Flow name"
          className="min-w-[160px] max-w-[420px] rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-xl font-bold leading-tight tracking-tight text-foreground outline-none transition-colors hover:bg-muted focus:border-primary focus:bg-transparent focus:shadow-[0_0_0_3px_var(--primary-soft)]"
        />
        <StatusChip status={state.status} />
        {dirty && (
          <span
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-300"
            title="Unsaved changes — hit Save to persist"
            aria-live="polite"
          >
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Edited
          </span>
        )}

        {/* ---- right: runs · delete · activate · save ---- */}
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <Button
            variant="ghost"
            onClick={() => router.push(`/flows/${flow.id}/runs`)}
          >
            <History className="h-4 w-4" />
            Runs
            <span className="ml-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {flow.execution_count}
            </span>
          </Button>
          <Button
            variant="ghost"
            onClick={() => void deleteFlow()}
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
          {state.status === "active" ? (
            <Button
              variant="outline"
              onClick={() => void setStatus("draft")}
              disabled={activating}
            >
              {activating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PauseCircle className="h-4 w-4" />
              )}
              Pause
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => void setStatus("active")}
              disabled={activating || !canActivate}
              title={
                !canActivate
                  ? "Open the Errors tab and fix issues before activating"
                  : undefined
              }
            >
              {activating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              Activate
            </Button>
          )}
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* ---- description note (subtle, inline-editable) ---- */}
      <input
        value={state.description}
        onChange={(e) =>
          setState((s) => ({ ...s, description: e.target.value }))
        }
        placeholder="Add a short description (internal — customers don't see this)"
        aria-label="Flow description"
        className="w-full rounded-md border border-transparent bg-transparent px-2.5 py-1.5 text-sm leading-relaxed text-muted-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:bg-muted/50 focus:border-primary focus:bg-transparent focus:text-foreground"
      />
      <IdleResetField
        policy={state.fallback_policy}
        onChange={(fallback_policy) =>
          setState((s) => ({ ...s, fallback_policy }))
        }
        className="rounded-lg border border-border bg-muted/30 px-3 py-2.5"
      />
    </div>
  );
}

function StatusChip({ status }: { status: BuilderState["status"] }) {
  const cfg = {
    draft: {
      // Neutral, not amber — amber is reserved for the adjacent
      // "Edited" dirty signal, so the two don't read as the same alert.
      cls: "border-border bg-muted text-muted-foreground",
      label: "Draft",
    },
    active: {
      cls: "border-emerald-600/40 bg-emerald-500/10 text-emerald-300",
      label: "Active",
    },
    archived: {
      cls: "border-border bg-muted/50 text-muted-foreground",
      label: "Archived",
    },
  }[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
        cfg.cls,
      )}
    >
      <CircleDot className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
