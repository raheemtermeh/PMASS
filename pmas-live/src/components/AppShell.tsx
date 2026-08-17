"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { OnboardingWizard } from "./OnboardingWizard";
import { MobileNavProvider, useMobileNav } from "./MobileNavContext";
import { useI18n } from "@/core/providers/I18nProvider";

function AppShellFrame({ children }: { children: ReactNode }) {
  const { open, close } = useMobileNav();
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <div className={`app-container${open ? " mobile-nav-open" : ""}`}>
      <Sidebar />
      <button
        type="button"
        className="mobile-nav-backdrop"
        aria-label={t("nav.closeMenu")}
        tabIndex={open ? 0 : -1}
        onClick={close}
      />
      <div className="main-viewport">
        <TopBar />
        <main className="content-area">
          <div key={pathname} className="page-enter">
            {children}
          </div>
        </main>
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
