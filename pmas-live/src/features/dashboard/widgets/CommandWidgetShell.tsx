"use client";

import type { ReactNode } from "react";
import type { WidgetSize } from "../commandCenterLayout";

interface Props {
  title: string;
  subtitle?: string;
  size?: WidgetSize;
  headerRight?: ReactNode;
  customize?: ReactNode;
  children: ReactNode;
  className?: string;
  dragHandleProps?: {
    draggable?: boolean;
    onDragStart?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
    onDragEnd?: () => void;
  };
  dragging?: boolean;
  dragOver?: boolean;
}

export function CommandWidgetShell({
  title,
  subtitle,
  size = "full",
  headerRight,
  customize,
  children,
  className = "",
  dragHandleProps,
  dragging,
  dragOver,
}: Props) {
  return (
    <section
      className={`data-panel cc-panel cc-widget cc-widget-${size}${dragging ? " cc-widget-dragging" : ""}${dragOver ? " cc-widget-drag-over" : ""} ${className}`.trim()}
      {...dragHandleProps}
    >
      <div className="panel-header cc-widget-head">
        <div className="cc-widget-title-block">
          {customize ? <div className="cc-widget-customize">{customize}</div> : null}
          <div>
            <h3 className="panel-title">{title}</h3>
            {subtitle ? <p className="cc-widget-sub">{subtitle}</p> : null}
          </div>
        </div>
        {headerRight ? <div className="cc-widget-actions">{headerRight}</div> : null}
      </div>
      <div className="cc-widget-body">{children}</div>
    </section>
  );
}
