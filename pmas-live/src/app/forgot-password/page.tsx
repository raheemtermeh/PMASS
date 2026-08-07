"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import { RESET_TOKEN_SESSION_KEY, storeOneTimeSecret } from "@/shared/security";
import { useI18n } from "@/core/providers/I18nProvider";

type ForgotResponse = {
  message?: string;
  reset_token?: string;
  expires_in_minutes?: number;
};

function ForgotPasswordForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { t } = useI18n();
  const initialSlug = search.get("slug") ?? search.get("tenant_slug") ?? "";
  const initialEmail = search.get("email") ?? "";
  const portalHint = search.get("portal");
  const isPlatform = initialSlug === "platform" || search.get("platform") === "1";
  const isEmployeePortal = portalHint === "employee";

  const [tenantSlug, setTenantSlug] = useState(isPlatform ? "platform" : initialSlug);
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [expiresMins, setExpiresMins] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const signInHref = useMemo(() => {
    if (tenantSlug === "platform" || isPlatform) return "/platform/login";
    if (isEmployeePortal || portalHint === "employee") {
      const slug = tenantSlug.trim().toLowerCase();
      return slug ? `/employee/login?slug=${encodeURIComponent(slug)}` : "/employee/login";
    }
    return "/welcome#login";
  }, [tenantSlug, isPlatform, isEmployeePortal, portalHint]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setResetToken("");
    setExpiresMins(null);

    const slug = tenantSlug.trim().toLowerCase();
    const mail = email.trim().toLowerCase();
    if (!mail) {
      setError(t("forgot.emailRequired"));
      return;
    }
    if (!slug) {
      setError(t("forgot.companyIdRequired"));
      return;
    }

    setLoading(true);
    try {
      const res = await httpClient.post<ForgotResponse>(
        "/api/v1/auth/forgot-password",
        { tenant_slug: slug, email: mail },
        false,
      );
      setMessage(res.message || t("common.continue"));
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
          <h1>{t("forgot.title")}</h1>
        </div>
        <p className="auth-subtitle">
          {t("forgot.subtitle")}
        </p>

        {resetToken ? (
          <div className="auth-reset-ready">
            <p className="landing-success-inline">{message}</p>
            {expiresMins ? (
              <p className="text-dim" style={{ fontSize: "0.8rem" }}>
                {t("forgot.linkExpires", { minutes: expiresMins })}
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
              {t("forgot.continueReset")}
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
              {t("forgot.differentEmail")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form auth-login-card">
            <div className="auth-login-fields">
              {isPlatform ? (
                <input type="hidden" value="platform" readOnly />
              ) : (
                <div className="form-group">
                  <label htmlFor="forgot-slug">{t("forgot.companyId")}</label>
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
                <label htmlFor="forgot-email">{t("forgot.email")}</label>
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
              <p className="landing-success-inline">{message}</p>
            ) : null}

            <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
              {loading ? t("forgot.checking") : t("forgot.continue")}
            </button>
          </form>
        )}

        <p className="auth-footnote">
          <Link href={signInHref}>{t("forgot.backToSignIn")}</Link>
          {" · "}
          <Link href="/reset-password">{t("forgot.alreadyHaveLink")}</Link>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="auth-page"><p className="text-dim">{/* loading */}…</p></div>}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
