"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore, type AuthUser } from "@/core/auth/auth-store";
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

export default function WelcomePage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [menuOpen, setMenuOpen] = useState(false);
  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSlug, setForgotSlug] = useState("");
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

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
    async function checkState() {
      try {
        const status = await httpClient.get<{ needs_bootstrap: boolean }>(
          "/api/v1/auth/status",
          false,
        );
        if (status.needs_bootstrap) {
          router.replace("/setup");
          return;
        }
        if (token && user) {
          router.replace(
            sanitizeInternalPath(
              firstAllowedPath(user.role, user.permissions, Boolean(user.tenant_id)),
            ),
          );
        }
      } catch {
        /* API offline — still show landing */
      }
    }
    void checkState();
  }, [router, token, user]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await httpClient.post<{ token: string; user: AuthUser }>(
        "/api/v1/auth/login",
        {
          tenant_slug: tenantSlug.trim().toLowerCase(),
          email,
          password,
        },
        false,
      );
      setSession(res.token, res.user);
      router.replace(
        sanitizeInternalPath(
          firstAllowedPath(res.user.role, res.user.permissions, Boolean(res.user.tenant_id)),
        ),
      );
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setForgotError("");
    setForgotMsg("");
    setForgotLoading(true);
    try {
      const res = await httpClient.post<{ message: string }>(
        "/api/v1/auth/forgot-password",
        {
          tenant_slug: forgotSlug.trim().toLowerCase() || tenantSlug.trim().toLowerCase(),
          email: forgotEmail.trim().toLowerCase() || email.trim().toLowerCase(),
        },
        false,
      );
      setForgotMsg(res.message || "Request received. Contact your company admin if needed.");
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setForgotLoading(false);
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
          <form onSubmit={handleLogin} className="landing-form-card">
            <h3>Sign in to company panel</h3>
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
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
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
            {loginError && <p className="auth-error">{loginError}</p>}
            <button type="submit" className="btn btn-primary auth-submit" disabled={loginLoading}>
              {loginLoading ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              className="landing-forgot-link"
              onClick={() => {
                setForgotOpen(true);
                setForgotSlug(tenantSlug);
                setForgotEmail(email);
                setForgotMsg("");
                setForgotError("");
              }}
            >
              Forgot password?
            </button>
          </form>
        </div>
      </section>

      {forgotOpen ? (
        <div
          className="modal-backdrop active"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-password-title"
          onClick={() => !forgotLoading && setForgotOpen(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 id="forgot-password-title" className="modal-title">
                Forgot password
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setForgotOpen(false)}
                disabled={forgotLoading}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleForgotPassword} className="modal-body auth-form">
              <p className="text-dim" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
                Enter your Company ID and email. Your company administrator can reset the password
                from User Management.
              </p>
              <div className="form-group">
                <label htmlFor="forgot-slug">Company ID</label>
                <input
                  id="forgot-slug"
                  value={forgotSlug}
                  onChange={(e) => setForgotSlug(e.target.value)}
                  placeholder="acme-corp"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="forgot-email">Email</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
              {forgotError ? <p className="auth-error">{forgotError}</p> : null}
              {forgotMsg ? <p className="landing-success-inline">{forgotMsg}</p> : null}
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setForgotOpen(false)}
                  disabled={forgotLoading}
                >
                  Close
                </button>
                <button type="submit" className="btn btn-primary" disabled={forgotLoading}>
                  {forgotLoading ? "Sending…" : "Submit request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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
