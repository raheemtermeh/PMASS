"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import {
  getRememberMePreference,
  useAuthHydrated,
  useAuthStore,
  type AuthUser,
} from "@/core/auth/auth-store";
import { PmasLoader } from "@/components/PmasLoader";
import { getPasskeyCredential, isPasskeySupported } from "@/core/auth/webauthn";
import { firstAllowedPath } from "@/shared/routes";
import { sanitizeInternalPath } from "@/shared/security";

const FEATURES = [
  {
    icon: "◈",
    title: "Value Stream Management",
    desc: "Full product lifecycle from idea to delivery — pipelines, stages, and execution in one view.",
  },
  {
    icon: "◎",
    title: "Organization Structure",
    desc: "Departments, teams, and employees — each company gets an isolated, secure workspace.",
  },
  {
    icon: "▣",
    title: "Multi-layer Planning",
    desc: "Project → Feature → Task under every product with real progress tracking.",
  },
  {
    icon: "⬡",
    title: "Dedicated Dashboard",
    desc: "Every company has its own panel and data — fully separated from other tenants.",
  },
  {
    icon: "⬢",
    title: "Granular Permissions",
    desc: "VSM roles and permissions per user — full control by the company admin.",
  },
  {
    icon: "◆",
    title: "Enterprise Security",
    desc: "JWT authentication, tenant isolation, and encrypted credential storage.",
  },
];

const STEPS = [
  { num: "1", title: "Request Access", desc: "Fill out the form at the bottom of this page." },
  { num: "2", title: "Platform Review", desc: "Our team evaluates your company request." },
  { num: "3", title: "Receive Credentials", desc: "You get a Company ID and admin login details." },
  { num: "4", title: "Get Started", desc: "Sign in to your company panel and invite your team." },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function WelcomePage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [showLanding, setShowLanding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tenantSlug, setTenantSlug] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeysOk, setPasskeysOk] = useState(false);

  useEffect(() => {
    setRememberMe(getRememberMePreference());
    setPasskeysOk(isPasskeySupported());
  }, []);

  const [companyName, setCompanyName] = useState("");
  const [preferredSlug, setPreferredSlug] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [industry, setIndustry] = useState("");
  const [message, setMessage] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);

  useEffect(() => {
    if (!hydrated) return;

    // Signed-in visitors never see the landing page — redirect before render.
    if (token && user) {
      router.replace(
        sanitizeInternalPath(
          firstAllowedPath(user.role, user.permissions, Boolean(user.tenant_id)),
        ),
      );
      return;
    }

    let cancelled = false;
    async function checkState() {
      try {
        const status = await httpClient.get<{ needs_bootstrap: boolean }>(
          "/api/v1/auth/status",
          false,
        );
        if (cancelled) return;
        if (status.needs_bootstrap) {
          router.replace("/setup");
          return;
        }
      } catch {
        /* API offline — still show landing */
      }
      if (!cancelled) setShowLanding(true);
    }
    void checkState();
    return () => {
      cancelled = true;
    };
  }, [hydrated, router, token, user]);

  function applySession(res: { token: string; refresh_token?: string; user: AuthUser }) {
    setSession(res.token, res.user, res.refresh_token ?? null, { remember: rememberMe });
    router.replace(
      sanitizeInternalPath(
        firstAllowedPath(res.user.role, res.user.permissions, Boolean(res.user.tenant_id)),
      ),
    );
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const identifier = loginId.trim();
      const res = await httpClient.post<{ token: string; refresh_token?: string; user: AuthUser }>(
        "/api/v1/auth/login",
        {
          tenant_slug: tenantSlug.trim().toLowerCase(),
          ...(EMAIL_PATTERN.test(identifier)
            ? { email: identifier.toLowerCase() }
            : { username: identifier }),
          password,
          remember_me: rememberMe,
        },
        false,
      );
      applySession(res);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handlePasskeyLogin() {
    setLoginError("");
    setPasskeyLoading(true);
    try {
      if (!isPasskeySupported()) {
        throw new Error("Passkeys are not supported in this browser");
      }
      const identifier = loginId.trim();
      const begin = await httpClient.post<{
        publicKey: Record<string, unknown>;
        session_id: string;
      }>(
        "/api/v1/auth/passkeys/login/begin",
        {
          tenant_slug: tenantSlug.trim().toLowerCase(),
          ...(identifier
            ? EMAIL_PATTERN.test(identifier)
              ? { email: identifier.toLowerCase() }
              : { username: identifier }
            : {}),
        },
        false,
      );
      const credential = await getPasskeyCredential(begin.publicKey);
      const res = await httpClient.post<{ token: string; refresh_token?: string; user: AuthUser }>(
        "/api/v1/auth/passkeys/login/finish",
        {
          session_id: begin.session_id,
          credential,
          remember_me: rememberMe,
        },
        false,
      );
      applySession(res);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Passkey sign-in failed");
    } finally {
      setPasskeyLoading(false);
    }
  }

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setRequestError("");
    setRequestSuccess(false);
    setRequestLoading(true);
    try {
      await httpClient.post(
        "/api/v1/access-requests",
        {
          company_name: companyName.trim(),
          preferred_slug: preferredSlug.trim() || undefined,
          contact_name: contactName.trim(),
          contact_email: contactEmail.trim(),
          contact_phone: contactPhone.trim() || undefined,
          company_size: companySize || undefined,
          industry: industry.trim() || undefined,
          message: message.trim() || undefined,
        },
        false,
      );
      setRequestSuccess(true);
      setCompanyName("");
      setPreferredSlug("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setCompanySize("");
      setIndustry("");
      setMessage("");
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setRequestLoading(false);
    }
  }

  if (!showLanding) {
    return (
      <PmasLoader
        message={token && user ? "Restoring your session…" : "Preparing PMAS Live…"}
      />
    );
  }

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link href="/welcome" className="landing-logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>PMAS Live</span>
          </Link>

          <button
            type="button"
            className="landing-menu-btn"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>

          <nav className={`landing-nav${menuOpen ? " landing-nav-open" : ""}`}>
            <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
            <a href="#login" onClick={() => setMenuOpen(false)}>Company login</a>
            <a href="#request" className="landing-nav-cta" onClick={() => setMenuOpen(false)}>
              Request access
            </a>
            <Link href="/platform/login" className="landing-nav-platform" onClick={() => setMenuOpen(false)}>
              Platform admin
            </Link>
          </nav>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-glow" aria-hidden />
        <div className="landing-hero-content">
          <span className="landing-badge">Enterprise Product Management Platform</span>
          <h1>
            Intelligent
            <br />
            <span className="landing-gradient-text">Product Lifecycle</span>
            {" "}Management
          </h1>
          <p className="landing-hero-desc">
            PMAS Live gives every company a dedicated workspace — from org structure
            and planning to Value Stream execution, all in one modern, isolated panel.
          </p>
          <div className="landing-hero-actions">
            <a href="#request" className="btn btn-primary landing-btn-lg">Request access</a>
            <a href="#login" className="btn landing-btn-lg landing-btn-ghost">Company sign in</a>
          </div>
        </div>
        <div className="landing-hero-visual" aria-hidden>
          <div className="landing-mock-card landing-mock-card-1">
            <span className="landing-mock-label">Products</span>
            <div className="landing-mock-bar" style={{ width: "72%" }} />
            <div className="landing-mock-bar" style={{ width: "48%" }} />
          </div>
          <div className="landing-mock-card landing-mock-card-2">
            <span className="landing-mock-label">Planning</span>
            <div className="landing-mock-pills">
              <span>Project</span>
              <span>Feature</span>
              <span>Task</span>
            </div>
          </div>
          <div className="landing-mock-card landing-mock-card-3">
            <span className="landing-mock-label">Organization</span>
            <div className="landing-mock-dots">
              <span /><span /><span />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="landing-section">
        <h2 className="landing-section-title">Platform Features</h2>
        <p className="landing-section-sub">Everything you need to manage products and teams at scale</p>
        <div className="landing-features-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="landing-feature-card">
              <span className="landing-feature-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="landing-section landing-section-alt">
        <h2 className="landing-section-title">How to Get Started</h2>
        <div className="landing-steps">
          {STEPS.map((s) => (
            <div key={s.num} className="landing-step">
              <span className="landing-step-num">{s.num}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="login" className="landing-section">
        <div className="landing-split">
          <div className="landing-split-info">
            <h2>Company Sign In</h2>
            <p>
              If you already received a Company ID and credentials, sign in here to access
              your dedicated workspace. Each company has fully isolated data and users.
            </p>
            <ul className="landing-checklist">
              <li>Your unique Company ID</li>
              <li>Company admin email and password</li>
              <li>Access to dashboard, products, and planning</li>
            </ul>
          </div>
          <form onSubmit={handleLogin} className="landing-form-card auth-login-card">
            <header className="auth-login-head">
              <p className="auth-login-kicker">Company workspace</p>
              <h3>Sign in</h3>
              <p className="auth-login-sub">Use your Company ID and account credentials.</p>
            </header>

            <div className="auth-login-fields">
              <div className="form-group">
                <label htmlFor="login-slug">Company ID</label>
                <input
                  id="login-slug"
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  placeholder="acme-corp"
                  required
                  autoComplete="organization"
                />
              </div>
              <div className="form-group">
                <label htmlFor="login-email">Email or username</label>
                <input
                  id="login-email"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
              <div className="form-group">
                <label htmlFor="login-pass">Password</label>
                <input
                  id="login-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="auth-login-meta">
              <label className="auth-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="auth-remember-text">
                  <strong>Remember me</strong>
                  <em>Stay signed in for 30 days</em>
                </span>
              </label>
              <Link
                href={`/forgot-password?slug=${encodeURIComponent(tenantSlug.trim().toLowerCase())}${
                  EMAIL_PATTERN.test(loginId.trim())
                    ? `&email=${encodeURIComponent(loginId.trim().toLowerCase())}`
                    : ""
                }`}
                className="auth-forgot-link"
              >
                Forgot password?
              </Link>
            </div>

            {loginError ? <p className="auth-error">{loginError}</p> : null}

            <button
              type="submit"
              className="btn btn-primary auth-submit"
              disabled={loginLoading || passkeyLoading}
            >
              {loginLoading ? "Signing in…" : "Sign in"}
            </button>

            {passkeysOk ? (
              <div className="auth-passkey-block">
                <div className="auth-passkey-divider" aria-hidden>
                  <span>or</span>
                </div>
                <button
                  type="button"
                  className="auth-passkey-btn"
                  disabled={loginLoading || passkeyLoading}
                  onClick={() => void handlePasskeyLogin()}
                >
                  <svg className="auth-passkey-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <path
                      d="M12 11v7.5M12 18.5l2.2-1.4M12 16.2l2.2-1.4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M7.5 10.2a5.2 5.2 0 1 1 9 0"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="auth-passkey-copy">
                    <strong>{passkeyLoading ? "Waiting for device…" : "Sign in with passkey"}</strong>
                    <em>Face ID · Touch ID · Windows Hello · security key</em>
                  </span>
                </button>
              </div>
            ) : null}
          </form>
        </div>
      </section>

      <section id="request" className="landing-section landing-section-alt">
        <div className="landing-request-wrap">
          <div className="landing-request-header">
            <h2>Request Access</h2>
            <p>
              Submit your company details. After platform admin review, you will receive
              a Company ID and login credentials.
            </p>
          </div>
          {requestSuccess ? (
            <div className="landing-success-card">
              <span className="landing-success-icon">✓</span>
              <h3>Request submitted</h3>
              <p>The platform team will review your request and contact you by email.</p>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setRequestSuccess(false)}
              >
                Submit another request
              </button>
            </div>
          ) : (
            <form onSubmit={handleRequest} className="landing-request-form">
              <div className="landing-form-grid">
                <div className="form-group">
                  <label htmlFor="req-company">Company name *</label>
                  <input
                    id="req-company"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Corp"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="req-slug">Preferred Company ID</label>
                  <input
                    id="req-slug"
                    value={preferredSlug}
                    onChange={(e) => setPreferredSlug(e.target.value)}
                    placeholder="acme-corp"
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="req-name">Contact name *</label>
                  <input
                    id="req-name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="req-email">Contact email *</label>
                  <input
                    id="req-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="req-phone">Phone</label>
                  <input
                    id="req-phone"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="req-size">Company size</label>
                  <select
                    id="req-size"
                    value={companySize}
                    onChange={(e) => setCompanySize(e.target.value)}
                  >
                    <option value="">Select…</option>
                    <option value="1-10">1–10 people</option>
                    <option value="11-50">11–50 people</option>
                    <option value="51-200">51–200 people</option>
                    <option value="200+">200+ people</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="req-industry">Industry</label>
                  <input
                    id="req-industry"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="Technology, manufacturing, …"
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="req-msg">Additional notes</label>
                <textarea
                  id="req-msg"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Expected users, use cases, timeline, …"
                />
              </div>
              {requestError && <p className="auth-error">{requestError}</p>}
              <button type="submit" className="btn btn-primary landing-btn-lg" disabled={requestLoading}>
                {requestLoading ? "Submitting…" : "Submit request"}
              </button>
            </form>
          )}
        </div>
      </section>

      <footer className="landing-footer">
        <p>© PMAS Live — Enterprise Product Management Platform</p>
        <Link href="/platform/login">Platform admin sign in</Link>
      </footer>
    </div>
  );
}
