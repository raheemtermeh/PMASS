"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import { useI18n } from "@/core/providers/I18nProvider";
import {
  RESET_TOKEN_SESSION_KEY,
  consumeOneTimeSecret,
  stripQueryParamsFromBrowserUrl,
} from "@/shared/security";

function ResetPasswordForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { t } = useI18n();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fromSession = consumeOneTimeSecret(RESET_TOKEN_SESSION_KEY);
    const fromUrl = (search.get("token") ?? "").trim();
    const resolved = fromSession || fromUrl;
    if (resolved) setToken(resolved);
    if (fromUrl) stripQueryParamsFromBrowserUrl(["token"]);
  }, [search]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const tkn = token.trim();
    if (!tkn) {
      setError(t("reset.tokenMissing"));
      return;
    }
    if (password.length < 12) {
      setError(t("reset.passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("reset.passwordsMismatch"));
      return;
    }
    setLoading(true);
    try {
      await httpClient.post(
        "/api/v1/auth/reset-password",
        { token: tkn, password },
        false,
      );
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reset.resetFailed"));
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
          <h1>{t("reset.title")}</h1>
        </div>
        <p className="auth-subtitle">
          {t("reset.subtitle")}
        </p>

        {success ? (
          <div className="auth-reset-ready">
            <p className="landing-success-inline">
              {t("reset.success")}
            </p>
            <button
              type="button"
              className="btn btn-primary auth-submit"
              onClick={() => router.replace("/welcome#login")}
            >
              {t("reset.goToSignIn")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form auth-login-card">
            <div className="auth-login-fields">
              {!token ? (
                <div className="form-group">
                  <label htmlFor="token">{t("reset.resetToken")}</label>
                  <input
                    id="token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                    autoComplete="off"
                    placeholder={t("reset.pasteToken")}
                  />
                </div>
              ) : (
                <input type="hidden" value={token} readOnly />
              )}
              <div className="form-group">
                <label htmlFor="new-password">{t("reset.newPassword")}</label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
                <p className="auth-field-hint">
                  {t("reset.passwordHint")}
                </p>
              </div>
              <div className="form-group">
                <label htmlFor="confirm-password">{t("reset.confirmPassword")}</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
              </div>
            </div>

            {error ? <p className="auth-error">{error}</p> : null}

            <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
              {loading ? t("reset.saving") : t("reset.saveNewPassword")}
            </button>
          </form>
        )}

        <p className="auth-footnote">
          <Link href="/forgot-password">{t("reset.requestNewLink")}</Link>
          {" · "}
          <Link href="/welcome#login">{t("reset.companySignIn")}</Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="auth-page"><p className="text-dim">…</p></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
