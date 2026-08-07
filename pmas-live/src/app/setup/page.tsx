"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore, type AuthUser } from "@/core/auth/auth-store";
import { useI18n } from "@/core/providers/I18nProvider";

export default function SetupPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const status = await httpClient.get<{ needs_bootstrap: boolean }>(
          "/api/v1/auth/status",
          false,
        );
        if (!status.needs_bootstrap) router.replace("/login");
      } catch {
        setError(t("setup.cannotReachApi"));
      }
    }
    void check();
  }, [router, t]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(t("setup.passwordsMismatch"));
      return;
    }
    if (password.length < 8) {
      setError(t("setup.passwordTooShort"));
      return;
    }
    setLoading(true);
    try {
      const res = await httpClient.post<{ token: string; refresh_token?: string; user: AuthUser }>(
        "/api/v1/auth/bootstrap",
        { email, password, full_name: fullName },
        false,
      );
      setSession(res.token, res.user, res.refresh_token ?? null);
      router.replace("/platform/tenants");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setup.setupFailed"));
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
          <h1>{t("setup.title")}</h1>
        </div>
        <p className="auth-subtitle">
          {t("setup.subtitle")}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="fullName">{t("setup.fullName")}</label>
            <input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="email">{t("setup.email")}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">{t("setup.password")}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirm">{t("setup.confirmPassword")}</label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? t("setup.creatingAccount") : t("setup.createPlatformAdmin")}
          </button>
        </form>
      </div>
    </div>
  );
}
