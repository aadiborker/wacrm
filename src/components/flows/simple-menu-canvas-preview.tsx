"use client";

import { useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge as RfEdge,
  type Node as RfNode,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

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

  return (
    <div
      className="w-[220px] rounded-xl border bg-card px-3 py-2.5 shadow-sm"
      style={{ borderColor: colors.ring }}
    >
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
    }, 50);
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
      minZoom={0.3}
      maxZoom={1.5}
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
  const built = useMemo(() => {
    const issues = validateSimpleMenuSpec(spec);
    if (issues.length > 0) return null;
    try {
      return buildSimpleMenuFlow(spec);
    } catch {
      return null;
    }
  }, [spec]);

  const graph = useMemo(() => {
    if (!built) return null;
    const builderNodes: BuilderNode[] = built.nodes.map((n) => ({
      node_key: n.node_key,
      node_type: n.node_type as NodeType,
      config: n.config as Record<string, unknown>,
    }));
    const canvasEdges = deriveCanvasEdges(builderNodes);
    const positions = autoLayout(
      builderNodes.map((n) => ({ id: n.node_key, width: 220, height: 88 })),
      canvasEdges.map((e) => ({ source: e.source, target: e.target })),
      { rankSep: 72, nodeSep: 48, defaultWidth: 220, defaultHeight: 88 },
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

    const edges: RfEdge[] = canvasEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      labelStyle: { fill: "var(--foreground)", fontSize: 10, fontWeight: 500 },
      labelBgStyle: { fill: "var(--card)", fillOpacity: 0.95 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      style: { stroke: "var(--muted-foreground)", strokeWidth: 1.5 },
    }));

    return { nodes, edges };
  }, [built]);

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

  return (
    <div
      className={cn(
        "h-[380px] overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      <ReactFlowProvider>
        <PreviewInner nodes={graph.nodes} edges={graph.edges} />
      </ReactFlowProvider>
    </div>
  );
}
