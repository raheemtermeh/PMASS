"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuthStore, type AuthUser } from "@/core/auth/auth-store";
import { httpClient } from "@/core/api/http-client";
import { PERMISSION_LABELS, type Permission } from "@/shared/permissions";
import { sanitizeDisplayText } from "@/shared/security";

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function roleLabel(role: string): string {
  if (role === "platform_admin" || role === "super_admin") return "Platform Admin";
  if (role === "tenant_admin") return "Company Admin";
  return "Team Member";
}

export default function ProfilePage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);

  const initial = useMemo(() => {
    if (!user) return { first: "", last: "" };
    if (user.first_name || user.last_name) {
      return { first: user.first_name ?? "", last: user.last_name ?? "" };
    }
    return splitName(user.full_name);
  }, [user]);

  const [firstName, setFirstName] = useState(initial.first);
  const [lastName, setLastName] = useState(initial.last);
  const [jobTitle, setJobTitle] = useState(user?.job_title ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  useEffect(() => {
    if (!user) return;
    setFirstName(initial.first);
    setLastName(initial.last);
    setJobTitle(user.job_title ?? "");
    setPhone(user.phone ?? "");
    setBio(user.bio ?? "");
  }, [user, initial.first, initial.last]);

  if (!user || !token) return null;

  const initials = `${firstName[0] ?? ""}${lastName[0] ?? user.full_name[0] ?? "?"}`.toUpperCase();
  const displayName = sanitizeDisplayText(
    [firstName, lastName].filter(Boolean).join(" ") || user.full_name,
  );

  const permissionChips =
    user.role === "tenant_admin" ||
    user.role === "platform_admin" ||
    user.role === "super_admin"
      ? Object.keys(PERMISSION_LABELS)
      : user.permissions;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!firstName.trim() || !lastName.trim()) {
      setError("First name and last name are required.");
      return;
    }

    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        job_title: jobTitle.trim() || null,
        phone: phone.trim() || null,
        bio: bio.trim() || null,
      };

      if (!token) throw new Error("Session expired. Please sign in again.");
      const updated = await httpClient.put<AuthUser>("/api/v1/auth/me", body);
      setSession(token, updated);
      setSuccess("Profile saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setBusy(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");
    if (!currentPassword.trim() || !newPassword.trim()) {
      setPwError("Current and new password are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Password confirmation does not match.");
      return;
    }

    setPwBusy(true);
    try {
      await httpClient.post("/api/v1/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwSuccess("Password changed. Other sessions have been signed out.");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="page-stack profile-page">
      <section className="profile-hero">
        <div className="profile-hero-glow" aria-hidden />
        <div className="profile-hero-inner">
          <div className="profile-avatar-xl" aria-hidden>
            {initials || "?"}
          </div>
          <div className="profile-hero-copy">
            <p className="wizard-kicker">Your profile</p>
            <h2 className="profile-name">{displayName}</h2>
            <p className="profile-meta">
              {sanitizeDisplayText(user.email)}
              {user.job_title ? ` · ${sanitizeDisplayText(user.job_title)}` : ""}
            </p>
            <div className="profile-badges">
              <span className="profile-badge">{roleLabel(user.role)}</span>
              {user.tenant?.name ? (
                <span className="profile-badge profile-badge-muted">
                  {sanitizeDisplayText(user.tenant.name)}
                </span>
              ) : (
                <span className="profile-badge profile-badge-muted">Platform</span>
              )}
              <span className={`profile-badge ${user.is_active ? "profile-badge-ok" : "profile-badge-bad"}`}>
                {user.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="profile-layout">
        <div className="flex-col" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <form className="profile-card" onSubmit={onSubmit}>
          <div className="profile-card-head">
            <h3>Personal details</h3>
            <p className="text-dim">Edit how you appear across PMAS Live.</p>
          </div>

          <div className="grid grid-cols-2">
            <div className="form-group">
              <label htmlFor="first-name">First name</label>
              <input
                id="first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                maxLength={120}
                autoComplete="given-name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="last-name">Last name</label>
              <input
                id="last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                maxLength={120}
                autoComplete="family-name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="job-title">Job title</label>
              <input
                id="job-title"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Product Manager"
                maxLength={255}
              />
            </div>
            <div className="form-group">
              <label htmlFor="phone">Phone</label>
              <input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+98 …"
                maxLength={50}
                autoComplete="tel"
              />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="bio">Bio</label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Short intro about your role and focus areas"
              />
            </div>
          </div>

          {error ? <p className="auth-error">{error}</p> : null}
          {success ? <p className="profile-success">{success}</p> : null}

          <div className="profile-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>

        <form className="profile-card" onSubmit={onChangePassword}>
          <div className="profile-card-head">
            <h3>Security</h3>
            <p className="text-dim">Change your password. This will sign you out of other sessions.</p>
          </div>
          <div className="grid grid-cols-2">
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>

          {pwError ? <p className="auth-error">{pwError}</p> : null}
          {pwSuccess ? <p className="profile-success">{pwSuccess}</p> : null}

          <div className="profile-actions">
            <button type="submit" className="btn btn-primary" disabled={pwBusy}>
              {pwBusy ? "Changing…" : "Change password"}
            </button>
          </div>
        </form>
        </div>

        <aside className="profile-side">
          <section className="profile-card profile-card-compact">
            <h3>Account</h3>
            <dl className="profile-dl">
              <div>
                <dt>Email</dt>
                <dd>{sanitizeDisplayText(user.email)}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{roleLabel(user.role)}</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>{user.tenant?.name ? sanitizeDisplayText(user.tenant.name) : "—"}</dd>
              </div>
              <div>
                <dt>Company ID</dt>
                <dd className="font-mono">{user.tenant?.slug ?? "platform"}</dd>
              </div>
              <div>
                <dt>Member since</dt>
                <dd>
                  {user.created_at
                    ? new Date(user.created_at).toLocaleDateString()
                    : "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="profile-card profile-card-compact">
            <h3>Access map</h3>
            <p className="text-dim" style={{ marginBottom: "0.75rem", fontSize: "0.8rem" }}>
              Panels enabled for your account.
            </p>
            <div className="profile-perm-cloud">
              {permissionChips.map((p) => (
                <span key={p} className="kind-chip">
                  {PERMISSION_LABELS[p as Permission] ?? p}
                </span>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
