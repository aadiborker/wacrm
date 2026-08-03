"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { SimpleMenuWizard } from "@/components/flows/simple-menu-wizard";
import {
  isSimpleMenuFlow,
  resolveSimpleMenuSpec,
  type SimpleMenuSpec,
} from "@/lib/flows/simple-menu";
import type { FlowNodeRow, FlowRow } from "@/lib/flows/types";

/**
 * Edit an existing Simple Menu flow in the wizard (not the node canvas).
 * Works for new saves (stored form) and old drafts (inferred from nodes).
 */
export default function EditSimpleMenuFlowPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations("Flows.simpleMenu");
  const [loading, setLoading] = useState(true);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [initialSpec, setInitialSpec] = useState<SimpleMenuSpec | null>(null);
  const [initialActivate, setInitialActivate] = useState(false);
  const [initialStatus, setInitialStatus] =
    useState<FlowRow["status"]>("draft");
  const [executionCount, setExecutionCount] = useState(0);
  const [initialFallbackPolicy, setInitialFallbackPolicy] = useState<
    FlowRow["fallback_policy"] | null
  >(null);

  useEffect(() => {
    const id = params.id;
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/flows/${id}`);
        if (!res.ok) throw new Error(`Load failed: ${res.status}`);
        const json = (await res.json()) as {
          flow: FlowRow;
          nodes: FlowNodeRow[];
        };
        const flow = json.flow;
        const nodes = json.nodes ?? [];

        const looksSimple =
          isSimpleMenuFlow(flow) ||
          nodes.some(
            (n) => n.node_key === "menu_main" && n.node_type === "send_list",
          );
        if (!looksSimple) {
          router.replace(`/flows/${id}`);
          return;
        }

        const spec = resolveSimpleMenuSpec(flow, nodes);
        if (!spec) {
          toast.message(t("editNeedsCanvas"));
          router.replace(`/flows/${id}`);
          return;
        }
        if (cancelled) return;
        setFlowId(flow.id);
        setInitialSpec(spec);
        setInitialActivate(flow.status === "active");
        setInitialStatus(flow.status);
        setExecutionCount(flow.execution_count ?? 0);
        setInitialFallbackPolicy(flow.fallback_policy ?? null);
      } catch (err) {
        console.error(err);
        toast.error(t("loadError"));
        router.replace("/flows");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id, router, t]);

  if (loading || !flowId || !initialSpec) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <SimpleMenuWizard
      existingFlowId={flowId}
      initialSpec={initialSpec}
      initialActivate={initialActivate}
      initialStatus={initialStatus}
      initialExecutionCount={executionCount}
      initialFallbackPolicy={initialFallbackPolicy}
    />
  );
}
