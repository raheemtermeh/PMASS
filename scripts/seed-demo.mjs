/**
 * Seeds a realistic demo dataset into a PMAS company through the public API,
 * so every record passes the same validation and business rules the UI enforces.
 *
 * Credentials come from the environment — never hardcode them here:
 *   $env:PMAS_SEED_EMAIL="you@example.com"
 *   $env:PMAS_SEED_PASS="..."
 *   $env:PMAS_SEED_TENANT="abb"
 *   node scripts/seed-demo.mjs
 *
 * Re-running is safe: anything that already exists by name is reused, not duplicated.
 */

const BASE = process.env.PMAS_API_URL || "http://localhost:8080";
const EMAIL = process.env.PMAS_SEED_EMAIL;
const PASSWORD = process.env.PMAS_SEED_PASS;
const TENANT = process.env.PMAS_SEED_TENANT;

if (!EMAIL || !PASSWORD || !TENANT) {
  console.error("Set PMAS_SEED_EMAIL, PMAS_SEED_PASS and PMAS_SEED_TENANT first.");
  process.exit(1);
}

let token = "";
const created = { employees: 0, departments: 0, teams: 0, memberships: 0, products: 0, pipelines: 0, projects: 0, features: 0, tasks: 0, productMembers: 0 };
const skipped = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The API allows 30 requests per minute per IP. Stay just under that and wait for
// the sliding window to open rather than hammering it into 429s.
const RATE_LIMIT = 28;
const WINDOW_MS = 60_000;
const recentCalls = [];

async function throttle() {
  for (;;) {
    const now = Date.now();
    while (recentCalls.length && now - recentCalls[0] > WINDOW_MS) recentCalls.shift();
    if (recentCalls.length < RATE_LIMIT) {
      recentCalls.push(now);
      return;
    }
    const waitMs = WINDOW_MS - (now - recentCalls[0]) + 250;
    process.stdout.write(`  …rate limit, waiting ${Math.ceil(waitMs / 1000)}s\n`);
    await sleep(waitMs);
  }
}

async function rawRequest(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { res, payload };
}

async function api(method, path, body, attempt = 0) {
  await throttle();
  const { res, payload } = await rawRequest(method, path, body);

  if (res.status === 429 && attempt < 5) {
    const waitMs = Number(res.headers.get("Retry-After") || 60) * 1000 + 500;
    process.stdout.write(`  …throttled by server, backing off ${Math.ceil(waitMs / 1000)}s\n`);
    await sleep(waitMs);
    recentCalls.length = 0;
    return api(method, path, body, attempt + 1);
  }

  if (!res.ok) {
    const message =
      payload?.errors?.[0]?.message || payload?.error || payload?.message || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return payload?.data ?? payload;
}

const get = (p) => api("GET", p);
const post = (p, b) => api("POST", p, b);
const put = (p, b) => api("PUT", p, b);

/** Runs a create, tolerating "already exists" style conflicts on re-runs. */
async function tryCreate(label, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.status === 409 || /exists|taken|duplicate|already/i.test(err.message)) {
      skipped.push(`${label} — ${err.message}`);
      return null;
    }
    throw new Error(`${label}: ${err.message}`);
  }
}

// ---------------------------------------------------------------- source data

const EMPLOYEES = [
  ["Sara", "Ahmadi", "sara.ahmadi", "Head of Product", "+98 912 100 2001"],
  ["Reza", "Karimi", "reza.karimi", "Engineering Director", "+98 912 100 2002"],
  ["Mina", "Tehrani", "mina.tehrani", "Design Lead", "+98 912 100 2003"],
  ["Amir", "Sadeghi", "amir.sadeghi", "Backend Engineer", "+98 912 100 2004"],
  ["Nazanin", "Rahimi", "nazanin.rahimi", "Frontend Engineer", "+98 912 100 2005"],
  ["Hossein", "Moradi", "hossein.moradi", "QA Engineer", "+98 912 100 2006"],
  ["Elham", "Nouri", "elham.nouri", "Product Manager", "+98 912 100 2007"],
  ["Kaveh", "Jafari", "kaveh.jafari", "DevOps Engineer", "+98 912 100 2008"],
  ["Shirin", "Bahrami", "shirin.bahrami", "Data Analyst", "+98 912 100 2009"],
  ["Omid", "Ansari", "omid.ansari", "Mobile Engineer", "+98 912 100 2010"],
  ["Leila", "Hashemi", "leila.hashemi", "Marketing Manager", "+98 912 100 2011"],
  ["Babak", "Yazdani", "babak.yazdani", "Growth Specialist", "+98 912 100 2012"],
  ["Parisa", "Ebrahimi", "parisa.ebrahimi", "UX Researcher", "+98 912 100 2013"],
  ["Siavash", "Golzar", "siavash.golzar", "Solutions Architect", "+98 912 100 2014"],
  ["Maryam", "Kazemi", "maryam.kazemi", "Finance Lead", "+98 912 100 2015"],
  ["Arash", "Panahi", "arash.panahi", "Support Lead", "+98 912 100 2016"],
  ["Setareh", "Mohammadi", "setareh.mohammadi", "Scrum Master", "+98 912 100 2017"],
  ["Farhad", "Rostami", "farhad.rostami", "Security Engineer", "+98 912 100 2018"],
  ["Golnaz", "Sharifi", "golnaz.sharifi", "Content Strategist", "+98 912 100 2019"],
  ["Peyman", "Kiani", "peyman.kiani", "Platform Engineer", "+98 912 100 2020"],
];

const DEPARTMENTS = [
  ["Product", "Owns discovery, roadmap and product outcomes.", "Sara Ahmadi"],
  ["Engineering", "Builds and operates the platform.", "Reza Karimi"],
  ["Design", "Research, UX and the design system.", "Mina Tehrani"],
  ["Marketing", "Positioning, campaigns and growth.", "Leila Hashemi"],
  ["Operations", "Finance, support and internal tooling.", "Maryam Kazemi"],
];

const TEAMS = [
  ["Core Platform", "Engineering", "Siavash Golzar", 6, "Shared services and APIs."],
  ["Checkout Squad", "Engineering", "Amir Sadeghi", 5, "Cart, payment and order flow."],
  ["Mobile Squad", "Engineering", "Omid Ansari", 4, "iOS and Android apps."],
  ["Quality Guild", "Engineering", "Hossein Moradi", 3, "Test automation and release quality."],
  ["Product Discovery", "Product", "Elham Nouri", 4, "Opportunity sizing and validation."],
  ["Design Studio", "Design", "Parisa Ebrahimi", 3, "Research and interface design."],
  ["Growth Team", "Marketing", "Babak Yazdani", 4, "Acquisition and lifecycle campaigns."],
  ["Business Ops", "Operations", "Arash Panahi", 3, "Support, billing and reporting."],
];

/** employee full name → team name (one team per person, as the domain requires). */
const TEAM_MEMBERS = {
  "Core Platform": ["Siavash Golzar", "Peyman Kiani", "Farhad Rostami"],
  "Checkout Squad": ["Amir Sadeghi", "Nazanin Rahimi"],
  "Mobile Squad": ["Omid Ansari"],
  "Quality Guild": ["Hossein Moradi"],
  "Product Discovery": ["Elham Nouri", "Shirin Bahrami"],
  "Design Studio": ["Parisa Ebrahimi", "Mina Tehrani"],
  "Growth Team": ["Babak Yazdani", "Golnaz Sharifi", "Leila Hashemi"],
  "Business Ops": ["Arash Panahi", "Maryam Kazemi", "Setareh Mohammadi"],
};

const PRODUCTS = [
  {
    name: "Alibaba Marketplace",
    code: "MKT-001",
    category: "E-commerce",
    product_type: "Platform",
    execution_model: "PROJECT_FEATURE_TASK",
    priority: "HIGH",
    owner: "Sara Ahmadi",
    manager: "Elham Nouri",
    vision: "The default place Iranians buy and sell online.",
    goal: "Grow monthly active buyers by 40% this year.",
    success_metrics: "MAU, GMV, repeat purchase rate",
    business_value: "Primary revenue engine for the company.",
    description: "Core buyer and seller marketplace experience.",
    pipeline: ["Discovery", "Analysis", "Design", "Development", "QA", "Release"],
    advance: 3,
    projects: [
      {
        name: "Checkout Revamp",
        code: "MKT-P1",
        goal: "Cut checkout abandonment below 20%.",
        priority: "HIGH",
        features: [
          ["One-click payment", "HIGH", ["Integrate wallet provider", "Store tokenized cards", "Add failure retry"]],
          ["Guest checkout", "MEDIUM", ["Skip account creation", "Email order receipt"]],
          ["Address autocomplete", "MEDIUM", ["Wire postal API", "Cache recent addresses"]],
        ],
      },
      {
        name: "Seller Dashboard",
        code: "MKT-P2",
        goal: "Give sellers same-day visibility into orders.",
        priority: "MEDIUM",
        features: [
          ["Live order feed", "HIGH", ["Streaming endpoint", "Dashboard widget"]],
          ["Payout reports", "MEDIUM", ["Monthly statement export"]],
        ],
      },
    ],
  },
  {
    name: "Alibaba Pay",
    code: "PAY-002",
    category: "Fintech",
    product_type: "Service",
    execution_model: "PROJECT_FEATURE_TASK",
    priority: "CRITICAL",
    owner: "Reza Karimi",
    manager: "Sara Ahmadi",
    vision: "Payments that never make a customer think.",
    goal: "Reach 99.95% payment success rate.",
    success_metrics: "Auth rate, settlement time, chargeback ratio",
    business_value: "Removes third-party payment fees.",
    description: "In-house wallet and payment gateway.",
    pipeline: ["Requirements", "Configuration", "Integration", "UAT", "Go-live"],
    advance: 2,
    projects: [
      {
        name: "Wallet Core",
        code: "PAY-P1",
        goal: "Ship the ledger and balance service.",
        priority: "CRITICAL",
        features: [
          ["Double-entry ledger", "CRITICAL", ["Schema design", "Balance reconciliation job", "Audit trail"]],
          ["Refund flow", "HIGH", ["Partial refunds", "Refund notifications"]],
        ],
      },
    ],
  },
  {
    name: "Merchant CRM",
    code: "CRM-003",
    category: "CRM",
    product_type: "Internal",
    execution_model: "PROJECT_FEATURE_TASK",
    priority: "MEDIUM",
    owner: "Elham Nouri",
    manager: "Arash Panahi",
    vision: "One view of every merchant relationship.",
    goal: "Cut merchant response time to under 4 hours.",
    success_metrics: "First response time, retention",
    business_value: "Improves merchant retention and upsell.",
    description: "Relationship and support tooling for merchant teams.",
    pipeline: ["Discovery", "Data Model", "Workflow", "Pilot", "Rollout"],
    advance: 1,
    projects: [
      {
        name: "Merchant 360",
        code: "CRM-P1",
        goal: "Unify merchant data into one profile.",
        priority: "MEDIUM",
        features: [
          ["Unified profile", "HIGH", ["Merge data sources", "Timeline view"]],
          ["Support inbox", "MEDIUM", ["Ticket routing"]],
        ],
      },
    ],
  },
  {
    name: "Alibaba Mobile App",
    code: "APP-004",
    category: "Mobile",
    product_type: "Application",
    execution_model: "PROJECT_FEATURE_TASK",
    priority: "HIGH",
    owner: "Omid Ansari",
    manager: "Mina Tehrani",
    vision: "Shopping that feels instant on any phone.",
    goal: "Push app store rating above 4.5.",
    success_metrics: "Crash-free sessions, rating, DAU",
    business_value: "Mobile is 70% of traffic.",
    description: "Native iOS and Android shopping app.",
    pipeline: ["Concept", "UX", "Build", "Beta", "Store Release"],
    advance: 2,
    projects: [
      {
        name: "App Performance",
        code: "APP-P1",
        goal: "Halve cold start time.",
        priority: "HIGH",
        features: [
          ["Cold start optimization", "HIGH", ["Lazy module loading", "Image cache rewrite"]],
          ["Offline browsing", "LOW", ["Cache product list"]],
        ],
      },
    ],
  },
  {
    name: "Growth Campaign Hub",
    code: "GRW-005",
    category: "Marketing",
    product_type: "Internal",
    execution_model: "PROJECT_FEATURE_TASK",
    priority: "LOW",
    owner: "Leila Hashemi",
    manager: "Babak Yazdani",
    vision: "Every campaign measurable in one place.",
    goal: "Reduce campaign setup time to under a day.",
    success_metrics: "Campaign ROI, setup time",
    business_value: "Faster, cheaper acquisition experiments.",
    description: "Campaign planning and attribution tooling.",
    pipeline: ["Research", "Strategy", "Creative", "Launch", "Measure"],
    advance: 0,
    projects: [
      {
        name: "Attribution v1",
        code: "GRW-P1",
        goal: "Track spend to revenue per channel.",
        priority: "MEDIUM",
        features: [["Channel attribution", "MEDIUM", ["UTM ingestion", "Revenue join"]]],
      },
    ],
  },
  {
    name: "Logistics Tracker",
    code: "LOG-006",
    category: "Operations",
    product_type: "Platform",
    execution_model: "DIRECT_TASK",
    priority: "MEDIUM",
    owner: "Arash Panahi",
    manager: "Maryam Kazemi",
    vision: "Customers always know where their order is.",
    goal: "Reduce 'where is my order' tickets by half.",
    success_metrics: "Support ticket volume, delivery SLA",
    business_value: "Lower support cost, higher trust.",
    description: "Shipment tracking across delivery partners.",
    pipeline: ["Discovery", "Analysis", "Design", "Development", "QA", "Release"],
    advance: 0,
    projects: [],
  },
];

const PRODUCT_MEMBER_ROLES = [
  ["Nazanin Rahimi", "CONTRIBUTOR"],
  ["Hossein Moradi", "APPROVER"],
  ["Shirin Bahrami", "STAKEHOLDER"],
  ["Setareh Mohammadi", "VIEWER"],
];

// ---------------------------------------------------------------------- steps

async function login() {
  const res = await post("/api/v1/auth/login", {
    tenant_slug: TENANT,
    email: EMAIL,
    password: PASSWORD,
  });
  token = res.token;
  if (!token) throw new Error("Login returned no token");
  console.log(`Signed in as ${res.user.full_name} (${res.user.tenant.name})`);
}

async function seedEmployees() {
  const existing = await get("/api/v1/employees?page_size=200");
  const byName = new Map(
    (existing || []).map((e) => [`${e.first_name} ${e.last_name}`.trim(), e]),
  );

  for (const [first, last, handle, jobTitle, phone] of EMPLOYEES) {
    const full = `${first} ${last}`;
    if (byName.has(full)) continue;
    const emp = await tryCreate(`employee ${full}`, () =>
      post("/api/v1/employees", {
        first_name: first,
        last_name: last,
        email: `${handle}@alibaba-demo.com`,
        phone,
        job_title: jobTitle,
      }),
    );
    if (emp) {
      byName.set(full, emp);
      created.employees++;
    }
  }
  return byName;
}

async function seedDepartments(empByName) {
  const existing = await get("/api/v1/departments?page_size=100");
  const byName = new Map((existing || []).map((d) => [d.name, d]));

  for (const [name, description, managerName] of DEPARTMENTS) {
    if (byName.has(name)) continue;
    const manager = empByName.get(managerName);
    if (!manager) {
      skipped.push(`department ${name} — manager ${managerName} missing`);
      continue;
    }
    const dept = await tryCreate(`department ${name}`, () =>
      post("/api/v1/departments", { name, description, manager_id: manager.id }),
    );
    if (dept) {
      byName.set(name, dept);
      created.departments++;
    }
  }
  return byName;
}

async function seedTeams(empByName, deptByName) {
  const existing = await get("/api/v1/teams?page_size=100");
  const byName = new Map((existing || []).map((t) => [t.name, t]));

  for (const [name, deptName, leadName, capacity, description] of TEAMS) {
    if (byName.has(name)) continue;
    const dept = deptByName.get(deptName);
    const lead = empByName.get(leadName);
    if (!dept || !lead) {
      skipped.push(`team ${name} — missing department or lead`);
      continue;
    }
    const team = await tryCreate(`team ${name}`, () =>
      post("/api/v1/teams", {
        department_id: dept.id,
        lead_id: lead.id,
        name,
        description,
        capacity,
        status: "ACTIVE",
      }),
    );
    if (team) {
      byName.set(name, team);
      created.teams++;
    }
  }
  return byName;
}

async function seedMemberships(empByName, teamByName) {
  const existing = await get("/api/v1/teams/memberships");
  const taken = new Set((existing || []).map((m) => m.employee_id));

  for (const [teamName, members] of Object.entries(TEAM_MEMBERS)) {
    const team = teamByName.get(teamName);
    if (!team) continue;
    for (const memberName of members) {
      const emp = empByName.get(memberName);
      if (!emp || taken.has(emp.id)) continue;
      const ok = await tryCreate(`membership ${memberName} → ${teamName}`, () =>
        post(`/api/v1/employees/${emp.id}/teams/${team.id}`),
      );
      if (ok !== null) {
        taken.add(emp.id);
        created.memberships++;
      }
    }
  }
}

async function seedProducts(empByName, deptByName) {
  const existing = await get("/api/v1/products?page_size=100");
  const byName = new Map((existing || []).map((p) => [p.name, p]));
  const departments = [...deptByName.values()];
  const out = [];

  for (const spec of PRODUCTS) {
    let product = byName.get(spec.name);
    if (!product) {
      const owner = empByName.get(spec.owner);
      const manager = empByName.get(spec.manager);
      if (!owner || !manager) {
        skipped.push(`product ${spec.name} — owner or manager missing`);
        continue;
      }
      product = await tryCreate(`product ${spec.name}`, () =>
        post("/api/v1/products", {
          owner_id: owner.id,
          manager_id: manager.id,
          name: spec.name,
          description: spec.description,
          category: spec.category,
          execution_model: spec.execution_model,
          code: spec.code,
          product_type: spec.product_type,
          priority: spec.priority,
          vision: spec.vision,
          goal: spec.goal,
          success_metrics: spec.success_metrics,
          business_value: spec.business_value,
          visibility: "ORGANIZATION",
        }),
      );
      if (!product) continue;
      created.products++;
    }
    out.push({ spec, product });

    if (!product.pipeline_id && spec.pipeline?.length) {
      const stages = spec.pipeline.map((name, order) => ({
        name,
        order,
        description: "",
        entry_criteria: "",
        exit_criteria: "manual_confirm",
        department_id: departments[order % Math.max(departments.length, 1)]?.id ?? null,
      }));
      const pipeline = await tryCreate(`pipeline for ${spec.name}`, () =>
        post("/api/v1/pipelines", {
          product_id: product.id,
          name: `${spec.name} Pipeline`,
          description: "Product-dedicated pipeline",
          stages,
        }),
      );
      if (pipeline) created.pipelines++;
    }
  }
  return out;
}

/** Walks products partway down their pipeline so the list shows real stage progress. */
async function advanceProducts(products) {
  for (const { spec, product } of products) {
    if (!spec.advance) continue;
    const started = await tryCreate(`start ${spec.name}`, () =>
      post(`/api/v1/products/${product.id}/start`),
    );
    if (started === null) continue;
    for (let i = 0; i < spec.advance; i++) {
      const moved = await tryCreate(`advance ${spec.name}`, () =>
        post(`/api/v1/products/${product.id}/move-next`, { exit_criteria_met: true }),
      );
      if (moved === null) break;
    }
  }
}

async function seedProductMembers(products, empByName) {
  for (const { product } of products) {
    for (const [name, role] of PRODUCT_MEMBER_ROLES) {
      const emp = empByName.get(name);
      if (!emp) continue;
      const added = await tryCreate(`product member ${name}`, () =>
        post(`/api/v1/products/${product.id}/members`, { employee_id: emp.id, role }),
      );
      if (added) created.productMembers++;
    }
  }
}

async function seedPlanning(products, empByName, teamByName) {
  const assignees = [...empByName.values()];
  let assigneeIndex = 0;
  const nextAssignee = () => assignees[assigneeIndex++ % assignees.length];

  for (const { spec, product } of products) {
    for (const projectSpec of spec.projects ?? []) {
      const owner = empByName.get(spec.owner);
      const manager = empByName.get(spec.manager);
      const start = new Date();
      const end = new Date(Date.now() + 90 * 86_400_000);

      const project = await tryCreate(`project ${projectSpec.name}`, () =>
        post("/api/v1/projects", {
          product_id: product.id,
          name: projectSpec.name,
          description: projectSpec.goal,
          code: projectSpec.code,
          goal: projectSpec.goal,
          priority: projectSpec.priority,
          owner_id: owner?.id ?? null,
          manager_id: manager?.id ?? null,
          start_date: start.toISOString(),
          target_end_date: end.toISOString(),
        }),
      );
      if (!project) continue;
      created.projects++;

      for (const [title, priority, taskTitles] of projectSpec.features ?? []) {
        const feature = await tryCreate(`feature ${title}`, () =>
          post("/api/v1/features", { project_id: project.id, title, priority }),
        );
        if (!feature) continue;
        created.features++;

        const team = [...teamByName.values()][created.features % Math.max(teamByName.size, 1)];
        if (team) {
          await tryCreate(`feature team ${title}`, () =>
            put(`/api/v1/features/${feature.id}`, { team_id: team.id }),
          );
        }

        for (const taskTitle of taskTitles ?? []) {
          const assignee = nextAssignee();
          const task = await tryCreate(`task ${taskTitle}`, () =>
            post("/api/v1/tasks", {
              feature_id: feature.id,
              title: taskTitle,
              priority,
              assignee_id: assignee?.id ?? null,
              due_date: new Date(Date.now() + 21 * 86_400_000).toISOString(),
            }),
          );
          if (task) created.tasks++;
        }
      }
    }
  }
}

async function main() {
  await login();

  console.log("Seeding employees…");
  const empByName = await seedEmployees();
  console.log("Seeding departments…");
  const deptByName = await seedDepartments(empByName);
  console.log("Seeding teams…");
  const teamByName = await seedTeams(empByName, deptByName);
  console.log("Assigning team members…");
  await seedMemberships(empByName, teamByName);
  console.log("Seeding products and pipelines…");
  const products = await seedProducts(empByName, deptByName);
  console.log("Advancing pipeline stages…");
  await advanceProducts(products);
  console.log("Adding product members…");
  await seedProductMembers(products, empByName);
  console.log("Seeding projects, features and tasks…");
  await seedPlanning(products, empByName, teamByName);

  console.log("\nCreated:");
  for (const [key, value] of Object.entries(created)) {
    console.log(`  ${key.padEnd(16)} ${value}`);
  }
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length} item(s) that already existed or were blocked:`);
    for (const s of skipped.slice(0, 25)) console.log(`  - ${s}`);
    if (skipped.length > 25) console.log(`  … and ${skipped.length - 25} more`);
  }
}

main().catch((err) => {
  console.error(`\nSeeding failed: ${err.message}`);
  process.exit(1);
});
