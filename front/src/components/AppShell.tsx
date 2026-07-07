"use client";

import { useEffect, type ReactNode } from "react";
import { store } from "@/legacy/state";
import { usePmasStore } from "@/hooks/usePmasStore";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const state = usePmasStore();
  const sidebarCollapsed = state.settings?.sidebarCollapsed ?? false;

  useEffect(() => {
    document.documentElement.classList.toggle(
      "compact-mode",
      Boolean(state.settings?.compactMode),
    );
  }, [state.settings?.compactMode]);

  const handleToggleCollapse = () => {
    store.updateSettings({ sidebarCollapsed: !sidebarCollapsed });
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
