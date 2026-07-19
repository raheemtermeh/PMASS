"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore, type AuthUser } from "@/core/auth/auth-store";
import { isPlatformRole } from "@/shared/permissions";
import { firstAllowedPath } from "@/shared/routes";
import { sanitizeInternalPath } from "@/shared/security";

export default function PlatformLoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

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
              isPlatformRole(user.role)
                ? "/platform/tenants"
                : firstAllowedPath(
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
    setForgotMsg("");
    setLoading(true);
    try {
      const res = await httpClient.post<{ token: string; user: AuthUser }>(
        "/api/v1/auth/login",
        {
          tenant_slug: "platform",
          email,
          password,
        },
        false,
      );
      setSession(res.token, res.user);
      // Same landing as bootstrap setup — platform operators manage companies first.
      router.replace("/platform/tenants");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError("");
    setForgotMsg("");
    if (!email.trim()) {
      setError("Enter your email first, then request a password reset.");
      return;
    }
    setForgotLoading(true);
    try {
      const res = await httpClient.post<{ message: string }>(
        "/api/v1/auth/forgot-password",
        { tenant_slug: "platform", email: email.trim().toLowerCase() },
        false,
      );
      setForgotMsg(res.message || "Request received.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <div className="auth-brand">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h1>Platform Admin</h1>
        </div>
        <p className="auth-subtitle">
          Sign in to review company access requests and provision workspaces.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
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
          {forgotMsg ? <p className="landing-success-inline">{forgotMsg}</p> : null}
          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in to platform panel"}
          </button>
          <button
            type="button"
            className="landing-forgot-link"
            onClick={() => void handleForgotPassword()}
            disabled={forgotLoading}
          >
            {forgotLoading ? "Submitting…" : "Forgot password?"}
          </button>
        </form>

        <p className="auth-footnote">
          Are you a company user?{" "}
          <Link href="/welcome#login">Company sign in</Link>
          {" · "}
          <Link href="/welcome">Home</Link>
        </p>
      </div>
    </div>
  );
}
