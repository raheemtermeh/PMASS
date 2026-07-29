"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import { useAuthHydrated, useAuthStore } from "@/core/auth/auth-store";
import { PmasLoader } from "@/components/PmasLoader";
import { firstAllowedPath } from "@/shared/routes";
import { sanitizeInternalPath } from "@/shared/security";

export default function HomePage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [message, setMessage] = useState("Starting PMAS Live…");

  useEffect(() => {
    if (!hydrated) return;

    // A restored session goes straight to the workspace — the landing page is
    // never rendered in between, so there is no /welcome flash.
    if (token && user) {
      setMessage("Restoring your session…");
      router.replace(
        sanitizeInternalPath(
          firstAllowedPath(user.role, user.permissions, Boolean(user.tenant_id)),
        ),
      );
      return;
    }

    let cancelled = false;
    async function resolveEntry() {
      setMessage("Checking workspace status…");
      try {
        const status = await httpClient.get<{ needs_bootstrap: boolean }>(
          "/api/v1/auth/status",
          false,
        );
        if (cancelled) return;
        router.replace(status.needs_bootstrap ? "/setup" : "/welcome");
      } catch {
        if (!cancelled) router.replace("/welcome");
      }
    }
    void resolveEntry();
    return () => {
      cancelled = true;
    };
  }, [hydrated, router, token, user]);

  return <PmasLoader message={message} />;
}
