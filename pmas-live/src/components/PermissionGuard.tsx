"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/core/auth/auth-store";
import { PmasLoader } from "@/components/PmasLoader";
import { hasPermission, isPlatformRole } from "@/shared/permissions";
import { firstAllowedPath, getRouteByPath } from "@/shared/routes";

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

    let allowed = true;
    if (route.platformOnly && !platform) allowed = false;
    if (route.tenantOnly && !hasTenant) allowed = false;
    if (route.permission && !hasPermission(user.role, user.permissions, route.permission)) {
      allowed = false;
    }

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
    const platform = isPlatformRole(user.role);
    const hasTenant = Boolean(user.tenant_id);
    if (route.platformOnly && !platform) return <Redirecting />;
    if (route.tenantOnly && !hasTenant) return <Redirecting />;
    if (route.permission && !hasPermission(user.role, user.permissions, route.permission)) {
      return <Redirecting />;
    }
  }

  return <>{children}</>;
}

function Redirecting() {
  return <PmasLoader message="Redirecting…" />;
}
