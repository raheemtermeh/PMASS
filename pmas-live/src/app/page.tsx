"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import { firstAllowedPath } from "@/shared/routes";

export default function HomePage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    async function redirect() {
      try {
        const status = await httpClient.get<{ needs_bootstrap: boolean }>(
          "/api/v1/auth/status",
          false,
        );
        if (status.needs_bootstrap) {
          router.replace("/setup");
          return;
        }
      } catch {
        router.replace("/welcome");
        return;
      }

      if (token && user) {
        router.replace(
          firstAllowedPath(user.role, user.permissions, Boolean(user.tenant_id)),
        );
        return;
      }
      router.replace("/welcome");
    }
    void redirect();
  }, [router, token, user]);

  return (
    <div className="auth-loading">
      <div className="auth-loading-spinner" />
      <p>Loading PMAS Live…</p>
    </div>
  );
}
