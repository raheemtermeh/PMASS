"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import { useAuthHydrated, useAuthStore, type AuthUser } from "@/core/auth/auth-store";
import { PmasLoader } from "@/components/PmasLoader";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  const [ready, setReady] = useState(false);
  const verifiedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    // Reading the persisted session must finish first, otherwise a page refresh
    // bounces a signed-in user out to the landing page and straight back.
    if (!hydrated) return;

    let cancelled = false;

    async function verify() {
      if (!token) {
        verifiedTokenRef.current = null;
        setReady(false);
        router.replace("/welcome");
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
        useAuthStore.getState().clearSession();
        setReady(false);
        router.replace("/welcome");
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [hydrated, token, router]);

  if (!ready) {
    return <PmasLoader message={hydrated ? "Verifying session…" : "Restoring your session…"} />;
  }

  return <>{children}</>;
}
