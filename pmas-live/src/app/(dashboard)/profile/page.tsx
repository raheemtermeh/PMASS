"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore, type AuthUser } from "@/core/auth/auth-store";
import { httpClient } from "@/core/api/http-client";
import { createPasskeyCredential, isPasskeySupported } from "@/core/auth/webauthn";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageGuide } from "@/components/PageGuide";
import { PasswordField } from "@/components/PasswordField";
import { useToast } from "@/components/Toast";
import { COUNTRY_DIAL_CODES, splitPhone, joinPhone } from "@/shared/phone";
import { readAvatarFile } from "@/shared/avatar";
import { resolveSignOutPath } from "@/shared/auth-portals";
import { sanitizeDisplayText } from "@/shared/security";
import { useI18n } from "@/core/providers/I18nProvider";

interface PasskeyRow {
  id: string;
  name: string;
  created_at: string;
  last_used_at?: string | null;
}

type ProfileTab = "identity" | "security" | "passkeys";

const BIO_MAX = 1000;

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export default function ProfilePage() {
  const { t, lang } = useI18n();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const tabs = useMemo<{ id: ProfileTab; label: string; hint: string }[]>(
    () => [
      { id: "identity", label: t("profile.identity"), hint: t("profile.identityHint") },
      { id: "security", label: t("profile.security"), hint: t("profile.password") },
      { id: "passkeys", label: t("profile.passkeys"), hint: t("profile.passwordless") },
    ],
    [t],
  );

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
  const [passkeyRemoveTarget, setPasskeyRemoveTarget] = useState<{ id: string; name: string } | null>(null);
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
    ? new Date(user.created_at).toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) {
      setError(t("errors.nameRequired"));
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

      if (!token) throw new Error(t("errors.sessionExpired"));
      const updated = await httpClient.put<AuthUser>("/api/v1/auth/me", body);
      setSession(token, updated);
      showToast(t("profile.profileSaved"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("errors.saveProfileFailed");
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
      const msg = err instanceof Error ? err.message : t("errors.readImageFailed");
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
      setPwError(t("errors.passwordsRequired"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(t("reset.passwordsMismatch"));
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
      showToast(t("profile.passwordChanged"));
      const signOutPath = resolveSignOutPath(user?.role);
      clearSession();
      router.replace(signOutPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("errors.changePasswordFailed");
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
      setPkError(t("errors.passkeysUnsupported"));
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
      setPkSuccess(t("profile.passkeyAdded"));
      void qc.invalidateQueries({ queryKey: ["passkeys"] });
    } catch (err) {
      setPkError(err instanceof Error ? err.message : t("errors.addPasskeyFailed"));
    } finally {
      setPkBusy(false);
    }
  }

  function onDeletePasskey(id: string, name: string) {
    setPasskeyRemoveTarget({ id, name });
  }

  async function confirmDeletePasskey() {
    if (!passkeyRemoveTarget) return;
    setPkError("");
    try {
      await httpClient.delete(`/api/v1/auth/passkeys/${passkeyRemoveTarget.id}`);
      setPkSuccess(t("profile.passkeyRemoved"));
      showToast(t("profile.passkeyRemoved"));
      void qc.invalidateQueries({ queryKey: ["passkeys"] });
    } catch (err) {
      setPkError(err instanceof Error ? err.message : t("errors.removePasskeyFailed"));
    } finally {
      setPasskeyRemoveTarget(null);
    }
  }

  return (
    <div className="atelier profile-page">
      <PageGuide page="profile" />

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
                {t("profile.changeProfilePicture")}
              </button>
              {avatar ? (
                <button type="button" className="atelier-chip-btn is-ghost" onClick={() => setAvatar(null)}>
                  {t("profile.removeProfilePicture")}
                </button>
              ) : null}
            </div>
          </div>

          <div className="atelier-hero-copy">
            <p className="atelier-kicker">
              <span className="atelier-live-dot" aria-hidden />
              {t("profile.title")}
            </p>
            <h1 className="atelier-title">{displayName}</h1>
            <p className="atelier-sub">
              {sanitizeDisplayText(user.email)}
              {jobTitle ? ` · ${sanitizeDisplayText(jobTitle)}` : ""}
            </p>
            <div className="profile-badges">
              <span className="profile-badge">
                {user.role === "platform_admin" || user.role === "super_admin"
                  ? t("role.platformAdmin")
                  : user.role === "tenant_admin"
                    ? t("role.companyAdmin")
                    : t("role.employee")}
              </span>
              {user.tenant?.name ? (
                <span className="profile-badge profile-badge-muted">
                  {sanitizeDisplayText(user.tenant.name)}
                </span>
              ) : (
                <span className="profile-badge profile-badge-muted">{t("nav.platform")}</span>
              )}
              <span className={`profile-badge ${user.is_active ? "profile-badge-ok" : "profile-badge-bad"}`}>
                <span className="atelier-live-dot is-inline" aria-hidden />
                {user.is_active ? t("statuses.active") : t("statuses.inactive")}
              </span>
            </div>
          </div>

          <div className="atelier-hero-stats">
            <div className="atelier-stat">
              <span className="atelier-stat-label">{t("welcome.companyId")}</span>
              <strong className="font-mono">{user.tenant?.slug ?? "platform"}</strong>
            </div>
            <div className="atelier-stat">
              <span className="atelier-stat-label">{t("profile.memberSince")}</span>
              <strong>{memberSince}</strong>
            </div>
            <div className="atelier-stat">
              <span className="atelier-stat-label">{t("profile.passkeys")}</span>
              <strong>{passkeys.length}</strong>
            </div>
          </div>
        </div>
      </section>

      <nav className="atelier-tabs" aria-label={t("profile.title")}>
        {tabs.map((item) => (
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
                  <h2>{t("profile.personalInformation")}</h2>
                  <p>{t("profile.identityIntro")}</p>
                </div>
                {isDirty ? (
                  <span className="atelier-dirty">{t("profile.unsavedChanges")}</span>
                ) : null}
              </header>

              <div className="atelier-form-grid">
                <div className="form-group">
                  <label htmlFor="first-name">{t("profile.firstName")}</label>
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
                  <label htmlFor="last-name">{t("profile.lastName")}</label>
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
                  <label htmlFor="job-title">{t("common.jobTitle")}</label>
                  <input
                    id="job-title"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder={t("profile.jobTitlePlaceholder")}
                    maxLength={255}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="phone">{t("profile.phone")}</label>
                  <div className="phone-field">
                    <select
                      value={dialCode}
                      onChange={(e) => setDialCode(e.target.value)}
                      aria-label={t("welcome.country")}
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
                    <label htmlFor="bio">{t("profile.bio")}</label>
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
                    placeholder={t("profile.bioPlaceholder")}
                  />
                  <div className="atelier-bio-meter" aria-hidden>
                    <span style={{ width: `${Math.min(100, (bio.length / BIO_MAX) * 100)}%` }} />
                  </div>
                </div>
              </div>

              {error ? <p className="auth-error">{error}</p> : null}

              <div className="atelier-actions">
                <button type="submit" className="btn btn-primary atelier-save" disabled={busy || !isDirty}>
                  {busy ? t("common.saving") : isDirty ? t("common.saveChanges") : t("common.done")}
                </button>
              </div>

              <p className="profile-access-note">
                {t("profile.accessMapMoved")}{" "}
                <Link href="/admin/users">{t("profile.goToUserManagement")}</Link>
              </p>
            </form>
          ) : null}

          {tab === "security" ? (
            <form className="atelier-card atelier-enter" onSubmit={onChangePassword} style={{ ["--i" as string]: 0 }}>
              <header className="atelier-card-head">
                <div>
                  <h2>{t("profile.securitySection")}</h2>
                  <p>{t("profile.securityHint")}</p>
                </div>
                <span className="atelier-shield" aria-hidden>◈</span>
              </header>

              <div className="atelier-form-grid">
                <div className="atelier-span-2">
                  <PasswordField
                    id="current-password"
                    label={t("profile.currentPassword")}
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    autoComplete="current-password"
                  />
                </div>
                <PasswordField
                  id="new-password"
                  label={t("profile.newPassword")}
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                  hint={t("reset.passwordHint")}
                />
                <PasswordField
                  id="confirm-password"
                  label={t("profile.confirmPassword")}
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
                  {pwBusy ? t("common.processing") : t("profile.changePassword")}
                </button>
              </div>
            </form>
          ) : null}

          {tab === "passkeys" ? (
            <section className="atelier-card atelier-enter" style={{ ["--i" as string]: 0 }}>
              <header className="atelier-card-head">
                <div>
                  <h2>{t("profile.passkeys")}</h2>
                  <p>{t("welcome.passkeyHint")}</p>
                </div>
              </header>

              {!passkeysOk ? (
                <div className="atelier-empty">
                  <span aria-hidden>⌀</span>
                  <p>{t("profile.passkeysUnsupported")}</p>
                </div>
              ) : (
                <>
                  {pkLoading ? <p className="text-dim">{t("common.loading")}</p> : null}

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
                              {t("common.createdAt")}{" "}
                              {new Date(pk.created_at).toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US")}
                              {pk.last_used_at
                                ? ` · ${new Date(pk.last_used_at).toLocaleDateString(
                                    lang === "fa" ? "fa-IR" : "en-US",
                                  )}`
                                : ""}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => void onDeletePasskey(pk.id, pk.name)}
                          >
                            {t("common.remove")}
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
                      <label htmlFor="passkey-name">{t("common.name")}</label>
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
                        {pkBusy
                          ? t("welcome.waitingForDevice")
                          : `${t("common.add")} ${t("profile.passkeys")}`}
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
                <h2>{t("profile.accountInformation")}</h2>
                <p>{t("profile.readOnlyFacts")}</p>
              </div>
            </header>
            <dl className="atelier-dl">
              <div>
                <dt>{t("profile.email")}</dt>
                <dd>{sanitizeDisplayText(user.email)}</dd>
              </div>
              <div>
                <dt>{t("profile.role")}</dt>
                <dd>
                  {user.role === "platform_admin" || user.role === "super_admin"
                    ? t("role.platformAdmin")
                    : user.role === "tenant_admin"
                      ? t("role.companyAdmin")
                      : t("role.employee")}
                </dd>
              </div>
              <div>
                <dt>{t("common.company")}</dt>
                <dd>{user.tenant?.name ? sanitizeDisplayText(user.tenant.name) : "—"}</dd>
              </div>
              <div>
                <dt>{t("welcome.companyId")}</dt>
                <dd className="font-mono">{user.tenant?.slug ?? "platform"}</dd>
              </div>
              <div>
                <dt>{t("profile.memberSince")}</dt>
                <dd>{memberSince}</dd>
              </div>
            </dl>
          </section>

          <section className="atelier-card atelier-pulse-card atelier-enter" style={{ ["--i" as string]: 2 }}>
            <p className="atelier-kicker">
              <span className="atelier-live-dot" aria-hidden />
              {t("profile.session")}
            </p>
            <p className="atelier-pulse-copy">{t("profile.sessionCopy")}</p>
          </section>
        </aside>
      </div>

      {isDirty && tab === "identity" ? (
        <div className="atelier-dock" role="status">
          <span>{t("profile.unsavedProfileChanges")}</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => {
              const form = document.querySelector<HTMLFormElement>(".atelier-main form");
              form?.requestSubmit();
            }}
          >
            {busy ? t("common.saving") : t("common.saveChanges")}
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(passkeyRemoveTarget)}
        title={t("common.confirmDelete")}
        description={
          passkeyRemoveTarget
            ? t("profile.removePasskeyConfirm", { name: passkeyRemoveTarget.name })
            : undefined
        }
        confirmLabel={t("common.remove")}
        tone="danger"
        onCancel={() => setPasskeyRemoveTarget(null)}
        onConfirm={() => void confirmDeletePasskey()}
      />
    </div>
  );
}
