"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-viewport">
        <TopBar />
        <main className="content-area">{children}</main>
      </div>
    </div>
  );
}
