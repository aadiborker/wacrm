"use client";

/**
 * Flow-level trigger editor (keyword / first inbound / manual).
 * Shared by the list-view Trigger panel and the canvas Start node sheet
 * so canvas users aren't forced to switch to List to set keywords.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ValidationIssue } from "@/lib/flows/validate";
import { IssueLine } from "../validation-panel";
import { useFlowEditor } from "../flow-editor-state";

function KeywordsInput({
  keywords,
  onChange,
  t,
}: {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [draft, setDraft] = useState(keywords.join(", "));

  function commit() {
    const parsed = draft
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    setDraft(parsed.join(", "));
    onChange(parsed);
  }

  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      placeholder={t("keywordsPlaceholder")}
      className="bg-muted"
    />
  );
}

export function FlowTriggerFields({
  className,
  showTitle = true,
}: {
  className?: string;
  showTitle?: boolean;
}) {
  const t = useTranslations("Flows.builder");
  const { state, setState, issues } = useFlowEditor();
  const triggerIssues = issues.filter((i) => i.scope === "trigger");

  return (
    <div className={className}>
      {showTitle && (
        <h3 className="text-foreground mb-3 text-sm font-semibold">
          {t("triggerTitle")}
        </h3>
      )}
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-muted-foreground mb-1 block text-xs">
            {t("whenLabel")}
          </label>
          <Select
            value={state.trigger_type}
            onValueChange={(v) =>
              setState((s) => ({
                ...s,
                trigger_type: v as typeof s.trigger_type,
                trigger_config:
                  v === "keyword" ? { keywords: [] } : {},
              }))
            }
          >
            <SelectTrigger className="w-full bg-muted">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keyword">
                {t("triggerKeywordTitle")}
              </SelectItem>
              <SelectItem value="first_inbound_message">
                {t("triggerFirstInboundTitle")}
              </SelectItem>
              <SelectItem value="manual">
                {t("triggerManualTitle")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {state.trigger_type === "keyword" && (
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              {t("keywordsLabel")}
            </label>
            <KeywordsInput
              keywords={
                Array.isArray(state.trigger_config.keywords)
                  ? (state.trigger_config.keywords as string[])
                  : []
              }
              onChange={(keywords) =>
                setState((s) => ({
                  ...s,
                  trigger_config: { ...s.trigger_config, keywords },
                }))
              }
              t={t}
            />
          </div>
        )}
      </div>
      {triggerIssues.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {triggerIssues.map((i: ValidationIssue, ix: number) => (
            <IssueLine key={ix} issue={i} />
          ))}
        </div>
      )}
    </div>
  );
}
