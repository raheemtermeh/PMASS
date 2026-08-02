"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore, type AuthUser } from "@/core/auth/auth-store";
import { httpClient } from "@/core/api/http-client";
import { createPasskeyCredential, isPasskeySupported } from "@/core/auth/webauthn";
import { PasswordField } from "@/components/PasswordField";
import { useToast } from "@/components/Toast";
import { COUNTRY_DIAL_CODES, splitPhone, joinPhone } from "@/shared/phone";
import { readAvatarFile } from "@/shared/avatar";
import { resolveSignOutPath } from "@/shared/auth-portals";
import { sanitizeDisplayText } from "@/shared/security";

interface PasskeyRow {
  id: string;
  name: string;
  created_at: string;
  last_used_at?: string | null;
}

type ProfileTab = "identity" | "security" | "passkeys";

const BIO_MAX = 1000;

const TABS: { id: ProfileTab; label: string; hint: string }[] = [
  { id: "identity", label: "Identity", hint: "Name, phone, bio" },
  { id: "security", label: "Security", hint: "Password" },
  { id: "passkeys", label: "Passkeys", hint: "Passwordless" },
];

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function roleLabel(role: string): string {
  if (role === "platform_admin" || role === "super_admin") return "Platform Admin";
  if (role === "tenant_admin") return "Company Admin";
  return "Employee";
}

export default function ProfilePage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);

  const initial = useMemo(() => {
    if (!user) return { first: "", last: "" };
    if (user.first_name || user.last_name) {
      return { first: user.first_name ?? "", last: user.last_name ?? "" };
    }
    return splitName(user.full_name);
  }, [user]);

  const initialPhone = useMemo(() => splitPhone(user?.phone), [user?.phone]);

  const [tab, setTab] = useState<ProfileTab>("identity");
  const [firstName, setFirstName] = useState(initial.first);
  const [lastName, setLastName] = useState(initial.last);
  const [jobTitle, setJobTitle] = useState(user?.job_title ?? "");
  const [dialCode, setDialCode] = useState(initialPhone.dial);
  const [phoneNumber, setPhoneNumber] = useState(initialPhone.number);
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatar, setAvatar] = useState<string | null>(user?.avatar_url ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");
  const router = useRouter();
  const { showToast } = useToast();

  const [pkName, setPkName] = useState("");
  const [pkBusy, setPkBusy] = useState(false);
  const [pkError, setPkError] = useState("");
  const [pkSuccess, setPkSuccess] = useState("");
  const [passkeysOk, setPasskeysOk] = useState(false);
  const qc = useQueryClient();

  const { data: passkeys = [], isLoading: pkLoading } = useQuery({
    queryKey: ["passkeys", user?.id],
    queryFn: () => httpClient.get<PasskeyRow[]>("/api/v1/auth/passkeys"),
    enabled: Boolean(token && user),
    staleTime: 15_000,
  });

  useEffect(() => {
    setPasskeysOk(isPasskeySupported());
  }, []);

  useEffect(() => {
    if (!user) return;
    const parsed = splitPhone(user.phone);
    setFirstName(initial.first);
    setLastName(initial.last);
    setJobTitle(user.job_title ?? "");
    setDialCode(parsed.dial);
    setPhoneNumber(parsed.number);
    setBio(user.bio ?? "");
    setAvatar(user.avatar_url ?? null);
  }, [user, initial.first, initial.last]);

  if (!user || !token) return null;

  const initials = `${firstName[0] ?? ""}${lastName[0] ?? user.full_name[0] ?? "?"}`.toUpperCase();
  const displayName = sanitizeDisplayText(
    [firstName, lastName].filter(Boolean).join(" ") || user.full_name,
  );

  const composedPhone = joinPhone(dialCode, phoneNumber);

  const isDirty =
    firstName.trim() !== (initial.first ?? "") ||
    lastName.trim() !== (initial.last ?? "") ||
    jobTitle.trim() !== (user.job_title ?? "") ||
    composedPhone !== (user.phone ?? "") ||
    bio.trim() !== (user.bio ?? "") ||
    (avatar ?? "") !== (user.avatar_url ?? "");

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
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
        phone: composedPhone || null,
        bio: bio.trim() || null,
        avatar_url: avatar ?? "",
      };

      if (!token) throw new Error("Session expired. Please sign in again.");
      const updated = await httpClient.put<AuthUser>("/api/v1/auth/me", body);
      setSession(token, updated);
      showToast("Profile updated successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save profile";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function onPickAvatar(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      setAvatar(await readAvatarFile(file));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not read that image";
      setError(msg);
      showToast(msg, "error");
    } finally {
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwError("");
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
      showToast("Password changed. Please sign in again.");
      const signOutPath = resolveSignOutPath(user?.role);
      clearSession();
      router.replace(signOutPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to change password";
      setPwError(msg);
      showToast(msg, "error");
    } finally {
      setPwBusy(false);
    }
  }

  async function onAddPasskey(e: FormEvent) {
    e.preventDefault();
    setPkError("");
    setPkSuccess("");
    if (!passkeysOk) {
      setPkError("Passkeys are not supported in this browser.");
      return;
    }
    setPkBusy(true);
    try {
      const begin = await httpClient.post<{
        publicKey: Record<string, unknown>;
        session_id: string;
      }>("/api/v1/auth/passkeys/register/begin", {});
      const credential = await createPasskeyCredential(begin.publicKey);
      await httpClient.post("/api/v1/auth/passkeys/register/finish", {
        session_id: begin.session_id,
        credential,
        name: pkName.trim() || "Passkey",
      });
      setPkName("");
      setPkSuccess("Passkey added. You can use it on the sign-in screen.");
      void qc.invalidateQueries({ queryKey: ["passkeys"] });
    } catch (err) {
      setPkError(err instanceof Error ? err.message : "Failed to add passkey");
    } finally {
      setPkBusy(false);
    }
  }

  async function onDeletePasskey(id: string, name: string) {
    if (!window.confirm(`Remove passkey “${name}”?`)) return;
    setPkError("");
    try {
      await httpClient.delete(`/api/v1/auth/passkeys/${id}`);
      setPkSuccess("Passkey removed.");
      void qc.invalidateQueries({ queryKey: ["passkeys"] });
    } catch (err) {
      setPkError(err instanceof Error ? err.message : "Failed to remove passkey");
    }
  }

  return (
    <div className="atelier profile-page">
      <section className="atelier-hero atelier-hero-profile">
        <div className="atelier-orbit" aria-hidden>
          <span className="atelier-orb atelier-orb-a" />
          <span className="atelier-orb atelier-orb-b" />
          <span className="atelier-grid" />
        </div>

        <div className="atelier-hero-inner">
          <div className="atelier-avatar-stage">
            <div className="atelier-avatar-ring" aria-hidden />
            <div className="atelier-avatar-ring atelier-avatar-ring-delay" aria-hidden />
            <div className="profile-avatar-xl atelier-avatar">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="profile-avatar-img" />
              ) : (
                <span aria-hidden>{initials || "?"}</span>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void onPickAvatar(e.target.files?.[0])}
            />
            <div className="profile-avatar-actions">
              <button
                type="button"
                className="atelier-chip-btn"
                onClick={() => avatarInputRef.current?.click()}
              >
                {avatar ? "Replace" : "Upload"}
              </button>
              {avatar ? (
                <button type="button" className="atelier-chip-btn is-ghost" onClick={() => setAvatar(null)}>
                  Delete
                </button>
              ) : null}
            </div>
          </div>

          <div className="atelier-hero-copy">
            <p className="atelier-kicker">
              <span className="atelier-live-dot" aria-hidden />
              Your profile
            </p>
            <h1 className="atelier-title">{displayName}</h1>
            <p className="atelier-sub">
              {sanitizeDisplayText(user.email)}
              {jobTitle ? ` · ${sanitizeDisplayText(jobTitle)}` : ""}
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
                <span className="atelier-live-dot is-inline" aria-hidden />
                {user.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          </div>

          <div className="atelier-hero-stats">
            <div className="atelier-stat">
              <span className="atelier-stat-label">Company ID</span>
              <strong className="font-mono">{user.tenant?.slug ?? "platform"}</strong>
            </div>
            <div className="atelier-stat">
              <span className="atelier-stat-label">Member since</span>
              <strong>{memberSince}</strong>
            </div>
            <div className="atelier-stat">
              <span className="atelier-stat-label">Passkeys</span>
              <strong>{passkeys.length}</strong>
            </div>
          </div>
        </div>
      </section>

      <nav className="atelier-tabs" aria-label="Profile sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`atelier-tab${tab === item.id ? " is-active" : ""}`}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
          >
            <span className="atelier-tab-label">{item.label}</span>
            <span className="atelier-tab-hint">{item.hint}</span>
          </button>
        ))}
      </nav>

      <div className="atelier-layout">
        <div className="atelier-main">
          {tab === "identity" ? (
            <form className="atelier-card atelier-enter" onSubmit={onSubmit} style={{ ["--i" as string]: 0 }}>
              <header className="atelier-card-head">
                <div>
                  <h2>Personal details</h2>
                  <p>How you appear across PMAS Live.</p>
                </div>
                {isDirty ? <span className="atelier-dirty">Unsaved changes</span> : null}
              </header>

              <div className="atelier-form-grid">
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
                  <div className="phone-field">
                    <select
                      value={dialCode}
                      onChange={(e) => setDialCode(e.target.value)}
                      aria-label="Country dial code"
                    >
                      {COUNTRY_DIAL_CODES.map((c) => (
                        <option key={c.code + c.country} value={c.code}>
                          {c.flag} {c.code}
                        </option>
                      ))}
                    </select>
                    <input
                      id="phone"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="912 345 6789"
                      maxLength={40}
                      autoComplete="tel-national"
                      inputMode="tel"
                    />
                  </div>
                </div>
                <div className="form-group atelier-span-2">
                  <div className="label-row">
                    <label htmlFor="bio">Bio</label>
                    <span className={`char-counter${bio.length > BIO_MAX - 50 ? " is-near-limit" : ""}`}>
                      {bio.length} / {BIO_MAX}
                    </span>
                  </div>
                  <textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={4}
                    maxLength={BIO_MAX}
                    placeholder="Short intro about your role and focus areas"
                  />
                  <div className="atelier-bio-meter" aria-hidden>
                    <span style={{ width: `${Math.min(100, (bio.length / BIO_MAX) * 100)}%` }} />
                  </div>
                </div>
              </div>

              {error ? <p className="auth-error">{error}</p> : null}

              <div className="atelier-actions">
                <button type="submit" className="btn btn-primary atelier-save" disabled={busy || !isDirty}>
                  {busy ? "Saving…" : isDirty ? "Save profile" : "No changes"}
                </button>
              </div>
            </form>
          ) : null}

          {tab === "security" ? (
            <form className="atelier-card atelier-enter" onSubmit={onChangePassword} style={{ ["--i" as string]: 0 }}>
              <header className="atelier-card-head">
                <div>
                  <h2>Password</h2>
                  <p>
                    Changing your password signs out every session, including this one.
                  </p>
                </div>
                <span className="atelier-shield" aria-hidden>◈</span>
              </header>

              <div className="atelier-form-grid">
                <div className="atelier-span-2">
                  <PasswordField
                    id="current-password"
                    label="Current password"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    autoComplete="current-password"
                  />
                </div>
                <PasswordField
                  id="new-password"
                  label="New password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                  hint="At least 12 characters with upper, lower, digit and symbol."
                />
                <PasswordField
                  id="confirm-password"
                  label="Confirm new password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                />
              </div>

              {pwError ? <p className="auth-error">{pwError}</p> : null}

              <div className="atelier-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={pwBusy || !currentPassword || !newPassword || !confirmPassword}
                >
                  {pwBusy ? "Changing…" : "Change password"}
                </button>
              </div>
            </form>
          ) : null}

          {tab === "passkeys" ? (
            <section className="atelier-card atelier-enter" style={{ ["--i" as string]: 0 }}>
              <header className="atelier-card-head">
                <div>
                  <h2>Passkeys</h2>
                  <p>Face ID, Touch ID, Windows Hello, or a hardware key — no password needed.</p>
                </div>
              </header>

              {!passkeysOk ? (
                <div className="atelier-empty">
                  <span aria-hidden>⌀</span>
                  <p>This browser does not support passkeys.</p>
                </div>
              ) : (
                <>
                  {pkLoading ? <p className="text-dim">Loading passkeys…</p> : null}

                  {passkeys.length > 0 ? (
                    <ul className="atelier-passkey-list">
                      {passkeys.map((pk, index) => (
                        <li
                          key={pk.id}
                          className="atelier-passkey-item atelier-enter"
                          style={{ ["--i" as string]: index + 1 }}
                        >
                          <div className="atelier-passkey-icon" aria-hidden>⬡</div>
                          <div className="atelier-passkey-meta">
                            <strong>{sanitizeDisplayText(pk.name)}</strong>
                            <span>
                              Added {new Date(pk.created_at).toLocaleDateString()}
                              {pk.last_used_at
                                ? ` · Last used ${new Date(pk.last_used_at).toLocaleDateString()}`
                                : ""}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => void onDeletePasskey(pk.id, pk.name)}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : !pkLoading ? (
                    <div className="atelier-empty">
                      <span aria-hidden>⬡</span>
                      <p>No passkeys yet. Add one to enable passwordless sign-in.</p>
                    </div>
                  ) : null}

                  <form onSubmit={onAddPasskey} className="atelier-passkey-form">
                    <div className="form-group">
                      <label htmlFor="passkey-name">Label (optional)</label>
                      <input
                        id="passkey-name"
                        value={pkName}
                        onChange={(e) => setPkName(e.target.value)}
                        placeholder="e.g. MacBook Touch ID"
                        maxLength={128}
                      />
                    </div>
                    {pkError ? <p className="auth-error">{pkError}</p> : null}
                    {pkSuccess ? <p className="profile-success">{pkSuccess}</p> : null}
                    <div className="atelier-actions">
                      <button type="submit" className="btn btn-primary" disabled={pkBusy}>
                        {pkBusy ? "Waiting for device…" : "Add passkey"}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </section>
          ) : null}
        </div>

        <aside className="atelier-side">
          <section className="atelier-card atelier-card-glass atelier-enter" style={{ ["--i" as string]: 1 }}>
            <header className="atelier-card-head">
              <div>
                <h2>Account card</h2>
                <p>Read-only identity facts.</p>
              </div>
            </header>
            <dl className="atelier-dl">
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
                <dd>{memberSince}</dd>
              </div>
            </dl>
          </section>

          <section className="atelier-card atelier-pulse-card atelier-enter" style={{ ["--i" as string]: 2 }}>
            <p className="atelier-kicker">
              <span className="atelier-live-dot" aria-hidden />
              Session
            </p>
            <p className="atelier-pulse-copy">
              Your session stays live while you work. Changing your password ends every device at once.
            </p>
          </section>
        </aside>
      </div>

      {isDirty && tab === "identity" ? (
        <div className="atelier-dock" role="status">
          <span>You have unsaved profile changes</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => {
              const form = document.querySelector<HTMLFormElement>(".atelier-main form");
              form?.requestSubmit();
            }}
          >
            {busy ? "Saving…" : "Save now"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
