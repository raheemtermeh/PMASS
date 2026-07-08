"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore, type AuthUser } from "@/core/auth/auth-store";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [ready, setReady] = useState(false);
  const verifiedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!token) {
        verifiedTokenRef.current = null;
        setReady(false);
        router.replace("/login");
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
        router.replace("/login");
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (!ready) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-spinner" />
        <p>Verifying session…</p>
      </div>
    );
  }

  return <>{children}</>;
}
