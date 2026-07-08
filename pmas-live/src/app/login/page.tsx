"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore, type AuthUser } from "@/core/auth/auth-store";
import { firstAllowedPath } from "@/shared/routes";
import { sanitizeInternalPath } from "@/shared/security";

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"company" | "platform">("company");

  useEffect(() => {
    async function checkBootstrap() {
      try {
        const status = await httpClient.get<{ needs_bootstrap: boolean }>(
          "/api/v1/auth/status",
          false,
        );
        if (status.needs_bootstrap) {
          router.replace("/setup");
          return;
        }
        if (token && user) {
          router.replace(
            sanitizeInternalPath(
              firstAllowedPath(
                user.role,
                user.permissions,
                Boolean(user.tenant_id),
              ),
            ),
          );
        }
      } catch {
        setError("Cannot reach API server. Start the backend on port 8080.");
      }
    }
    void checkBootstrap();
  }, [router, token, user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await httpClient.post<{ token: string; user: AuthUser }>(
        "/api/v1/auth/login",
        {
          tenant_slug: mode === "platform" ? "platform" : tenantSlug.trim().toLowerCase(),
          email,
          password,
        },
        false,
      );
      setSession(res.token, res.user);
      router.replace(
        sanitizeInternalPath(
          firstAllowedPath(
            res.user.role,
            res.user.permissions,
            Boolean(res.user.tenant_id),
          ),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <div className="auth-brand">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h1>PMAS Live</h1>
        </div>
        <p className="auth-subtitle">
          Sign in to your company workspace. Each company has an isolated panel and data.
        </p>

        <div className="auth-mode-toggle">
          <button
            type="button"
            className={`btn btn-sm${mode === "company" ? " btn-primary" : ""}`}
            onClick={() => setMode("company")}
          >
            Company login
          </button>
          <button
            type="button"
            className={`btn btn-sm${mode === "platform" ? " btn-primary" : ""}`}
            onClick={() => setMode("platform")}
          >
            Platform admin
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "company" && (
            <div className="form-group">
              <label htmlFor="tenantSlug">Company ID</label>
              <input
                id="tenantSlug"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="acme-corp"
                required
                autoComplete="organization"
              />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="auth-footnote">
          New platform?{" "}
          <Link href="/setup">Create platform admin</Link>
        </p>
      </div>
    </div>
  );
}
