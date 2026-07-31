"use client";

/**
 * View-switcher + chrome for the flow editor.
 *
 * Lays the editor out as one app-like column that fills the dashboard
 * content area (toolbar → mode row → stage), matching the Flow Builder
 * design handoff:
 *   - Segmented Canvas / List / Errors control on the mode row.
 *   - Errors is a dedicated view (with live counts) so validation never
 *     eats the canvas or list stage.
 *   - A node-type legend on the right (canvas/list only).
 *   - The active view fills the stage; list and errors scroll internally.
 *
 * View choice (canvas | list) persists per-browser via localStorage.
 * Errors is not persisted — refresh lands back on canvas/list.
 */

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, GitFork, List } from "lucide-react";

import { FlowBuilder } from "./flow-builder";
import { FlowCanvas } from "./flow-canvas";
import {
  FlowEditorProvider,
  useFlowEditor,
} from "./flow-editor-state";
import { EditorHeader } from "./header";
import { ValidationPanel } from "./validation-panel";
import { NODE_META, nodeColors, type NodeType } from "./shared";
import { cn } from "@/lib/utils";
import type { FlowRow, FlowNodeRow } from "@/lib/flows/types";
import { useTranslations } from "next-intl";

/**
 * Below this viewport width we force list (not canvas). Errors stays
 * available. Matches Tailwind's `md` breakpoint.
 */
const MOBILE_BREAKPOINT = "(max-width: 767px)";

type View = "canvas" | "list" | "errors";

const STORAGE_KEY = "wacrm.flowEditor.view";

const LEGEND_TYPES = Object.keys(NODE_META) as NodeType[];

interface Props {
  initialFlow: FlowRow;
  initialNodes: FlowNodeRow[];
}

export function FlowEditorShell({ initialFlow, initialNodes }: Props) {
  return (
    <FlowEditorProvider initialFlow={initialFlow} initialNodes={initialNodes}>
      <FlowEditorShellInner />
    </FlowEditorProvider>
  );
}

function FlowEditorShellInner() {
  const t = useTranslations("Flows.builder");
  const tv = useTranslations("Flows.validation");
  const { issues, requestFlash } = useFlowEditor();

  const [view, setView] = useState<View>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "canvas" || saved === "list") return saved;
    } catch {
      // Private browsing / disabled storage — fall through to default.
    }
    return "canvas";
  });

  const isMobile = useMatchMedia(MOBILE_BREAKPOINT);
  // Mobile: canvas is unusable; Errors remains reachable.
  const effectiveView: View = isMobile
    ? view === "errors"
      ? "errors"
      : "list"
    : view;

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const hasIssues = issues.length > 0;

  const choose = (next: View) => {
    setView(next);
    if (next === "canvas" || next === "list") {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
    }
  };

  const jumpToNode = (nodeKey: string) => {
    choose(isMobile ? "list" : "canvas");
    // Let the target view mount before flashing/panning.
    window.requestAnimationFrame(() => requestFlash(nodeKey));
  };

  return (
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] min-h-0 flex-col overflow-hidden sm:-m-6">
      <EditorHeader />

      <div className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-start lg:gap-6">
        <div
          role="group"
          aria-label="Editor view"
          className="inline-flex shrink-0 flex-wrap gap-1 rounded-xl border border-border bg-muted p-1"
        >
          {!isMobile && (
            <SegButton
              active={effectiveView === "canvas"}
              onClick={() => choose("canvas")}
              icon={<GitFork className="h-4 w-4" />}
              label={t("canvasView")}
            />
          )}
          <SegButton
            active={effectiveView === "list"}
            onClick={() => choose("list")}
            icon={<List className="h-4 w-4" />}
            label={t("listView")}
          />
          <SegButton
            active={effectiveView === "errors"}
            onClick={() => choose("errors")}
            icon={
              hasIssues ? (
                <CircleAlert
                  className={cn(
                    "h-4 w-4",
                    errorCount > 0 ? "text-red-400" : "text-amber-400",
                  )}
                />
              ) : (
                <CircleCheck className="h-4 w-4 text-emerald-400" />
              )
            }
            label={
              hasIssues
                ? t("errorsViewCounts", {
                    errorCount,
                    warningCount,
                  })
                : t("errorsView")
            }
            tone={
              effectiveView === "errors"
                ? undefined
                : errorCount > 0
                  ? "error"
                  : warningCount > 0
                    ? "warning"
                    : undefined
            }
          />
        </div>
        {effectiveView !== "errors" && (
          <div className="hidden flex-1 flex-wrap items-center gap-x-4 gap-y-2 lg:flex">
            {LEGEND_TYPES.map((t_type) => (
              <span
                key={t_type}
                className="inline-flex items-center gap-2 text-[13px] text-muted-foreground"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: nodeColors(t_type).solid }}
                />
                {t(`nodes.${t_type}.label`)}
              </span>
            ))}
          </div>
        )}
        {effectiveView === "errors" && (
          <p className="text-muted-foreground hidden flex-1 text-sm lg:block">
            {tv("errorsViewHint")}
          </p>
        )}
      </div>

      <div className="relative mx-6 mb-4 min-h-[12rem] flex-1 overflow-hidden rounded-xl border border-border bg-card-2">
        {effectiveView === "canvas" && (
          <div className="absolute inset-0">
            <FlowCanvas />
          </div>
        )}
        {effectiveView === "list" && (
          <div className="absolute inset-0 overflow-y-auto">
            <FlowBuilder />
          </div>
        )}
        {effectiveView === "errors" && (
          <div className="absolute inset-0 overflow-y-auto p-6">
            <ValidationPanel variant="page" onJumpNode={jumpToNode} />
          </div>
        )}
      </div>
    </div>
  );
}

function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

function SegButton({
  active,
  onClick,
  icon,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone?: "error" | "warning";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        !active && tone === "error" && "text-red-300 hover:text-red-200",
        !active && tone === "warning" && "text-amber-300 hover:text-amber-200",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
