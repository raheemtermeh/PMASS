import http from "k6/http";
import { check, sleep } from "k6";
import { loginAndPrefetch, buildAuthHeaders, BASE_URL } from "./shared.js";

// Progressive load test. Use Grafana/Loki + `/metrics` snapshots to decide when to stop ramping.
export const options = {
  scenarios: {
    load: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "2m", target: 100 },
        { duration: "2m", target: 250 },
        { duration: "2m", target: 500 },
        { duration: "3m", target: 1000 },
        { duration: "3m", target: 2000 },
        { duration: "3m", target: 5000 },
      ],
      gracefulStop: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.03"],
  },
};

function safeJson(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

export function setup() {
  return loginAndPrefetch();
}

export default function (data) {
  const headers = data.authHeaders ?? buildAuthHeaders(data.token);

  const dash = http.get(`${BASE_URL}/api/v1/dashboard`, { headers });
  check(dash, { "dashboard 2xx": (r) => r.status >= 200 && r.status < 300 });

  const products = http.get(`${BASE_URL}/api/v1/products?page_size=100`, { headers });
  check(products, { "products 2xx": (r) => r.status >= 200 && r.status < 300 });

  if (data.productId !== null) {
    http.get(`${BASE_URL}/api/v1/products/${data.productId}`, { headers });
    http.get(`${BASE_URL}/api/v1/comments?entity_type=product&entity_id=${data.productId}`, { headers });
    http.get(`${BASE_URL}/api/v1/attachments?entity_type=product&entity_id=${data.productId}`, { headers });
  }

  if (data.projectId !== null) {
    http.get(`${BASE_URL}/api/v1/projects?product_id=${data.productId}`, { headers });
    http.get(`${BASE_URL}/api/v1/features?project_id=${data.projectId}`, { headers });
  }

  if (data.featureId !== null) {
    http.get(`${BASE_URL}/api/v1/tasks?feature_id=${data.featureId}`, { headers });
  }

  http.get(`${BASE_URL}/api/v1/work-items?section=${data.workItemsSection}`, { headers });
  http.get(`${BASE_URL}/api/v1/search?q=${encodeURIComponent(data.searchQuery)}`, { headers });

  const notifications = http.get(`${BASE_URL}/api/v1/notifications?mine=true&page_size=20`, { headers });
  const nJson = safeJson(notifications);
  const nArr = Array.isArray(nJson) ? nJson : nJson?.data ?? [];
  const firstNotifId = nArr?.[0]?.id ?? null;
  if (firstNotifId !== null) {
    http.post(`${BASE_URL}/api/v1/notifications/${firstNotifId}/read`, JSON.stringify({}), { headers });
  }

  http.get(`${BASE_URL}/api/v1/graph/topology`, { headers });
  http.get(`${BASE_URL}/api/v1/graph/members`, { headers });
  http.get(`${BASE_URL}/api/v1/graph/edges`, { headers });
  http.get(`${BASE_URL}/api/v1/engineering/subsystems`, { headers });

  sleep(0.5);
}

