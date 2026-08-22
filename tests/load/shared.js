import http from "k6/http";

function getEnv(name, defaultValue = undefined) {
  const v = __ENV[name];
  if (v === undefined || v === "") return defaultValue;
  return v;
}

export const BASE_URL = getEnv("BASE_URL", "http://localhost:3185");
export const TEST_USERNAME = getEnv("TEST_USERNAME");
export const TEST_PASSWORD = getEnv("TEST_PASSWORD");

// Real journey uses the "employee" portal when TENANT_SLUG != "platform".
// If you don't set these, the script will default to platform login.
export const TENANT_SLUG = getEnv("TENANT_SLUG", "platform");
export const PORTAL = getEnv("PORTAL", TENANT_SLUG === "platform" ? "platform" : "employee");

export const SEARCH_QUERY = getEnv("SEARCH_QUERY", "dashboard");
export const WORK_ITEMS_SECTION = getEnv("WORK_ITEMS_SECTION", "engineering");

function isEmail(s) {
  return typeof s === "string" && s.includes("@");
}

function safeParseJSON(res) {
  if (res === null || res === undefined) return null;
  try {
    return res.json();
  } catch {
    return null;
  }
}

function unwrapData(payload) {
  // Backend responses are sometimes raw JSON arrays/objects, and sometimes
  // VSM `{ success, data }` envelopes. This helper tolerates both.
  if (payload && typeof payload === "object") {
    if (Object.prototype.hasOwnProperty.call(payload, "data") && payload.data !== undefined) {
      return payload.data;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "success") && Object.prototype.hasOwnProperty.call(payload, "data")) {
      return payload.data;
    }
  }
  return payload;
}

function pickFirstId(rows, idField = "id") {
  const arr = Array.isArray(rows) ? rows : [];
  const first = arr[0];
  if (!first) return null;
  return first[idField] ?? null;
}

export function buildAuthHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function loginAndPrefetch() {
  if (!TEST_USERNAME || !TEST_PASSWORD) {
    throw new Error("Missing env vars TEST_USERNAME / TEST_PASSWORD");
  }

  const identifier = TEST_USERNAME.trim();
  const emailOrUsername = isEmail(identifier) ? { email: identifier.toLowerCase() } : { username: identifier };

  // Backend login contract (see `internal/handlers/auth.go`): portal, tenant_slug,
  // email or username, password, remember_me.
  const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({
    portal: PORTAL,
    tenant_slug: TENANT_SLUG === "platform" ? "platform" : TENANT_SLUG,
    ...emailOrUsername,
    password: TEST_PASSWORD,
    remember_me: false,
  }), {
    headers: { "Content-Type": "application/json" },
  });

  if (loginRes.status < 200 || loginRes.status >= 300) {
    throw new Error(`login failed: status=${loginRes.status} body=${loginRes.body?.slice(0, 300)}`);
  }

  const loginJson = safeParseJSON(loginRes);
  const token = loginJson?.token;
  if (!token) {
    throw new Error(`login response missing token: ${loginRes.body?.slice(0, 300)}`);
  }

  const authHeaders = buildAuthHeaders(token);

  // Product -> Project -> Feature -> Task chain (for "tasks" + mutations).
  const productsRes = http.get(`${BASE_URL}/api/v1/products?page_size=100`, { headers: authHeaders });
  const productsJson = unwrapData(safeParseJSON(productsRes)) ?? [];
  const productId = pickFirstId(productsJson, "id");

  let projectId = null;
  let featureId = null;
  let taskId = null;

  if (productId !== null) {
    const projectsRes = http.get(`${BASE_URL}/api/v1/projects?product_id=${productId}`, { headers: authHeaders });
    const projectsJson = unwrapData(safeParseJSON(projectsRes)) ?? [];
    projectId = pickFirstId(projectsJson, "id");

    if (projectId !== null) {
      // Planning UI uses: `/api/v1/features?project_id=${projectId}`
      const featuresRes = http.get(`${BASE_URL}/api/v1/features?project_id=${projectId}`, { headers: authHeaders });
      const featuresJson = unwrapData(safeParseJSON(featuresRes)) ?? [];
      featureId = pickFirstId(featuresJson, "id");

      if (featureId !== null) {
        const tasksRes = http.get(`${BASE_URL}/api/v1/tasks?feature_id=${featureId}`, { headers: authHeaders });
        const tasksJson = unwrapData(safeParseJSON(tasksRes)) ?? [];
        taskId = pickFirstId(tasksJson, "id");
      }
    }
  }

  return {
    token,
    productId,
    projectId,
    featureId,
    taskId,
    authHeaders,
    searchQuery: SEARCH_QUERY,
    workItemsSection: WORK_ITEMS_SECTION,
  };
}

