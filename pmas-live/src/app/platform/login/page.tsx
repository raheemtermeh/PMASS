"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import {
  getRememberMePreference,
  useAuthStore,
  type AuthUser,
} from "@/core/auth/auth-store";
import { getPasskeyCredential, isPasskeySupported } from "@/core/auth/webauthn";
import { isPlatformRole } from "@/shared/permissions";
import { firstAllowedPath } from "@/shared/routes";
import { sanitizeInternalPath } from "@/shared/security";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PlatformLoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeysOk, setPasskeysOk] = useState(false);

  useEffect(() => {
    setRememberMe(getRememberMePreference());
    setPasskeysOk(isPasskeySupported());
  }, []);

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

  function applySession(res: { token: string; refresh_token?: string; user: AuthUser }) {
    setSession(res.token, res.user, res.refresh_token ?? null, { remember: rememberMe });
    router.replace("/platform/tenants");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const identifier = email.trim();
      const res = await httpClient.post<{ token: string; refresh_token?: string; user: AuthUser }>(
        "/api/v1/auth/login",
        {
          tenant_slug: "platform",
          ...(EMAIL_PATTERN.test(identifier)
            ? { email: identifier.toLowerCase() }
            : { username: identifier }),
          password,
          remember_me: rememberMe,
        },
        false,
      );
      applySession(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskeyLogin() {
    setError("");
    setPasskeyLoading(true);
    try {
      if (!isPasskeySupported()) {
        throw new Error("Passkeys are not supported in this browser");
      }
      const identifier = email.trim();
      const begin = await httpClient.post<{
        publicKey: Record<string, unknown>;
        session_id: string;
      }>(
        "/api/v1/auth/passkeys/login/begin",
        {
          tenant_slug: "platform",
          ...(identifier
            ? EMAIL_PATTERN.test(identifier)
              ? { email: identifier.toLowerCase() }
              : { username: identifier }
            : {}),
        },
        false,
      );
      const credential = await getPasskeyCredential(begin.publicKey);
      const res = await httpClient.post<{ token: string; refresh_token?: string; user: AuthUser }>(
        "/api/v1/auth/passkeys/login/finish",
        {
          session_id: begin.session_id,
          credential,
          remember_me: rememberMe,
        },
        false,
      );
      applySession(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey sign-in failed");
    } finally {
      setPasskeyLoading(false);
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

        <form onSubmit={handleSubmit} className="auth-form auth-login-card">
          <div className="auth-login-fields">
            <div className="form-group">
              <label htmlFor="email">Email or username</label>
              <input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
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
          </div>

          <div className="auth-login-meta">
            <label className="auth-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span className="auth-remember-text">
                <strong>Remember me</strong>
                <em>Stay signed in for 30 days</em>
              </span>
            </label>
            <Link
              href={`/forgot-password?slug=platform&email=${encodeURIComponent(
                EMAIL_PATTERN.test(email.trim()) ? email.trim().toLowerCase() : "",
              )}`}
              className="auth-forgot-link"
            >
              Forgot password?
            </Link>
          </div>

          {error ? <p className="auth-error">{error}</p> : null}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading || passkeyLoading}
          >
            {loading ? "Signing in…" : "Sign in to platform panel"}
          </button>

          {passkeysOk ? (
            <div className="auth-passkey-block">
              <div className="auth-passkey-divider" aria-hidden>
                <span>or</span>
              </div>
              <button
                type="button"
                className="auth-passkey-btn"
                disabled={loading || passkeyLoading}
                onClick={() => void handlePasskeyLogin()}
              >
                <svg className="auth-passkey-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M12 11v7.5M12 18.5l2.2-1.4M12 16.2l2.2-1.4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7.5 10.2a5.2 5.2 0 1 1 9 0"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="auth-passkey-copy">
                  <strong>{passkeyLoading ? "Waiting for device…" : "Sign in with passkey"}</strong>
                  <em>Face ID · Touch ID · Windows Hello · security key</em>
                </span>
              </button>
            </div>
          ) : null}
        </form>

        <p className="auth-footnote">
          Are you a company user?{" "}
          <Link href="/welcome#login">Company sign in</Link>
          {" · "}
          <Link href="/forgot-password?slug=platform">Forgot password</Link>
        </p>
      </div>
    </div>
  );
}
