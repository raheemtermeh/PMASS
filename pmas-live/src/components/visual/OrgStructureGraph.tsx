"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTheme } from "@/core/providers/ThemeProvider";
import { useI18n } from "@/core/providers/I18nProvider";
import { localizedEnumLabel, statusTranslationKey } from "@/lib/localized-labels";
import { useUILayout } from "@/shared/hooks/useUILayout";
import type { Company, Department, Team } from "@/features/vsm/types";

interface Props {
  company?: Company | null;
  departments: Department[];
  teams: Team[];
  empName: (id?: string | null) => string;
  onMoveTeam: (teamId: string, departmentId: string) => void | Promise<void>;
  highlightId?: string;
}

interface GraphNode {
  id: string;
  kind: "company" | "department" | "team";
  label: string;
  status: string;
  meta: string;
  entityId: string;
  departmentId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PosMap {
  positions?: Record<string, { x: number; y: number }>;
  pan?: { x: number; y: number };
  scale?: number;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (["ACTIVE", "LIVE"].includes(s)) return "#22d3ee";
  if (["INACTIVE", "ARCHIVED"].includes(s)) return "#94a3b8";
  return "#a78bfa";
}

function localizedOrgStatus(status: string, t: Translate): string {
  const key =
    statusTranslationKey(status) ??
    (status.trim().toUpperCase() === "LIVE" ? "graphView.org.statuses.live" : null);
  return localizedEnumLabel(status, key, t);
}

function buildDefault(
  company: Company | null | undefined,
  departments: Department[],
  teams: Team[],
  empName: (id?: string | null) => string,
  t: Translate,
): { nodes: GraphNode[]; edges: { id: string; from: string; to: string }[] } {
  const nodes: GraphNode[] = [];
  const edges: { id: string; from: string; to: string }[] = [];

  nodes.push({
    id: "company",
    kind: "company",
    label: company?.name || t("graphView.org.company"),
    status: "LIVE",
    meta: t("graphView.org.organizationRoot"),
    entityId: company?.id ?? "company",
    x: 40,
    y: 160,
    w: 160,
    h: 58,
  });

  departments.forEach((dept, di) => {
    const did = `dept:${dept.id}`;
    const y = 36 + di * 120;
    nodes.push({
      id: did,
      kind: "department",
      label: dept.name,
      status: dept.status,
      meta: t("graphView.org.manager", { name: empName(dept.manager_id) }),
      entityId: dept.id,
      x: 280,
      y,
      w: 170,
      h: 54,
    });
    edges.push({ id: `e-c-${dept.id}`, from: "company", to: did });

    const deptTeams = teams.filter((t) => t.department_id === dept.id);
    deptTeams.forEach((team, ti) => {
      const tid = `team:${team.id}`;
      nodes.push({
        id: tid,
        kind: "team",
        label: team.name,
        status: team.status,
        meta: t("graphView.org.lead", { name: empName(team.lead_id) }),
        entityId: team.id,
        departmentId: dept.id,
        x: 520 + (ti % 2) * 16,
        y: y - 8 + ti * 48,
        w: 150,
        h: 44,
      });
      edges.push({ id: `e-t-${team.id}`, from: did, to: tid });
    });
  });

  return { nodes, edges };
}

/**
 * Organization structure as a free-form graph (same interaction model as home LifecycleFlowGraph).
 * Dragging a team onto a department fires MoveTeam once; positions debounce to ui_layouts.
 */
export function OrgStructureGraph({
  company,
  departments,
  teams,
  empName,
  onMoveTeam,
  highlightId,
}: Props) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const light = theme === "light";
  const layoutKey = `org-structure:${company?.id ?? "default"}`;
  const { layout, ready, saving, saveLayout } = useUILayout<PosMap>(layoutKey);
  const [editMode, setEditMode] = useState(false);
  const [scale, setScale] = useState(0.88);
  const [pan, setPan] = useState({ x: 10, y: 10 });
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const built = useMemo(
    () => buildDefault(company, departments, teams, empName, t),
    [company, departments, teams, empName, t],
  );

  const [nodes, setNodes] = useState<GraphNode[]>(built.nodes);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edges = built.edges;

  useEffect(() => {
    if (!ready) return;
    const saved = layout?.positions ?? {};
    setNodes(
      built.nodes.map((n) => (saved[n.id] ? { ...n, x: saved[n.id].x, y: saved[n.id].y } : n)),
    );
    if (layout?.pan) setPan(layout.pan);
    if (typeof layout?.scale === "number") setScale(layout.scale);
  }, [ready, layout, built.nodes]);

  const dragRef = useRef<{
    mode: "pan" | "node";
    nodeId?: string;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
    origX?: number;
    origY?: number;
  } | null>(null);

  const persist = useCallback(
    (list: GraphNode[], nextPan = pan, nextScale = scale) => {
      const positions: Record<string, { x: number; y: number }> = {};
      for (const n of list) positions[n.id] = { x: n.x, y: n.y };
      saveLayout({ positions, pan: nextPan, scale: nextScale });
    },
    [pan, scale, saveLayout],
  );

  const findDropDepartment = useCallback(
    (teamNode: GraphNode, list: GraphNode[]) => {
      const cx = teamNode.x + teamNode.w / 2;
      const cy = teamNode.y + teamNode.h / 2;
      let best: GraphNode | null = null;
      let bestDist = Infinity;
      for (const n of list) {
        if (n.kind !== "department") continue;
        const nx = n.x + n.w / 2;
        const ny = n.y + n.h / 2;
        const dist = Math.hypot(cx - nx, cy - ny);
        const near =
          cx >= n.x - 40 &&
          cx <= n.x + n.w + 120 &&
          cy >= n.y - 40 &&
          cy <= n.y + n.h + 80;
        if (near && dist < bestDist) {
          bestDist = dist;
          best = n;
        }
      }
      return best;
    },
    [],
  );

  const onPointerDown = (e: ReactPointerEvent, nodeId?: string) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (editMode && nodeId) {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node || node.kind === "company") {
        // company only pans when not edit-dragging
        if (!node) return;
      }
      if (node && (node.kind === "team" || node.kind === "department")) {
        dragRef.current = {
          mode: "node",
          nodeId,
          startX: e.clientX,
          startY: e.clientY,
          origPanX: pan.x,
          origPanY: pan.y,
          origX: node.x,
          origY: node.y,
        };
        setSelected(nodeId);
        return;
      }
    }
    dragRef.current = {
      mode: "pan",
      startX: e.clientX,
      startY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.mode === "pan") {
      setPan({ x: d.origPanX + dx, y: d.origPanY + dy });
      return;
    }
    if (d.mode === "node" && d.nodeId && d.origX != null && d.origY != null) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === d.nodeId ? { ...n, x: d.origX! + dx / scale, y: d.origY! + dy / scale } : n,
        ),
      );
    }
  };

  const onPointerUp = async () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;

    // View mode: pan/zoom stay local only — never hit the layout API.
    if (!editMode) return;

    if (d.mode === "pan") {
      persist(nodesRef.current, pan, scale);
      return;
    }

    const list = nodesRef.current;
    persist(list, pan, scale);

    if (d.mode !== "node" || !d.nodeId?.startsWith("team:")) return;
    const teamNode = list.find((n) => n.id === d.nodeId);
    if (!teamNode) return;

    const dept = findDropDepartment(teamNode, list);
    if (!dept || dept.entityId === teamNode.departmentId) {
      setMsg("");
      return;
    }

    setBusy(true);
    setMsg(t("graphView.org.moving", { team: teamNode.label, department: dept.label }));
    try {
      await onMoveTeam(teamNode.entityId, dept.entityId);
      setMsg(t("graphView.org.saved", { team: teamNode.label, department: dept.label }));
      setNodes((prev) =>
        prev.map((n) =>
          n.id === teamNode.id ? { ...n, departmentId: dept.entityId } : n,
        ),
      );
    } catch {
      setMsg(t("graphView.org.moveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  const selectedNode = nodes.find((n) => n.id === selected) ?? null;
  const empty = departments.length === 0;

  return (
    <section className="viz-board org-viz">
      <header className="viz-board-toolbar">
        <div>
          <p className="command-eyebrow">{t("graphView.org.eyebrow")}</p>
          <h3>{t("graphView.org.title")}</h3>
          <span className="cc-flow-hint">
            {t("graphView.org.hint")}
            {saving ? ` · ${t("graphView.org.saving")}` : ""}
            {busy ? ` · ${t("graphView.org.syncing")}` : ""}
          </span>
        </div>
        <div className="cc-flow-actions">
          <button type="button" className="btn btn-sm" onClick={() => setScale((s) => Math.min(1.8, s + 0.1))}>
            {t("graphView.org.zoomIn")}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setScale((s) => Math.max(0.35, s - 0.1))}>
            {t("graphView.org.zoomOut")}
          </button>
          <button
            type="button"
            className={`btn btn-sm${editMode ? " cc-flow-edit-on" : ""}`}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? t("graphView.org.editing") : t("graphView.org.editLayout")}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setNodes(built.nodes);
              persist(built.nodes);
            }}
          >
            {t("graphView.org.reset")}
          </button>
        </div>
      </header>

      <div
        className={`viz-board-viewport org-viz-viewport${editMode ? " is-editing" : ""}`}
        onWheel={(e) => {
          e.preventDefault();
          setScale((s) => Math.max(0.35, Math.min(1.8, s + (e.deltaY > 0 ? -0.07 : 0.07))));
        }}
        onPointerMove={onPointerMove}
        onPointerUp={() => void onPointerUp()}
        onPointerLeave={() => void onPointerUp()}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).dataset.node) return;
          onPointerDown(e);
        }}
      >
        <div className="viz-board-grid" aria-hidden />
        {empty ? (
          <div className="cc-flow-empty">
            <strong>{t("graphView.org.emptyTitle")}</strong>
            <span>{t("graphView.org.emptyDescription")}</span>
          </div>
        ) : (
          <svg
            className="viz-board-svg"
            width="100%"
            height="100%"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: "0 0",
            }}
          >
            <defs>
              <linearGradient id="orgEdgeGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0.4" />
              </linearGradient>
              <filter id="orgNodeGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
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
              return (
                <path
                  key={e.id}
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  className="cc-flow-edge org-viz-edge"
                  fill="none"
                  stroke="url(#orgEdgeGrad)"
                  strokeWidth={1.8}
                />
              );
            })}

            {nodes.map((n) => {
              const color = statusColor(n.status);
              const isSel = selected === n.id || highlightId === n.entityId;
              return (
                <g
                  key={n.id}
                  data-node="1"
                  id={n.kind === "department" ? `dept-${n.entityId}` : n.kind === "team" ? `team-${n.entityId}` : undefined}
                  className={`cc-flow-node org-viz-node org-viz-node-${n.kind}${isSel ? " is-selected" : ""}`}
                  transform={`translate(${n.x}, ${n.y})`}
                  filter={n.kind === "company" || isSel ? "url(#orgNodeGlow)" : undefined}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    onPointerDown(ev, n.id);
                  }}
                  style={{ cursor: editMode && n.kind !== "company" ? "grab" : "pointer" }}
                >
                  <rect
                    width={n.w}
                    height={n.h}
                    rx={n.kind === "company" ? 16 : 12}
                    fill={
                      light
                        ? n.kind === "company"
                          ? "rgba(3,105,161,0.14)"
                          : n.kind === "department"
                            ? "#ffffff"
                            : "#f1f5f9"
                        : n.kind === "company"
                          ? "rgba(99,102,241,0.22)"
                          : n.kind === "department"
                            ? "rgba(15,23,42,0.94)"
                            : "rgba(30,27,46,0.94)"
                    }
                    stroke={isSel ? (light ? "#0369a1" : "#f8fafc") : color}
                    strokeWidth={isSel ? 2.2 : 1.4}
                  />
                  <circle cx={14} cy={n.h / 2} r={4.5} fill={color} />
                  <text x={26} y={n.h / 2 - 4} className="cc-flow-label">
                    {n.label.length > 18 ? `${n.label.slice(0, 18)}…` : n.label}
                  </text>
                  <text x={26} y={n.h / 2 + 12} className="cc-flow-status">
                    {t(`graphView.org.kinds.${n.kind}`)} ·{" "}
                    {localizedOrgStatus(n.status, t)}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <footer className="cc-flow-legend">
        {msg ? <span className="org-viz-msg">{msg}</span> : null}
        {selectedNode ? (
          <span>
            <strong>{selectedNode.label}</strong> — {selectedNode.meta}
          </span>
        ) : (
          <>
            <span><i style={{ background: "#22d3ee" }} /> {t("statuses.active")}</span>
            <span><i style={{ background: "#a78bfa" }} /> {t("graphView.org.kinds.team")}</span>
            <span><i style={{ background: "#94a3b8" }} /> {t("statuses.inactive")}</span>
          </>
        )}
      </footer>
    </section>
  );
}
