"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { OnboardingWizard } from "./OnboardingWizard";
import { MobileNavProvider, useMobileNav } from "./MobileNavContext";

function AppShellFrame({ children }: { children: ReactNode }) {
  const { open, close } = useMobileNav();

  return (
    <div className={`app-container${open ? " mobile-nav-open" : ""}`}>
      <Sidebar />
      <button
        type="button"
        className="mobile-nav-backdrop"
        aria-label="Close navigation"
        tabIndex={open ? 0 : -1}
        onClick={close}
      />
      <div className="main-viewport">
        <TopBar />
        <main className="content-area">{children}</main>
      </div>
      <OnboardingWizard />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <MobileNavProvider>
      <AppShellFrame>{children}</AppShellFrame>
    </MobileNavProvider>
  );
}

export { useMobileNav } from "./MobileNavContext";
