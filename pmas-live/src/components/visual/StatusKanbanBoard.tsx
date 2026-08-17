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
import { useUILayout } from "@/shared/hooks/useUILayout";

export interface KanbanColumn {
  id: string;
  label: string;
}

export interface KanbanCard {
  id: string;
  title: string;
  status: string;
  subtitle?: string;
  tone?: string;
}

interface Props {
  layoutKey: string;
  title?: string;
  hint?: string;
  columns: KanbanColumn[];
  cards: KanbanCard[];
  /** Called once when a card lands on a different status column. */
  onStatusChange: (id: string, status: string) => void | Promise<void>;
  onOpen?: (id: string) => void;
}

interface PosMap {
  positions?: Record<string, { x: number; y: number }>;
  pan?: { x: number; y: number };
  scale?: number;
}

const COL_W = 168;
const COL_GAP = 16;
const CARD_H = 56;
const CARD_W = 148;

function statusTone(status: string): string {
  const s = status.toUpperCase();
  if (["DONE", "COMPLETED", "ACTIVE", "READY"].includes(s)) return "#34d399";
  if (["IN PROGRESS", "IN_PROGRESS", "TODO", "PLANNING"].includes(s)) return "#22d3ee";
  if (["BLOCKED", "REJECTED", "CANCELLED"].includes(s)) return "#fb7185";
  if (["BACKLOG", "DRAFT", "ON_HOLD", "ON HOLD", "REVIEW"].includes(s)) return "#fbbf24";
  return "#a78bfa";
}

function defaultCardPos(colIndex: number, cardIndex: number) {
  return {
    x: 24 + colIndex * (COL_W + COL_GAP) + 10,
    y: 72 + cardIndex * (CARD_H + 10),
  };
}

/**
 * Free-form visual board (pan / zoom / drag) modeled after LifecycleFlowGraph.
 * Dropping a card into another column lane fires a single status update.
 * Node positions are debounced to the backend via ui_layouts.
 */
export function StatusKanbanBoard({
  layoutKey,
  title,
  hint,
  columns,
  cards,
  onStatusChange,
  onOpen,
}: Props) {
  const { t, n } = useI18n();
  const { theme } = useTheme();
  const light = theme === "light";
  const { layout, ready, saving, saveLayout } = useUILayout<PosMap>(layoutKey);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [scale, setScale] = useState(0.92);
  const [pan, setPan] = useState({ x: 8, y: 8 });
  const [selected, setSelected] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  const dragRef = useRef<{
    mode: "pan" | "card";
    cardId?: string;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
    origX?: number;
    origY?: number;
  } | null>(null);

  const cardsByStatus = useMemo(() => {
    const m = new Map<string, KanbanCard[]>();
    for (const col of columns) m.set(col.id, []);
    for (const card of cards) {
      const list = m.get(card.status) ?? m.get(columns[0]?.id ?? "") ?? [];
      // If status not in columns, park in first lane visually but keep real status in subtitle.
      if (!m.has(card.status) && columns[0]) {
        m.get(columns[0].id)!.push(card);
      } else {
        list.push(card);
        m.set(card.status, list);
      }
    }
    return m;
  }, [cards, columns]);

  const hydratedRef = useRef(false);
  useEffect(() => {
    hydratedRef.current = false;
  }, [layoutKey]);

  useEffect(() => {
    if (!ready || hydratedRef.current) return;
    hydratedRef.current = true;
    const saved = layout?.positions ?? {};
    const next: Record<string, { x: number; y: number }> = { ...saved };
    columns.forEach((col, ci) => {
      const lane = cardsByStatus.get(col.id) ?? [];
      lane.forEach((card, ri) => {
        if (!next[card.id]) next[card.id] = defaultCardPos(ci, ri);
      });
    });
    setPositions(next);
    if (layout?.pan) setPan(layout.pan);
    if (typeof layout?.scale === "number") setScale(layout.scale);
  }, [ready, layout, columns, cardsByStatus]);

  // Seed positions for newly created cards without resetting existing ones.
  useEffect(() => {
    if (!ready || !hydratedRef.current) return;
    setPositions((prev) => {
      let changed = false;
      const next = { ...prev };
      columns.forEach((col, ci) => {
        const lane = cardsByStatus.get(col.id) ?? [];
        lane.forEach((card, ri) => {
          if (!next[card.id]) {
            next[card.id] = defaultCardPos(ci, ri);
            changed = true;
          }
        });
      });
      return changed ? next : prev;
    });
  }, [ready, cardsByStatus, columns]);

  const persist = useCallback(
    (pos: Record<string, { x: number; y: number }>, nextPan = pan, nextScale = scale) => {
      saveLayout({ positions: pos, pan: nextPan, scale: nextScale });
    },
    [pan, scale, saveLayout],
  );

  const columnAtPoint = useCallback(
    (worldX: number) => {
      let best = columns[0]?.id ?? "";
      let bestDist = Infinity;
      columns.forEach((col, i) => {
        const cx = 24 + i * (COL_W + COL_GAP) + COL_W / 2;
        const d = Math.abs(worldX + CARD_W / 2 - cx);
        if (d < bestDist) {
          bestDist = d;
          best = col.id;
        }
      });
      return best;
    },
    [columns],
  );

  const onPointerDown = (e: ReactPointerEvent, cardId?: string) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (editMode && cardId) {
      const p = positionsRef.current[cardId] ?? { x: 0, y: 0 };
      dragRef.current = {
        mode: "card",
        cardId,
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
        origX: p.x,
        origY: p.y,
      };
      setSelected(cardId);
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

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.mode === "pan") {
      setPan({ x: d.origPanX + dx, y: d.origPanY + dy });
      return;
    }
    if (d.mode === "card" && d.cardId && d.origX != null && d.origY != null) {
      setPositions((prev) => ({
        ...prev,
        [d.cardId!]: { x: d.origX! + dx / scale, y: d.origY! + dy / scale },
      }));
    }
  };

  const onPointerUp = async () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;

    // View mode: allow temporary pan, but never persist or change status.
    if (!editMode) return;

    if (d.mode !== "card" || !d.cardId) {
      if (d.mode === "pan") persist(positionsRef.current, pan, scale);
      return;
    }
    const card = cards.find((c) => c.id === d.cardId);
    const pos = positionsRef.current[d.cardId];
    if (!card || !pos) return;

    const targetStatus = columnAtPoint(pos.x);
    persist(positionsRef.current, pan, scale);

    if (targetStatus && targetStatus !== card.status) {
      setBusyId(card.id);
      try {
        await onStatusChange(card.id, targetStatus);
      } finally {
        setBusyId(null);
      }
    }
  };

  const boardW = Math.max(columns.length * (COL_W + COL_GAP) + 48, 640);
  const boardH = Math.max(
    280,
    ...Object.values(positions).map((p) => p.y + CARD_H + 40),
    72 + Math.max(...columns.map((c) => (cardsByStatus.get(c.id)?.length ?? 0)), 1) * (CARD_H + 10),
  );

  return (
    <section className="viz-board">
      <header className="viz-board-toolbar">
        <div>
          <p className="command-eyebrow">{t("workboard.kanban.liveBoard")}</p>
          <h3>{title ?? t("workboard.kanban.defaultTitle")}</h3>
          <span className="cc-flow-hint">
            {hint ?? t("workboard.kanban.defaultHint")}
            {saving ? ` · ${t("workboard.kanban.saving")}` : ""}
          </span>
        </div>
        <div className="cc-flow-actions">
          <button type="button" className="btn btn-sm" onClick={() => setScale((s) => Math.min(1.8, s + 0.1))}>
            {t("workboard.kanban.zoomIn")}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setScale((s) => Math.max(0.35, s - 0.1))}>
            {t("workboard.kanban.zoomOut")}
          </button>
          <button
            type="button"
            className={`btn btn-sm${editMode ? " cc-flow-edit-on" : ""}`}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? t("workboard.kanban.editing") : t("workboard.kanban.editLayout")}
          </button>
        </div>
      </header>

      <div
        ref={wrapRef}
        className={`viz-board-viewport${editMode ? " is-editing" : ""}`}
        onWheel={(e) => {
          e.preventDefault();
          setScale((s) => Math.max(0.35, Math.min(1.8, s + (e.deltaY > 0 ? -0.07 : 0.07))));
        }}
        onPointerMove={onPointerMove}
        onPointerUp={() => void onPointerUp()}
        onPointerLeave={() => void onPointerUp()}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).dataset.card) return;
          onPointerDown(e);
        }}
      >
        <div className="viz-board-grid" aria-hidden />
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
            <filter id="vizCardGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {columns.map((col, i) => {
            const x = 24 + i * (COL_W + COL_GAP);
            return (
              <g key={col.id} className="viz-lane" transform={`translate(${x}, 16)`}>
                <rect
                  width={COL_W}
                  height={Math.max(boardH - 24, 220)}
                  rx={14}
                  className="viz-lane-bg"
                />
                <text x={12} y={22} className="viz-lane-label">
                  {col.label}
                </text>
                <text x={12} y={38} className="viz-lane-count">
                  {t("workboard.kanban.itemsCount", {
                    count: n((cardsByStatus.get(col.id) ?? []).length),
                  })}
                </text>
              </g>
            );
          })}

          {cards.map((card) => {
            const p = positions[card.id] ?? defaultCardPos(0, 0);
            const color = card.tone || statusTone(card.status);
            const isSel = selected === card.id;
            const busy = busyId === card.id;
            return (
              <g
                key={card.id}
                data-card="1"
                className={`viz-card${isSel ? " is-selected" : ""}${busy ? " is-busy" : ""}`}
                transform={`translate(${p.x}, ${p.y})`}
                filter={isSel ? "url(#vizCardGlow)" : undefined}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  onPointerDown(ev, card.id);
                }}
                onDoubleClick={(ev) => {
                  ev.stopPropagation();
                  onOpen?.(card.id);
                }}
                style={{ cursor: editMode ? "grab" : "pointer" }}
              >
                <rect
                  width={CARD_W}
                  height={CARD_H}
                  rx={12}
                  fill={light ? "#ffffff" : "rgba(15,23,42,0.94)"}
                  stroke={isSel ? (light ? "#0369a1" : "#f8fafc") : color}
                  strokeWidth={isSel ? 2 : 1.35}
                />
                <circle cx={14} cy={CARD_H / 2} r={4.5} fill={color} />
                <text x={26} y={CARD_H / 2 - 4} className="viz-card-title">
                  {card.title.length > 18 ? `${card.title.slice(0, 18)}…` : card.title}
                </text>
                <text x={26} y={CARD_H / 2 + 12} className="viz-card-meta">
                  {card.subtitle || card.status}
                </text>
              </g>
            );
          })}

          {/* keep board width for empty lanes */}
          <rect x={0} y={0} width={boardW} height={1} fill="transparent" />
        </svg>
      </div>
    </section>
  );
}
