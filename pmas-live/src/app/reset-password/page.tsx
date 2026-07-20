"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { httpClient } from "@/core/api/http-client";

function ResetPasswordForm() {
  const router = useRouter();
  const search = useSearchParams();

  const [token, setToken] = useState(search.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!token.trim()) {
      setError("Reset token is required.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await httpClient.post(
        "/api/v1/auth/reset-password",
        { token: token.trim(), password },
        false,
      );
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
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
          <h1>Reset Password</h1>
        </div>
        <p className="auth-subtitle">
          Paste the reset token you received from your administrator and choose a new password.
        </p>

        {success ? (
          <>
            <p className="landing-success-inline" style={{ marginBottom: "1rem" }}>
              Your password has been reset. You can now sign in with your new password.
            </p>
            <button
              type="button"
              className="btn btn-primary auth-submit"
              onClick={() => router.replace("/welcome#login")}
            >
              Go to sign in
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="token">Reset token</label>
              <input
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
              {loading ? "Resetting…" : "Reset password"}
            </button>
          </form>
        )}

        <p className="auth-footnote">
          <Link href="/welcome#login">Company sign in</Link>
          {" · "}
          <Link href="/platform/login">Platform admin sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
