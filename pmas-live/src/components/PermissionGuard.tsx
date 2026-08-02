"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/core/auth/auth-store";
import { PmasLoader } from "@/components/PmasLoader";
import { isPlatformRole } from "@/shared/permissions";
import { canAccessRoute, firstAllowedPath, getRouteByPath } from "@/shared/routes";

export function PermissionGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;
    const route = getRouteByPath(pathname);
    if (!route) return;

    const platform = isPlatformRole(user.role);
    const hasTenant = Boolean(user.tenant_id);
    const allowed = canAccessRoute(route, user.role, user.permissions, hasTenant);

    if (!allowed) {
      if (route.platformOnly && !platform) {
        router.replace("/platform/login");
        return;
      }
      router.replace(firstAllowedPath(user.role, user.permissions, hasTenant));
    }
  }, [pathname, user, router]);

  if (!user) return null;

  const route = getRouteByPath(pathname);
  if (route) {
    const hasTenant = Boolean(user.tenant_id);
    if (!canAccessRoute(route, user.role, user.permissions, hasTenant)) {
      return <Redirecting />;
    }
  }

  return <>{children}</>;
}

function Redirecting() {
  return <PmasLoader message="Redirecting…" />;
}
