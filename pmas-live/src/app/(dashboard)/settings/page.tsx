"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { PasswordField } from "@/components/PasswordField";
import { useToast } from "@/components/Toast";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import { useI18n } from "@/core/providers/I18nProvider";
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
  const { t, setLang } = useI18n();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const user = useAuthStore((s) => s.user);
  const tabs: { id: SettingsTab; label: string; hint: string }[] = [
    { id: "workspace", label: t("settings.workspace"), hint: t("settings.workspaceHint") },
    { id: "vault", label: t("settings.vault"), hint: t("settings.vaultHint") },
    { id: "access", label: t("settings.access"), hint: t("settings.accessHint") },
  ];

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
      if (language === "fa" || language === "en") setLang(language);
      showToast(t("settings.settingsUpdated"));
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
      showToast(t("settings.credentialAdded"));
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/credentials?id=${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["credentials"] });
      showToast(t("settings.credentialDeleted"));
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

  const displayName = name || company?.name || t("common.company");
  const initials = companyInitials(displayName);
  const statusLabel =
    status === "ACTIVE"
      ? t("statuses.active")
      : status === "ON_HOLD"
        ? t("statuses.onHold")
        : status === "ARCHIVED"
          ? t("statuses.archived")
          : status.replace("_", " ");
  const groupedPerms = useMemo(() => {
    const owned = new Set(permissionChips);
    const categoryKeys: Record<string, string> = {
      products: "products.title",
      projects: "planning.projects",
      features: "planning.features",
      tasks: "planning.tasks",
      organization: "organization.title",
      administration: "settings.general",
    };
    const permissionKeys: Partial<Record<Permission, string>> = {
      "product.view": "common.view",
      "product.create": "common.create",
      "product.update": "common.update",
      "product.archive": "statuses.archived",
      "project.create": "common.create",
      "project.update": "common.update",
      "feature.create": "common.create",
      "feature.update": "common.update",
      "task.create": "common.create",
      "task.assign": "planning.assignee",
      "task.complete": "statuses.completed",
      "department.manage": "organization.departments",
      "team.manage": "organization.teams",
      "employee.manage": "organization.employees",
      users: "userManagement.title",
      settings: "settings.companySettings",
      executive: "nav.executive",
      uiux: "nav.uiux",
      engineering: "nav.engineering",
      infrastructure: "nav.infrastructure",
      marketing: "nav.marketing",
      "graph-view": "nav.graph-view",
      finance: "nav.finance",
      legalhr: "nav.legalhr",
    };
    const groups = PERMISSION_CATEGORIES.map((cat) => ({
      label: t(categoryKeys[cat.id] ?? "settings.access"),
      items: cat.permissions
        .filter((p) => owned.has(p))
        .map((p) => (permissionKeys[p] ? t(permissionKeys[p]) : PERMISSION_LABELS[p] ?? p)),
    })).filter((g) => g.items.length > 0);

    const categorized = new Set(PERMISSION_CATEGORIES.flatMap((c) => c.permissions));
    const extras = permissionChips
      .filter((p) => !categorized.has(p))
      .map((p) => (permissionKeys[p] ? t(permissionKeys[p]) : PERMISSION_LABELS[p] ?? p));
    if (extras.length) groups.push({ label: t("settings.access"), items: extras });
    return groups;
  }, [permissionChips, t]);

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
              {t("settings.companySettings")}
            </p>
            <h1 className="atelier-title">{displayName}</h1>
            <p className="atelier-sub">
              {t("quickActions.companySettingsHint")}
            </p>
            <div className="profile-badges">
              <span className={`profile-badge atelier-status ${statusTone(status)}`}>
                <span className="atelier-live-dot is-inline" aria-hidden />
                {statusLabel}
              </span>
              <span className="profile-badge profile-badge-muted">{language.toUpperCase()}</span>
              <span className="profile-badge profile-badge-muted">{timezone}</span>
            </div>
          </div>

          <div className="atelier-hero-stats">
            <div className="atelier-stat">
              <span className="atelier-stat-label">{t("settings.credentials")}</span>
              <strong>{credentials.length}</strong>
            </div>
            <div className="atelier-stat">
              <span className="atelier-stat-label">{t("settings.accessHint")}</span>
              <strong>{permissionChips.length}</strong>
            </div>
            <div className="atelier-stat">
              <span className="atelier-stat-label">{t("settings.language")}</span>
              <strong>{language.toUpperCase()}</strong>
            </div>
          </div>
        </div>
      </section>

      <nav className="atelier-tabs" aria-label={t("settings.title")}>
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
            {item.id === "workspace" && companyDirty ? (
              <span className="atelier-tab-dot" aria-label={t("common.saveChanges")} />
            ) : null}
          </button>
        ))}
      </nav>

      {tab === "workspace" ? (
        <form className="atelier-card atelier-enter" onSubmit={handleCompany} style={{ ["--i" as string]: 0 }}>
          <header className="atelier-card-head">
            <div>
              <h2>{t("settings.workspaceHint")}</h2>
              <p>{t("quickActions.companySettingsHint")}</p>
            </div>
            {companyDirty ? <span className="atelier-dirty">{t("common.saveChanges")}</span> : null}
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
                  <label htmlFor="co-name">{t("settings.companyName")}</label>
                  <input
                    id="co-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="co-logo">{t("settings.logoUrl")}</label>
                  <input
                    id="co-logo"
                    value={logoURL}
                    onChange={(e) => setLogoURL(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="co-lang">{t("settings.language")}</label>
                  <select id="co-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="en">{t("lang.english")}</option>
                    <option value="fa">{t("lang.persian")}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="co-tz">{t("settings.timezone")}</label>
                  <select id="co-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    <option value="UTC">UTC</option>
                    <option value="Asia/Tehran">Asia/Tehran</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="America/New_York">America/New_York</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="co-status">{t("common.status")}</label>
                  <select id="co-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="ACTIVE">{t("statuses.active")}</option>
                    <option value="ON_HOLD">{t("statuses.onHold")}</option>
                    <option value="ARCHIVED">{t("statuses.archived")}</option>
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
                  <p className="atelier-preview-label">{t("common.view")}</p>
                  <strong>{displayName}</strong>
                  <p className="text-dim">
                    {language.toUpperCase()} · {timezone} · {statusLabel}
                  </p>
                </div>
              </div>

              <div className="atelier-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saveCompany.isPending || !companyDirty}
                >
                  {saveCompany.isPending
                    ? t("common.saving")
                    : companyDirty
                      ? t("settings.saveSettings")
                      : t("common.done")}
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
                <h2>{t("settings.addCredential")}</h2>
                <p>{t("settings.vaultHint")}</p>
              </div>
              <span className="atelier-shield" aria-hidden>⬢</span>
            </header>

            <div className="atelier-form-grid">
              <div className="form-group">
                <label htmlFor="cred-name">{t("settings.credentialName")}</label>
                <input
                  id="cred-name"
                  value={credName}
                  onChange={(e) => setCredName(e.target.value)}
                  required
                  placeholder={t("settings.apiKey")}
                />
              </div>
              <PasswordField
                id="cred-value"
                label={t("settings.credentialValue")}
                value={credValue}
                onChange={setCredValue}
                required
                autoComplete="off"
              />
              <div className="form-group atelier-span-2">
                <label htmlFor="cred-desc">{t("common.description")}</label>
                <input
                  id="cred-desc"
                  value={credDesc}
                  onChange={(e) => setCredDesc(e.target.value)}
                  placeholder={t("common.description")}
                />
              </div>
            </div>

            <div className="atelier-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saveMutation.isPending || !credName.trim() || !credValue}
              >
                {saveMutation.isPending ? t("common.saving") : t("settings.saveSettings")}
              </button>
            </div>
          </form>

          <section className="atelier-card atelier-enter" style={{ ["--i" as string]: 1 }}>
            <header className="atelier-card-head">
              <div>
                <h2>{t("settings.credentials")}</h2>
                <p>{t("settings.vaultHint")}</p>
              </div>
            </header>

            {isLoading ? (
              <div className="atelier-skeleton-grid" aria-hidden>
                <span />
                <span />
              </div>
            ) : credentials.length === 0 ? (
              <EmptyState title={t("emptyStates.noData")} description={t("settings.vaultHint")} />
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
                        {revealed[c.id] ? t("dashboard.hide") : t("dashboard.show")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => deleteMutation.mutate(c.id)}
                        disabled={deleteMutation.isPending}
                      >
                        {t("common.delete")}
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
              <h2>{t("settings.accessHint")}</h2>
              <p>
                {t("settings.access")} · {t("userManagement.title")}
              </p>
            </div>
            <span className="atelier-count-pill">{permissionChips.length}</span>
          </header>

          {permissionChips.length === 0 ? (
            <div className="atelier-empty">
              <span aria-hidden>⌀</span>
              <p>{t("emptyStates.noData")}</p>
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
          <span>{t("common.saveChanges")}</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saveCompany.isPending}
            onClick={() => saveCompany.mutate()}
          >
            {saveCompany.isPending ? t("common.saving") : t("settings.saveSettings")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
