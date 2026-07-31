"use client";

/**
 * Validation panel — surfaces every error and warning from
 * `validateFlowForActivation`. Shown in the editor's Errors view so
 * it never crowds the canvas or list stage.
 *
 * Node-scoped issues are clickable: tapping one jumps to Canvas/List
 * and flashes the node (via `onJumpNode` or `requestFlash`).
 */

import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ValidationIssue } from "@/lib/flows/validate";
import { useFlowEditor } from "./flow-editor-state";

export function ValidationPanel({
  variant = "page",
  onJumpNode,
}: {
  /** `page` = full Errors tab layout. */
  variant?: "page" | "compact";
  /** Override jump handler (e.g. switch tab then flash). */
  onJumpNode?: (nodeKey: string) => void;
}) {
  const { issues, requestFlash } = useFlowEditor();
  const t = useTranslations("Flows.validation");
  const jump = onJumpNode ?? requestFlash;

  if (issues.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-background p-3 text-sm font-medium text-emerald-300",
          variant === "page" && "max-w-2xl",
        )}
      >
        <CircleCheck className="h-4 w-4 shrink-0" />
        {t("noIssues")}
      </div>
    );
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-4",
        errors.length > 0 ? "border-red-500/40" : "border-amber-500/40",
        variant === "page" && "max-w-2xl",
      )}
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {errors.length > 0 ? (
          <CircleAlert className="h-4 w-4 text-red-400" />
        ) : (
          <CircleAlert className="h-4 w-4 text-amber-400" />
        )}
        {t("summary", {
          errorCount: errors.length,
          warningCount: warnings.length,
        })}
      </div>
      <div className="flex flex-col gap-1">
        {issues.map((i, ix) => (
          <IssueLine key={ix} issue={i} onJump={jump} t={t} />
        ))}
      </div>
    </div>
  );
}

/**
 * Exported so the per-node card (list view) and the trigger panel
 * can render the same "icon + node key chip + message" formatting
 * for their own per-row issue lists without re-implementing the
 * tone / icon / accessibility logic.
 */
export function IssueLine({
  issue,
  onJump,
  t,
}: {
  issue: ValidationIssue;
  onJump?: (key: string) => void;
  t?: ReturnType<typeof useTranslations>;
}) {
  const tone =
    issue.severity === "error" ? "text-red-300" : "text-amber-300";
  const iconTone =
    issue.severity === "error" ? "text-red-400" : "text-amber-400";
  const body = (
    <>
      <CircleAlert className={cn("mt-0.5 h-3 w-3 shrink-0", iconTone)} />
      <span className="min-w-0 flex-1">
        {issue.node_key && (
          <code className="mr-1 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
            {issue.node_key}
          </code>
        )}
        {issue.message}
      </span>
    </>
  );

  if (issue.node_key && onJump) {
    return (
      <button
        type="button"
        onClick={() => onJump(issue.node_key!)}
        className={cn(
          "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60",
          tone,
        )}
        aria-label={
          t
            ? t("jumpToNode", { key: issue.node_key! })
            : `Jump to node ${issue.node_key}`
        }
      >
        {body}
      </button>
    );
  }
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md px-2 py-1.5 text-xs",
        tone,
      )}
    >
      {body}
    </div>
  );
}
