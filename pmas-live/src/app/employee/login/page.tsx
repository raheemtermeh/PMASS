"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import {
  getRememberMePreference,
  useAuthHydrated,
  useAuthStore,
  type AuthUser,
} from "@/core/auth/auth-store";
import { PasswordField } from "@/components/PasswordField";
import { PmasLoader } from "@/components/PmasLoader";
import { getPasskeyCredential, isPasskeySupported } from "@/core/auth/webauthn";
import { setLastAuthPortal } from "@/shared/auth-portals";
import { firstAllowedPath } from "@/shared/routes";
import { sanitizeInternalPath } from "@/shared/security";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EmployeeLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const hydrated = useAuthHydrated();
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [tenantSlug, setTenantSlug] = useState(search.get("slug") ?? search.get("tenant_slug") ?? "");
  const [loginId, setLoginId] = useState(search.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeysOk, setPasskeysOk] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setRememberMe(getRememberMePreference());
    setPasskeysOk(isPasskeySupported());
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (token && user) {
      router.replace(
        sanitizeInternalPath(
          firstAllowedPath(user.role, user.permissions, Boolean(user.tenant_id)),
        ),
      );
      return;
    }
    setReady(true);
  }, [hydrated, token, user, router]);

  function applySession(res: { token: string; refresh_token?: string; user: AuthUser }) {
    setLastAuthPortal("employee");
    setSession(res.token, res.user, res.refresh_token ?? null, { remember: rememberMe });
    router.replace(
      sanitizeInternalPath(
        firstAllowedPath(res.user.role, res.user.permissions, Boolean(res.user.tenant_id)),
      ),
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const identifier = loginId.trim();
      const slug = tenantSlug.trim().toLowerCase();
      if (!slug) {
        setError("Company ID is required.");
        return;
      }
      const res = await httpClient.post<{ token: string; refresh_token?: string; user: AuthUser }>(
        "/api/v1/auth/login",
        {
          portal: "employee",
          tenant_slug: slug,
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
      const identifier = loginId.trim();
      const slug = tenantSlug.trim().toLowerCase();
      const begin = await httpClient.post<{
        publicKey: Record<string, unknown>;
        session_id: string;
      }>(
        "/api/v1/auth/passkeys/login/begin",
        {
          portal: "employee",
          tenant_slug: slug,
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
          portal: "employee",
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

  if (!ready) {
    return <PmasLoader message="Loading…" />;
  }

  const loginReady = Boolean(tenantSlug.trim() && loginId.trim() && password);

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <div className="auth-brand">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h1>Employee Sign In</h1>
        </div>
        <p className="auth-subtitle">
          Enter your Company ID and the credentials your company admin provided.
        </p>

        <form onSubmit={handleSubmit} className="auth-form auth-login-card">
          <div className="auth-login-fields">
            <div className="form-group">
              <label htmlFor="emp-slug">Company ID</label>
              <input
                id="emp-slug"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="acme-corp"
                required
                autoComplete="organization"
              />
            </div>
            <div className="form-group">
              <label htmlFor="emp-login">Email or username</label>
              <input
                id="emp-login"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <PasswordField
              id="emp-password"
              label="Password"
              value={password}
              onChange={setPassword}
              required
              autoComplete="current-password"
            />
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
              href={`/forgot-password?portal=employee&slug=${encodeURIComponent(
                tenantSlug.trim().toLowerCase(),
              )}${
                EMAIL_PATTERN.test(loginId.trim())
                  ? `&email=${encodeURIComponent(loginId.trim().toLowerCase())}`
                  : ""
              }`}
              className="auth-forgot-link"
            >
              Forgot password?
            </Link>
          </div>

          {error ? <p className="auth-error">{error}</p> : null}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={!loginReady || loading || passkeyLoading}
          >
            {loading ? "Signing in…" : "Sign in to workspace"}
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
          Company Admin? <Link href="/welcome#login">Sign in here</Link>
          {" · "}
          <Link href="/platform/login">Platform admin</Link>
        </p>
      </div>
    </div>
  );
}

export default function EmployeeLoginPage() {
  return (
    <Suspense fallback={<PmasLoader message="Loading…" />}>
      <EmployeeLoginForm />
    </Suspense>
  );
}
