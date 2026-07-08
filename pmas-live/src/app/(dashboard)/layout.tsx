"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/AppShell";
import { PermissionGuard } from "@/components/PermissionGuard";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>
        <PermissionGuard>{children}</PermissionGuard>
      </AppShell>
    </AuthGuard>
  );
}
