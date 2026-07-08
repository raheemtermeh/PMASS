"use client";

import { useEffect, useRef } from "react";
import { store } from "@/features/shell/store/state-facade";

type LegacyViewModule = {
  render: (container: HTMLElement) => void;
};

type LegacyViewProps = {
  loadView: () => Promise<LegacyViewModule>;
};

export function LegacyView({ loadView }: LegacyViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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

    const unsubscribe = store.subscribe(() => {
      void renderView();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (container._cleanupEvents) {
        container._cleanupEvents();
        container._cleanupEvents = null;
      }
    };
  }, [loadView]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", minHeight: "100%" }}
    />
  );
}
