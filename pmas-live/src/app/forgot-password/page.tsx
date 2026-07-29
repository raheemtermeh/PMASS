"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import { RESET_TOKEN_SESSION_KEY, storeOneTimeSecret } from "@/shared/security";

type ForgotResponse = {
  message?: string;
  reset_token?: string;
  expires_in_minutes?: number;
};

function ForgotPasswordForm() {
  const router = useRouter();
  const search = useSearchParams();
  const initialSlug = search.get("slug") ?? search.get("tenant_slug") ?? "";
  const initialEmail = search.get("email") ?? "";
  const isPlatform = initialSlug === "platform" || search.get("platform") === "1";

  const [tenantSlug, setTenantSlug] = useState(isPlatform ? "platform" : initialSlug);
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [expiresMins, setExpiresMins] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const signInHref = useMemo(
    () => (tenantSlug === "platform" || isPlatform ? "/platform/login" : "/welcome#login"),
    [tenantSlug, isPlatform],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setResetToken("");
    setExpiresMins(null);

    const slug = tenantSlug.trim().toLowerCase();
    const mail = email.trim().toLowerCase();
    if (!mail) {
      setError("Email is required.");
      return;
    }
    if (!slug) {
      setError("Company ID is required.");
      return;
    }

    setLoading(true);
    try {
      const res = await httpClient.post<ForgotResponse>(
        "/api/v1/auth/forgot-password",
        { tenant_slug: slug, email: mail },
        false,
      );
      setMessage(res.message || "If an account exists, you can continue.");
      if (res.reset_token) {
        setResetToken(res.reset_token);
        setExpiresMins(res.expires_in_minutes ?? 60);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-login-card">
        <div className="auth-brand">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h1>Forgot password</h1>
        </div>
        <p className="auth-subtitle">
          Enter your company and email. We will prepare a one-time reset link.
        </p>

        {resetToken ? (
          <div className="auth-reset-ready">
            <p className="landing-success-inline">{message}</p>
            {expiresMins ? (
              <p className="text-dim" style={{ fontSize: "0.8rem" }}>
                Link expires in about {expiresMins} minutes.
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn-primary auth-submit"
              onClick={() => {
                storeOneTimeSecret(RESET_TOKEN_SESSION_KEY, resetToken);
                router.push("/reset-password");
              }}
            >
              Continue to reset password
            </button>
            <button
              type="button"
              className="auth-forgot-link"
              style={{ alignSelf: "center" }}
              onClick={() => {
                setResetToken("");
                setMessage("");
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form auth-login-card">
            <div className="auth-login-fields">
              {isPlatform ? (
                <input type="hidden" value="platform" readOnly />
              ) : (
                <div className="form-group">
                  <label htmlFor="forgot-slug">Company ID</label>
                  <input
                    id="forgot-slug"
                    value={tenantSlug}
                    onChange={(e) => setTenantSlug(e.target.value)}
                    placeholder="acme-corp"
                    required
                    autoComplete="organization"
                  />
                </div>
              )}
              <div className="form-group">
                <label htmlFor="forgot-email">Email</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {error ? <p className="auth-error">{error}</p> : null}
            {message && !resetToken ? (
              <p className="landing-success-inline">
                {message} Contact your company admin if you do not see a continue step.
              </p>
            ) : null}

            <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
              {loading ? "Checking…" : "Continue"}
            </button>
          </form>
        )}

        <p className="auth-footnote">
          <Link href={signInHref}>Back to sign in</Link>
          {" · "}
          <Link href="/reset-password">I already have a reset link</Link>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="auth-page"><p className="text-dim">Loading…</p></div>}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
