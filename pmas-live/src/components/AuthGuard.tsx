"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import { useAuthHydrated, useAuthStore, type AuthUser } from "@/core/auth/auth-store";
import { PmasLoader } from "@/components/PmasLoader";
import { resolveSignOutPath } from "@/shared/auth-portals";
import { useI18n } from "@/core/providers/I18nProvider";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  const [ready, setReady] = useState(false);
  const verifiedTokenRef = useRef<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    // Reading the persisted session must finish first, otherwise a page refresh
    // bounces a signed-in user out to the landing page and straight back.
    if (!hydrated) return;

    let cancelled = false;

    async function verify() {
      if (!token) {
        verifiedTokenRef.current = null;
        setReady(false);
        const role = useAuthStore.getState().user?.role;
        router.replace(resolveSignOutPath(role));
        return;
      }

      // Same token already verified — skip network call.
      if (verifiedTokenRef.current === token) {
        setReady(true);
        return;
      }

      try {
        const me = await httpClient.get<AuthUser>("/api/v1/auth/me");
        if (cancelled) return;
        verifiedTokenRef.current = token;
        useAuthStore.getState().setSession(token, me);
        setReady(true);
      } catch {
        if (cancelled) return;
        verifiedTokenRef.current = null;
        const role = useAuthStore.getState().user?.role;
        useAuthStore.getState().clearSession();
        setReady(false);
        router.replace(resolveSignOutPath(role));
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [hydrated, token, router]);

  if (!ready) {
    return <PmasLoader message={hydrated ? t("auth.verifying") : t("auth.restoring")} />;
  }

  return <>{children}</>;
}
