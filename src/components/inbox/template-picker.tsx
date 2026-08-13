"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact, MessageTemplate } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ChevronRight,
  LayoutTemplate,
  Loader2,
} from "lucide-react";
import { extractVariableIndices } from "@/lib/whatsapp/template-validators";
import {
  resolveVariables,
  type VariableMapping,
} from "@/lib/broadcasts/variables";
import {
  TemplatePersonalizeForm,
  buildInitialVariableMappings,
  computeTemplatePersonalizeValidation,
  getBodyPlaceholders,
} from "@/components/templates/template-personalize-form";
import { useTranslations } from "next-intl";

export interface TemplateSendValues {
  body: string[];
  headerText?: string;
  headerMediaUrl?: string;
  buttonParams?: Record<number, string>;
}

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: MessageTemplate, values: TemplateSendValues) => void;
  /** Enables Contact Field / Custom Field mapping and live preview for one recipient. */
  contact?: Contact | null;
}

interface UrlButtonSlot {
  index: number;
  text: string;
  url: string;
}

function collectExtraSlots(template: MessageTemplate): {
  headerVarCount: number;
  urlButtonSlots: UrlButtonSlot[];
} {
  const headerVarCount =
    template.header_type === "text" && template.header_content
      ? extractVariableIndices(template.header_content).length
      : 0;
  const urlButtonSlots: UrlButtonSlot[] = [];
  (template.buttons ?? []).forEach((b, i) => {
    if (b.type === "URL" && extractVariableIndices(b.url).length > 0) {
      urlButtonSlots.push({ index: i, text: b.text, url: b.url });
    }
  });
  return { headerVarCount, urlButtonSlots };
}

function isMediaHeader(template: MessageTemplate): boolean {
  return (
    template.header_type === "image" ||
    template.header_type === "video" ||
    template.header_type === "document"
  );
}

export function TemplatePicker({
  open,
  onOpenChange,
  onSelect,
  contact,
}: TemplatePickerProps) {
  const t = useTranslations("Inbox.templatePicker");

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [variables, setVariables] = useState<Record<string, VariableMapping>>(
    {},
  );
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [headerText, setHeaderText] = useState("");
  const [buttonParams, setButtonParams] = useState<Record<number, string>>({});
  const [contactCustomValues, setContactCustomValues] = useState<
    Map<string, string>
  >(new Map());

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setTemplates([]);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .eq("status", "APPROVED")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch templates:", error);
        setTemplates([]);
      } else {
        setTemplates((data as MessageTemplate[]) ?? []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!contact?.id) {
      setContactCustomValues(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("contact_custom_values")
        .select("custom_field_id, value")
        .eq("contact_id", contact.id);
      if (cancelled) return;
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        map.set(row.custom_field_id, row.value ?? "");
      }
      setContactCustomValues(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [contact?.id]);

  function resetSelection() {
    setSelected(null);
    setVariables({});
    setHeaderMediaUrl("");
    setHeaderText("");
    setButtonParams({});
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetSelection();
    onOpenChange(next);
  }

  function pickTemplate(template: MessageTemplate) {
    const bodyPlaceholders = getBodyPlaceholders(template.body_text);
    const extra = collectExtraSlots(template);
    const needsPersonalize =
      bodyPlaceholders.length > 0 ||
      isMediaHeader(template) ||
      extra.headerVarCount > 0 ||
      extra.urlButtonSlots.length > 0;

    if (!needsPersonalize) {
      onSelect(template, { body: [] });
      handleOpenChange(false);
      return;
    }

    setSelected(template);
    setVariables(buildInitialVariableMappings(template));
    setHeaderMediaUrl(template.header_media_url ?? "");
    setHeaderText("");
    setButtonParams({});
  }

  function confirm() {
    if (!selected || !contact) return;

    const body = resolveVariables(variables, contact, contactCustomValues);
    const values: TemplateSendValues = { body };
    if (headerMediaUrl.trim()) values.headerMediaUrl = headerMediaUrl.trim();
    if (headerText.trim()) values.headerText = headerText.trim();
    if (Object.keys(buttonParams).length > 0) {
      values.buttonParams = Object.fromEntries(
        Object.entries(buttonParams).map(([k, v]) => [Number(k), v.trim()]),
      );
    }
    onSelect(selected, values);
    handleOpenChange(false);
  }

  const extraSlots = useMemo(
    () => (selected ? collectExtraSlots(selected) : null),
    [selected],
  );

  const { canProceed } = useMemo(() => {
    if (!selected) return { canProceed: false };
    const base = computeTemplatePersonalizeValidation(
      selected,
      variables,
      headerMediaUrl,
    );
    const headerOk =
      !extraSlots?.headerVarCount || headerText.trim().length > 0;
    const urlOk =
      extraSlots?.urlButtonSlots.every(
        (s) => (buttonParams[s.index] ?? "").trim().length > 0,
      ) ?? true;
    return {
      canProceed: base.canProceed && headerOk && urlOk && Boolean(contact),
    };
  }, [
    selected,
    variables,
    headerMediaUrl,
    extraSlots,
    headerText,
    buttonParams,
    contact,
  ]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-popover-foreground">
            <LayoutTemplate className="h-4 w-4 text-primary" />
            {selected ? selected.name : t("sendTemplate")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {selected ? t("fillPlaceholders") : t("pickTemplate")}
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded-md border border-border bg-background/50 p-6 text-center">
                <p className="text-sm text-popover-foreground">
                  {t("noApprovedTemplates")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("noApprovedTemplatesHint")}
                </p>
              </div>
            ) : (
              templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => pickTemplate(tpl)}
                  className="w-full rounded-md border border-border bg-background/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-popover"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-popover-foreground">
                          {tpl.name}
                        </p>
                        <Badge className="border border-primary/30 bg-primary/20 text-[10px] text-primary">
                          {tpl.category}
                        </Badge>
                        {tpl.language && (
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {tpl.language}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {tpl.body_text}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ))
            )}
          </div>
        ) : contact ? (
          <div className="space-y-4">
            <TemplatePersonalizeForm
              template={selected}
              variables={variables}
              onVariablesChange={setVariables}
              headerMediaUrl={headerMediaUrl}
              onHeaderMediaUrlChange={setHeaderMediaUrl}
              previewContact={contact}
            />
            {extraSlots && extraSlots.headerVarCount > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-popover-foreground">
                  {`Header {{1}}`}
                </Label>
                <Input
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder={t("headerValuePlaceholder")}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            )}
            {extraSlots?.urlButtonSlots.map((slot) => (
              <div key={slot.index} className="space-y-1">
                <Label className="text-xs text-popover-foreground">
                  {`URL button "${slot.text}" — value for `}{`{{1}}`}
                </Label>
                <Input
                  value={buttonParams[slot.index] ?? ""}
                  onChange={(e) =>
                    setButtonParams((prev) => ({
                      ...prev,
                      [slot.index]: e.target.value,
                    }))
                  }
                  placeholder={t("urlSuffixValuePlaceholder")}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noContactContext")}</p>
        )}

        <DialogFooter className="gap-2">
          {selected ? (
            <>
              <Button
                variant="outline"
                onClick={resetSelection}
                className="border-border text-popover-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("back")}
              </Button>
              <Button
                disabled={!canProceed}
                onClick={confirm}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {t("send")}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="border-border text-popover-foreground hover:bg-muted"
            >
              {t("cancel")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
