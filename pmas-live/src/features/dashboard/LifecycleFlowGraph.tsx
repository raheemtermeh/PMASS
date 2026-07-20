"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { useRouter } from "next/navigation";
import type { FlowGraph, FlowProduct } from "./types";

type NodeKind = "company" | "product" | "stage" | "project";

interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  status: string;
  x: number;
  y: number;
  w: number;
  h: number;
  href?: string;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: "spine" | "stage" | "project";
}

interface Props {
  flow: FlowGraph;
  companyName?: string;
}

const STORAGE_PREFIX = "pmas-flow-layout:";

function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (["ACTIVE", "IN_PROGRESS", "READY"].includes(s)) return "#22d3ee";
  if (["COMPLETED", "DONE"].includes(s)) return "#34d399";
  if (["REJECTED", "BLOCKED", "CANCELLED"].includes(s)) return "#fb7185";
  if (["DRAFT", "PENDING", "BACKLOG"].includes(s)) return "#fbbf24";
  return "#a78bfa";
}

function defaultLayout(products: FlowProduct[], companyLabel: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  nodes.push({
    id: "company",
    kind: "company",
    label: companyLabel || "Company",
    status: "LIVE",
    x: 36,
    y: 140,
    w: 150,
    h: 56,
  });

  const rowH = 118;
  products.forEach((p, pi) => {
    const y = 36 + pi * rowH;
    const productId = `product:${p.id}`;
    nodes.push({
      id: productId,
      kind: "product",
      label: p.name,
      status: p.status,
      x: 240,
      y,
      w: 168,
      h: 52,
      href: `/products/${p.id}`,
    });
    edges.push({ id: `e-c-${p.id}`, from: "company", to: productId, kind: "spine" });

    let prev = productId;
    let sx = 440;
    p.stages.forEach((st, si) => {
      const sid = `stage:${p.id}:${st.id}`;
      nodes.push({
        id: sid,
        kind: "stage",
        label: st.name,
        status: st.status,
        x: sx,
        y: y + 4,
        w: 128,
        h: 44,
        href: `/products/${p.id}`,
      });
      edges.push({
        id: `e-s-${p.id}-${si}`,
        from: prev,
        to: sid,
        kind: "stage",
      });
      prev = sid;
      sx += 148;
    });

    p.projects.forEach((pr, ji) => {
      const pid = `project:${pr.id}`;
      nodes.push({
        id: pid,
        kind: "project",
        label: pr.name,
        status: pr.status,
        x: 260 + ji * 150,
        y: y + 62,
        w: 132,
        h: 38,
        href: "/planning",
      });
      edges.push({
        id: `e-p-${pr.id}`,
        from: productId,
        to: pid,
        kind: "project",
      });
    });
  });

  return { nodes, edges };
}

function loadSavedPositions(companyKey: string): Record<string, { x: number; y: number }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + companyKey);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, { x: number; y: number }>;
  } catch {
    return {};
  }
}

function savePositions(companyKey: string, nodes: GraphNode[]) {
  const map: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) map[n.id] = { x: n.x, y: n.y };
  localStorage.setItem(STORAGE_PREFIX + companyKey, JSON.stringify(map));
}

export function LifecycleFlowGraph({ flow, companyName }: Props) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [scale, setScale] = useState(0.85);
  const [pan, setPan] = useState({ x: 12, y: 8 });
  const dragRef = useRef<{
    mode: "pan" | "node";
    nodeId?: string;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
    origNodeX?: number;
    origNodeY?: number;
  } | null>(null);

  const companyKey = companyName || flow.company_name || "default";
  const companyLabel = companyName || flow.company_name || "Company";

  const built = useMemo(
    () => defaultLayout(flow.products ?? [], companyLabel),
    [flow.products, companyLabel],
  );

  const [nodes, setNodes] = useState<GraphNode[]>(built.nodes);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edges = built.edges;

  useEffect(() => {
    const saved = loadSavedPositions(companyKey);
    setNodes(
      built.nodes.map((n) =>
        saved[n.id] ? { ...n, x: saved[n.id].x, y: saved[n.id].y } : n,
      ),
    );
    setSelected(null);
  }, [built.nodes, companyKey]);

  const fitView = useCallback(() => {
    if (!wrapRef.current || nodes.length === 0) return;
    const pad = 40;
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + n.w));
    const maxY = Math.max(...nodes.map((n) => n.y + n.h));
    const w = wrapRef.current.clientWidth;
    const h = wrapRef.current.clientHeight;
    const sx = (w - pad * 2) / Math.max(maxX - minX, 1);
    const sy = (h - pad * 2) / Math.max(maxY - minY, 1);
    const next = Math.max(0.35, Math.min(1.35, Math.min(sx, sy)));
    setScale(next);
    setPan({
      x: pad - minX * next + (w - pad * 2 - (maxX - minX) * next) / 2,
      y: pad - minY * next + (h - pad * 2 - (maxY - minY) * next) / 2,
    });
  }, [nodes]);

  useEffect(() => {
    const t = window.setTimeout(fitView, 40);
    return () => window.clearTimeout(t);
  }, [flow.products?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setScale((s) => Math.max(0.3, Math.min(2.2, s + delta)));
  };

  const onPointerDown = (e: PointerEvent, nodeId?: string) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (editMode && nodeId) {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      dragRef.current = {
        mode: "node",
        nodeId,
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
        origNodeX: node.x,
        origNodeY: node.y,
      };
      setSelected(nodeId);
      return;
    }
    dragRef.current = {
      mode: "pan",
      startX: e.clientX,
      startY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
    };
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.mode === "pan") {
      setPan({ x: d.origPanX + dx, y: d.origPanY + dy });
      return;
    }
    if (d.mode === "node" && d.nodeId != null && d.origNodeX != null && d.origNodeY != null) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === d.nodeId
            ? { ...n, x: d.origNodeX! + dx / scale, y: d.origNodeY! + dy / scale }
            : n,
        ),
      );
    }
  };

  const onPointerUp = () => {
    if (dragRef.current?.mode === "node") {
      savePositions(companyKey, nodesRef.current);
    }
    dragRef.current = null;
  };

  const selectedNode = nodes.find((n) => n.id === selected) ?? null;

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  const empty = (flow.products ?? []).length === 0;

  return (
    <section className="cc-flow-box">
      <header className="cc-flow-toolbar">
        <div>
          <p className="command-eyebrow">Lifecycle graph</p>
          <h3>Product · Project · Stage</h3>
          <span className="cc-flow-hint">Live company data · drag to pan · scroll to zoom</span>
        </div>
        <div className="cc-flow-actions">
          <button type="button" className="btn btn-sm" onClick={() => setScale((s) => Math.min(2.2, s + 0.12))}>
            Zoom +
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setScale((s) => Math.max(0.3, s - 0.12))}>
            Zoom −
          </button>
          <button type="button" className="btn btn-sm" onClick={fitView}>
            Fit
          </button>
          <button
            type="button"
            className={`btn btn-sm${editMode ? " cc-flow-edit-on" : ""}`}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? "Editing…" : "Edit layout"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              localStorage.removeItem(STORAGE_PREFIX + companyKey);
              setNodes(built.nodes);
              window.setTimeout(fitView, 20);
            }}
          >
            Reset
          </button>
        </div>
      </header>

      <div
        ref={wrapRef}
        className={`cc-flow-viewport${editMode ? " is-editing" : ""}`}
        onWheel={onWheel}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).dataset.node) return;
          onPointerDown(e);
        }}
      >
        <div className="cc-flow-grid" aria-hidden />
        {empty ? (
          <div className="cc-flow-empty">
            <strong>No products yet</strong>
            <span>Create a product to see its pipeline stages and projects here.</span>
            <button type="button" className="btn btn-sm" onClick={() => router.push("/products")}>
              Open products
            </button>
          </div>
        ) : (
          <svg
            className="cc-flow-svg"
            width="100%"
            height="100%"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "0 0" }}
          >
            <defs>
              <linearGradient id="ccFlowEdge" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.15" />
                <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.35" />
              </linearGradient>
              <filter id="ccNodeGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {edges.map((e) => {
              const a = nodeById.get(e.from);
              const b = nodeById.get(e.to);
              if (!a || !b) return null;
              const x1 = a.x + a.w;
              const y1 = a.y + a.h / 2;
              const x2 = b.x;
              const y2 = b.y + b.h / 2;
              const mx = (x1 + x2) / 2;
              const path =
                e.kind === "project"
                  ? `M ${a.x + a.w / 2} ${a.y + a.h} C ${a.x + a.w / 2} ${a.y + a.h + 28}, ${b.x + b.w / 2} ${b.y - 28}, ${b.x + b.w / 2} ${b.y}`
                  : `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
              return (
                <path
                  key={e.id}
                  d={path}
                  className={`cc-flow-edge cc-flow-edge-${e.kind}`}
                  fill="none"
                  stroke={e.kind === "project" ? "rgba(167,139,250,0.55)" : "url(#ccFlowEdge)"}
                  strokeWidth={e.kind === "spine" ? 2.4 : 1.8}
                />
              );
            })}

            {nodes.map((n) => {
              const color = statusColor(n.status);
              const isSel = selected === n.id;
              return (
                <g
                  key={n.id}
                  data-node="1"
                  className={`cc-flow-node cc-flow-node-${n.kind}${isSel ? " is-selected" : ""}`}
                  transform={`translate(${n.x}, ${n.y})`}
                  filter={n.kind === "company" || n.status === "ACTIVE" ? "url(#ccNodeGlow)" : undefined}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    onPointerDown(ev, n.id);
                  }}
                  onDoubleClick={(ev) => {
                    ev.stopPropagation();
                    if (n.href) router.push(n.href);
                  }}
                  style={{ cursor: editMode ? "grab" : "pointer" }}
                >
                  <rect
                    width={n.w}
                    height={n.h}
                    rx={n.kind === "company" ? 16 : 12}
                    fill={
                      n.kind === "company"
                        ? "rgba(8,145,178,0.22)"
                        : n.kind === "product"
                          ? "rgba(15,23,42,0.92)"
                          : n.kind === "stage"
                            ? "rgba(17,24,39,0.9)"
                            : "rgba(30,27,46,0.92)"
                    }
                    stroke={isSel ? "#f8fafc" : color}
                    strokeWidth={isSel ? 2.2 : 1.4}
                  />
                  <circle cx={14} cy={n.h / 2} r={4.5} fill={color} />
                  <text x={26} y={n.h / 2 - 4} className="cc-flow-label">
                    {n.label.length > 16 ? `${n.label.slice(0, 16)}…` : n.label}
                  </text>
                  <text x={26} y={n.h / 2 + 12} className="cc-flow-status">
                    {n.kind.toUpperCase()} · {n.status}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {selectedNode ? (
        <footer className="cc-flow-inspector">
          <div>
            <strong>{selectedNode.label}</strong>
            <span>
              {selectedNode.kind} · {selectedNode.status}
            </span>
          </div>
          <div className="cc-flow-inspector-actions">
            {selectedNode.href ? (
              <button type="button" className="btn btn-sm" onClick={() => router.push(selectedNode.href!)}>
                Open / Edit
              </button>
            ) : null}
            <button type="button" className="btn btn-sm" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
        </footer>
      ) : (
        <footer className="cc-flow-legend">
          <span><i style={{ background: "#22d3ee" }} /> Active</span>
          <span><i style={{ background: "#34d399" }} /> Completed</span>
          <span><i style={{ background: "#fbbf24" }} /> Draft / Pending</span>
          <span><i style={{ background: "#fb7185" }} /> Rejected</span>
          <span><i style={{ background: "#a78bfa" }} /> Project</span>
        </footer>
      )}
    </section>
  );
}
