"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { PasswordField } from "@/components/PasswordField";
import { useToast } from "@/components/Toast";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import type { Company } from "@/features/vsm/types";
import {
  PERMISSION_CATEGORIES,
  PERMISSION_LABELS,
  type Permission,
} from "@/shared/permissions";

interface Credential {
  id: number;
  name: string;
  value: string;
  description: string;
}

type SettingsTab = "workspace" | "vault" | "access";

const TABS: { id: SettingsTab; label: string; hint: string }[] = [
  { id: "workspace", label: "Workspace", hint: "Company profile" },
  { id: "vault", label: "Vault", hint: "Integration secrets" },
  { id: "access", label: "Access", hint: "Your permissions" },
];

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CO";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function statusTone(status: string): string {
  if (status === "ACTIVE") return "is-ok";
  if (status === "ON_HOLD") return "is-warn";
  return "is-muted";
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const user = useAuthStore((s) => s.user);

  const permissionChips =
    user &&
    (user.role === "tenant_admin" || user.role === "platform_admin" || user.role === "super_admin")
      ? (Object.keys(PERMISSION_LABELS) as Permission[])
      : ((user?.permissions ?? []) as Permission[]);

  const [tab, setTab] = useState<SettingsTab>("workspace");
  const [name, setName] = useState("");
  const [logoURL, setLogoURL] = useState("");
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("UTC");
  const [status, setStatus] = useState("ACTIVE");
  const [credName, setCredName] = useState("");
  const [credValue, setCredValue] = useState("");
  const [credDesc, setCredDesc] = useState("");
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ["vsm-company"],
    queryFn: () => httpClient.get<Company>("/api/v1/company"),
  });

  useEffect(() => {
    if (!company) return;
    setName(company.name ?? "");
    setLogoURL(company.logo_url ?? "");
    setLanguage(company.language || "en");
    setTimezone(company.timezone || "UTC");
    setStatus(company.status || "ACTIVE");
  }, [company]);

  const companyDirty = useMemo(() => {
    if (!company) return false;
    return (
      name.trim() !== (company.name ?? "") ||
      logoURL.trim() !== (company.logo_url ?? "") ||
      language !== (company.language || "en") ||
      timezone !== (company.timezone || "UTC") ||
      status !== (company.status || "ACTIVE")
    );
  }, [company, name, logoURL, language, timezone, status]);

  const saveCompany = useMutation({
    mutationFn: () =>
      httpClient.patch<Company>("/api/v1/company", {
        name,
        logo_url: logoURL,
        language,
        timezone,
        status,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vsm-company"] });
      showToast("Company settings saved.");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const { data: credentials = [], isLoading } = useQuery({
    queryKey: ["credentials"],
    queryFn: () => httpClient.get<Credential[]>("/api/v1/credentials"),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (body: { name: string; value: string; description: string }) =>
      httpClient.post("/api/v1/credentials", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["credentials"] });
      setCredName("");
      setCredValue("");
      setCredDesc("");
      showToast("Credential stored in vault.");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/credentials?id=${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["credentials"] });
      showToast("Credential removed.");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  function handleCompany(e: FormEvent) {
    e.preventDefault();
    saveCompany.mutate();
  }

  function handleCred(e: FormEvent) {
    e.preventDefault();
    saveMutation.mutate({ name: credName, value: credValue, description: credDesc });
  }

  const displayName = name || company?.name || "Company";
  const initials = companyInitials(displayName);
  const groupedPerms = useMemo(() => {
    const owned = new Set(permissionChips);
    const groups = PERMISSION_CATEGORIES.map((cat) => ({
      label: cat.label,
      items: cat.permissions
        .filter((p) => owned.has(p))
        .map((p) => PERMISSION_LABELS[p] ?? p),
    })).filter((g) => g.items.length > 0);

    const categorized = new Set(PERMISSION_CATEGORIES.flatMap((c) => c.permissions));
    const extras = permissionChips
      .filter((p) => !categorized.has(p))
      .map((p) => PERMISSION_LABELS[p] ?? p);
    if (extras.length) groups.push({ label: "Other", items: extras });
    return groups;
  }, [permissionChips]);

  return (
    <div className="atelier settings-page">
      <section className="atelier-hero atelier-hero-settings">
        <div className="atelier-orbit" aria-hidden>
          <span className="atelier-orb atelier-orb-a" />
          <span className="atelier-orb atelier-orb-b" />
          <span className="atelier-grid" />
        </div>

        <div className="atelier-hero-inner">
          <div className="atelier-avatar-stage">
            <div className="atelier-avatar-ring" aria-hidden />
            <div className="atelier-company-mark">
              {logoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoURL} alt="" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
          </div>

          <div className="atelier-hero-copy">
            <p className="atelier-kicker">
              <span className="atelier-live-dot" aria-hidden />
              Workspace settings
            </p>
            <h1 className="atelier-title">{displayName}</h1>
            <p className="atelier-sub">
              Tune how your company looks, which secrets integrations can use, and what you can access.
            </p>
            <div className="profile-badges">
              <span className={`profile-badge atelier-status ${statusTone(status)}`}>
                <span className="atelier-live-dot is-inline" aria-hidden />
                {status.replace("_", " ")}
              </span>
              <span className="profile-badge profile-badge-muted">{language.toUpperCase()}</span>
              <span className="profile-badge profile-badge-muted">{timezone}</span>
            </div>
          </div>

          <div className="atelier-hero-stats">
            <div className="atelier-stat">
              <span className="atelier-stat-label">Credentials</span>
              <strong>{credentials.length}</strong>
            </div>
            <div className="atelier-stat">
              <span className="atelier-stat-label">Permissions</span>
              <strong>{permissionChips.length}</strong>
            </div>
            <div className="atelier-stat">
              <span className="atelier-stat-label">Locale</span>
              <strong>{language.toUpperCase()}</strong>
            </div>
          </div>
        </div>
      </section>

      <nav className="atelier-tabs" aria-label="Settings sections">
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
            {item.id === "workspace" && companyDirty ? (
              <span className="atelier-tab-dot" aria-label="Unsaved changes" />
            ) : null}
          </button>
        ))}
      </nav>

      {tab === "workspace" ? (
        <form className="atelier-card atelier-enter" onSubmit={handleCompany} style={{ ["--i" as string]: 0 }}>
          <header className="atelier-card-head">
            <div>
              <h2>Company profile</h2>
              <p>Name, logo, language, timezone and workspace status.</p>
            </div>
            {companyDirty ? <span className="atelier-dirty">Unsaved changes</span> : null}
          </header>

          {companyLoading ? (
            <div className="atelier-skeleton-grid" aria-hidden>
              <span />
              <span />
              <span />
              <span />
            </div>
          ) : (
            <>
              <div className="atelier-form-grid">
                <div className="form-group">
                  <label htmlFor="co-name">Company name</label>
                  <input
                    id="co-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="co-logo">Logo URL</label>
                  <input
                    id="co-logo"
                    value={logoURL}
                    onChange={(e) => setLogoURL(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="co-lang">Language</label>
                  <select id="co-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="en">English</option>
                    <option value="fa">Persian</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="co-tz">Timezone</label>
                  <select id="co-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    <option value="UTC">UTC</option>
                    <option value="Asia/Tehran">Asia/Tehran</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="America/New_York">America/New_York</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="co-status">Company status</label>
                  <select id="co-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="ACTIVE">Active</option>
                    <option value="ON_HOLD">On hold</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>

              <div className="atelier-preview">
                <div className="atelier-preview-mark">
                  {logoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoURL} alt="" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <div>
                  <p className="atelier-preview-label">Live preview</p>
                  <strong>{displayName}</strong>
                  <p className="text-dim">
                    {language.toUpperCase()} · {timezone} · {status.replace("_", " ")}
                  </p>
                </div>
              </div>

              <div className="atelier-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saveCompany.isPending || !companyDirty}
                >
                  {saveCompany.isPending ? "Saving…" : companyDirty ? "Save company settings" : "No changes"}
                </button>
              </div>
            </>
          )}
        </form>
      ) : null}

      {tab === "vault" ? (
        <div className="atelier-vault">
          <form
            className="atelier-card atelier-enter"
            onSubmit={handleCred}
            style={{ ["--i" as string]: 0 }}
          >
            <header className="atelier-card-head">
              <div>
                <h2>Add credential</h2>
                <p>Store integration secrets for this workspace. Values are masked in the list.</p>
              </div>
              <span className="atelier-shield" aria-hidden>⬢</span>
            </header>

            <div className="atelier-form-grid">
              <div className="form-group">
                <label htmlFor="cred-name">Name</label>
                <input
                  id="cred-name"
                  value={credName}
                  onChange={(e) => setCredName(e.target.value)}
                  required
                  placeholder="Stripe API key"
                />
              </div>
              <PasswordField
                id="cred-value"
                label="Secret value"
                value={credValue}
                onChange={setCredValue}
                required
                autoComplete="off"
              />
              <div className="form-group atelier-span-2">
                <label htmlFor="cred-desc">Description</label>
                <input
                  id="cred-desc"
                  value={credDesc}
                  onChange={(e) => setCredDesc(e.target.value)}
                  placeholder="Used by billing webhook"
                />
              </div>
            </div>

            <div className="atelier-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saveMutation.isPending || !credName.trim() || !credValue}
              >
                {saveMutation.isPending ? "Saving…" : "Save credential"}
              </button>
            </div>
          </form>

          <section className="atelier-card atelier-enter" style={{ ["--i" as string]: 1 }}>
            <header className="atelier-card-head">
              <div>
                <h2>Credential vault</h2>
                <p>{credentials.length} secret{credentials.length === 1 ? "" : "s"} stored.</p>
              </div>
            </header>

            {isLoading ? (
              <div className="atelier-skeleton-grid" aria-hidden>
                <span />
                <span />
              </div>
            ) : credentials.length === 0 ? (
              <EmptyState title="No credentials" description="Optional vault for integration secrets." />
            ) : (
              <ul className="atelier-vault-list">
                {credentials.map((c, index) => (
                  <li
                    key={c.id}
                    className="atelier-vault-item atelier-enter"
                    style={{ ["--i" as string]: index + 1 }}
                  >
                    <div className="atelier-vault-icon" aria-hidden>◆</div>
                    <div className="atelier-vault-meta">
                      <strong>{c.name}</strong>
                      <span className="font-mono">
                        {revealed[c.id] ? c.value : "••••••••••••"}
                      </span>
                      {c.description ? <em>{c.description}</em> : null}
                    </div>
                    <div className="atelier-vault-actions">
                      <button
                        type="button"
                        className="atelier-chip-btn"
                        onClick={() =>
                          setRevealed((prev) => ({ ...prev, [c.id]: !prev[c.id] }))
                        }
                      >
                        {revealed[c.id] ? "Hide" : "Reveal"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => deleteMutation.mutate(c.id)}
                        disabled={deleteMutation.isPending}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {tab === "access" ? (
        <section className="atelier-card atelier-enter" style={{ ["--i" as string]: 0 }}>
          <header className="atelier-card-head">
            <div>
              <h2>Your access</h2>
              <p>
                Panels and actions enabled for your account. Ask a company admin in User
                Management to change these.
              </p>
            </div>
            <span className="atelier-count-pill">{permissionChips.length}</span>
          </header>

          {permissionChips.length === 0 ? (
            <div className="atelier-empty">
              <span aria-hidden>⌀</span>
              <p>No explicit permissions on this account.</p>
            </div>
          ) : (
            <div className="atelier-perm-groups">
              {groupedPerms.map((group, gi) => (
                <div
                  key={group.label}
                  className="atelier-perm-group atelier-enter"
                  style={{ ["--i" as string]: gi + 1 }}
                >
                  <h3>{group.label}</h3>
                  <div className="atelier-perm-cloud">
                    {group.items.map((label) => (
                      <span key={`${group.label}-${label}`} className="atelier-perm-chip">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {companyDirty && tab === "workspace" ? (
        <div className="atelier-dock" role="status">
          <span>Company settings have unsaved changes</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saveCompany.isPending}
            onClick={() => saveCompany.mutate()}
          >
            {saveCompany.isPending ? "Saving…" : "Save now"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
