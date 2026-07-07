"use client";

import { useEffect, useRef } from "react";
import { usePmasStore } from "@/hooks/usePmasStore";

type LegacyViewModule = {
  render: (container: HTMLElement) => void;
};

type LegacyViewProps = {
  loadView: () => Promise<LegacyViewModule>;
};

export function LegacyView({ loadView }: LegacyViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const state = usePmasStore();
  const loadViewRef = useRef(loadView);

  loadViewRef.current = loadView;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    const renderView = async () => {
      const mod = await loadViewRef.current();
      if (cancelled || !containerRef.current) return;

      if (containerRef.current._cleanupEvents) {
        containerRef.current._cleanupEvents();
        containerRef.current._cleanupEvents = null;
      }

      mod.render(containerRef.current);
    };

    void renderView();

    return () => {
      cancelled = true;
      if (containerRef.current?._cleanupEvents) {
        containerRef.current._cleanupEvents();
        containerRef.current._cleanupEvents = null;
      }
    };
  }, [state]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", minHeight: "100%" }}
    />
  );
}
