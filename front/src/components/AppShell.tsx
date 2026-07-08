"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useAppStore } from "@/features/shell/store/app-store";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const sidebarCollapsed = useAppStore(
    (state) => state.settings.sidebarCollapsed,
  );
  const compactMode = useAppStore((state) => state.settings.compactMode);
  const updateSettings = useAppStore((state) => state.updateSettings);

  useEffect(() => {
    document.documentElement.classList.toggle("compact-mode", Boolean(compactMode));
  }, [compactMode]);

  const handleToggleCollapse = () => {
    updateSettings({ sidebarCollapsed: !sidebarCollapsed });
  };

  return (
    <div className="app-container" id="pmas-shell">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      <div className="main-viewport">
        <TopBar />
        <main id="app-viewport" className="content-area">
          {children}
        </main>
      </div>
    </div>
  );
}
