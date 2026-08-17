"use client";

import { useI18n } from "@/core/providers/I18nProvider";

interface SkeletonTableProps {
  /** Number of header cells to mirror from the real table. */
  columns: number;
  rows?: number;
  /** Reserve a trailing cell for the row action buttons. */
  withActions?: boolean;
}

/**
 * Placeholder that mirrors the shape of the table it replaces, so content does
 * not jump when the real rows arrive.
 */
export function SkeletonTable({ columns, rows = 6, withActions = true }: SkeletonTableProps) {
  const { t } = useI18n();
  const cells = columns + (withActions ? 1 : 0);

  return (
    <div className="skeleton-table" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t("loader.records")}</span>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          className="skeleton-row"
          key={rowIndex}
          style={{ animationDelay: `${rowIndex * 70}ms` }}
        >
          {Array.from({ length: cells }).map((__, cellIndex) => (
            <span
              className="skeleton-cell"
              key={cellIndex}
              style={{ width: `${cellWidth(cellIndex, cells)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Varies bar widths so the placeholder reads as text rather than a grid. */
function cellWidth(index: number, total: number): number {
  if (index === 0) return 90;
  if (index === total - 1) return 70;
  return [55, 75, 45, 65, 80, 50][index % 6];
}

export function SkeletonBlock({ height = "1rem", width = "100%" }: { height?: string; width?: string }) {
  return <span className="skeleton-cell" style={{ height, width, display: "block" }} />;
}
