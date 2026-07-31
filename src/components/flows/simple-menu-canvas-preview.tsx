"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge as RfEdge,
  type Node as RfNode,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { deriveCanvasEdges } from "@/lib/flows/edges";
import { autoLayout } from "@/lib/flows/layout";
import {
  buildSimpleMenuFlow,
  validateSimpleMenuSpec,
  type SimpleMenuSpec,
} from "@/lib/flows/simple-menu";
import {
  NODE_META,
  NodeIconChip,
  nodeColors,
  summarizeNode,
  type BuilderNode,
  type NodeType,
} from "@/components/flows/shared";
import { cn } from "@/lib/utils";

type PreviewData = {
  node: BuilderNode;
};

function PreviewNodeCard({ data }: NodeProps<RfNode<PreviewData>>) {
  const type = data.node.node_type as NodeType;
  const meta = NODE_META[type];
  const colors = nodeColors(type);
  const summary = summarizeNode(data.node);
  const isStart = type === "start";
  const isTerminal = type === "handoff" || type === "end";

  return (
    <div
      className="relative w-[220px] rounded-xl border bg-card px-3 py-2.5 shadow-sm"
      style={{ borderColor: colors.ring }}
    >
      {/* Handles are required for React Flow to draw edges. Preview
          cards use a single default source + target; edges omit
          sourceHandle so they attach here. */}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Top}
          className="!h-2 !w-2 !border-border !bg-muted-foreground"
        />
      )}
      <div className="flex items-center gap-2">
        <NodeIconChip type={type} size={22} iconSize={12} />
        <div className="min-w-0">
          <p
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: colors.text }}
          >
            {meta.label}
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {data.node.node_key}
          </p>
        </div>
      </div>
      {summary ? (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {summary}
        </p>
      ) : null}
      {!isTerminal && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-2 !w-2 !border-border !bg-muted-foreground"
        />
      )}
    </div>
  );
}

const nodeTypes = { preview: PreviewNodeCard };

function PreviewInner({
  nodes,
  edges,
}: {
  nodes: RfNode<PreviewData>[];
  edges: RfEdge[];
}) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 200 });
    }, 80);
    return () => window.clearTimeout(t);
  }, [nodes, edges, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
      proOptions={{ hideAttribution: true }}
      minZoom={0.25}
      maxZoom={1.5}
      defaultEdgeOptions={{
        type: "smoothstep",
        animated: false,
      }}
      className="bg-background"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={18}
        size={1}
        color="var(--border)"
      />
      <Controls
        showInteractive={false}
        className="!border-border !bg-card [&_button]:!border-border [&_button]:!bg-card"
      />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) =>
          nodeColors((n.data as PreviewData).node.node_type as NodeType).solid
        }
        className="!h-[96px] !w-[140px] !border-border !bg-card !rounded-lg !border"
        maskColor="color-mix(in oklch, var(--background) 55%, transparent)"
      />
    </ReactFlow>
  );
}

function buildPreviewGraph(spec: SimpleMenuSpec): {
  nodes: RfNode<PreviewData>[];
  edges: RfEdge[];
} | null {
  const issues = validateSimpleMenuSpec(spec);
  if (issues.length > 0) return null;
  let built;
  try {
    built = buildSimpleMenuFlow(spec);
  } catch {
    return null;
  }

  const builderNodes: BuilderNode[] = built.nodes.map((n) => ({
    node_key: n.node_key,
    node_type: n.node_type as NodeType,
    config: n.config as Record<string, unknown>,
  }));
  const canvasEdges = deriveCanvasEdges(builderNodes);
  const positions = autoLayout(
    builderNodes.map((n) => ({ id: n.node_key, width: 220, height: 88 })),
    canvasEdges.map((e) => ({ source: e.source, target: e.target })),
    { rankSep: 80, nodeSep: 48, defaultWidth: 220, defaultHeight: 88 },
  );

  const nodes: RfNode<PreviewData>[] = builderNodes.map((n) => {
    const pos = positions.get(n.node_key) ?? { x: 0, y: 0 };
    return {
      id: n.node_key,
      type: "preview",
      position: pos,
      data: { node: n },
      draggable: false,
      selectable: false,
    };
  });

  // Omit sourceHandle — preview nodes only expose the default source
  // handle. Passing row:/next handles made React Flow drop every edge.
  const edges: RfEdge[] = canvasEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: "smoothstep",
    labelStyle: { fill: "var(--foreground)", fontSize: 10, fontWeight: 500 },
    labelBgStyle: { fill: "var(--card)", fillOpacity: 0.95 },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 4,
    style: { stroke: "var(--muted-foreground)", strokeWidth: 1.5 },
  }));

  return { nodes, edges };
}

/**
 * Read-only canvas preview of the graph the Simple Menu wizard will create.
 */
export function SimpleMenuCanvasPreview({
  spec,
  className,
}: {
  spec: SimpleMenuSpec;
  className?: string;
}) {
  const t = useTranslations("Flows.simpleMenu");
  const [expanded, setExpanded] = useState(false);

  const graph = useMemo(() => buildPreviewGraph(spec), [spec]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  if (!graph) {
    return (
      <div
        className={cn(
          "flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground",
          className,
        )}
      >
        Fix the issues above to preview the canvas.
      </div>
    );
  }

  const canvas = (
    <ReactFlowProvider>
      <PreviewInner nodes={graph.nodes} edges={graph.edges} />
    </ReactFlowProvider>
  );

  return (
    <>
      <div
        className={cn(
          "relative h-[380px] overflow-hidden rounded-xl border border-border bg-card",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-md border border-border bg-card/95 px-2 py-1.5 text-xs text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          {t("canvasExpand")}
        </button>
        {canvas}
      </div>

      {expanded && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t("canvasPreview")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("canvasPreviewHint")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              <Minimize2 className="h-4 w-4" />
              {t("canvasCollapse")}
              <X className="ml-1 h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <ReactFlowProvider>
              <PreviewInner nodes={graph.nodes} edges={graph.edges} />
            </ReactFlowProvider>
          </div>
        </div>
      )}
    </>
  );
}
