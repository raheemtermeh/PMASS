import http from "k6/http";
import { check, sleep } from "k6";
import { loginAndPrefetch, buildAuthHeaders, BASE_URL } from "./shared.js";

export const options = {
  scenarios: {
    smoke: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "60s", target: 5 },
        { duration: "60s", target: 5 },
        { duration: "30s", target: 1 },
      ],
      gracefulStop: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(99)<25000"],
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

  // Login -> Dashboard (representative reads)
  const dash = http.get(`${BASE_URL}/api/v1/dashboard`, { headers });
  check(dash, { "dashboard 2xx": (r) => r.status >= 200 && r.status < 300 });

  // Products + product detail, including attachments/comments read paths
  const products = http.get(`${BASE_URL}/api/v1/products?page_size=100`, { headers });
  check(products, { "products 2xx": (r) => r.status >= 200 && r.status < 300 });

  if (data.productId !== null) {
    const product = http.get(`${BASE_URL}/api/v1/products/${data.productId}`, { headers });
    check(product, { "product detail 2xx": (r) => r.status >= 200 && r.status < 300 });

    const comments = http.get(
      `${BASE_URL}/api/v1/comments?entity_type=product&entity_id=${data.productId}`,
      { headers },
    );
    check(comments, { "comments 2xx": (r) => r.status >= 200 && r.status < 300 });

    const attachments = http.get(
      `${BASE_URL}/api/v1/attachments?entity_type=product&entity_id=${data.productId}`,
      { headers },
    );
    check(attachments, { "attachments 2xx": (r) => r.status >= 200 && r.status < 300 });
  }

  // Planning: projects/features/tasks reads
  if (data.projectId !== null) {
    const projects = http.get(`${BASE_URL}/api/v1/projects?product_id=${data.productId}`, { headers });
    check(projects, { "projects 2xx": (r) => r.status >= 200 && r.status < 300 });
  }
  if (data.projectId !== null) {
    const features = http.get(`${BASE_URL}/api/v1/features?project_id=${data.projectId}`, { headers });
    check(features, { "features 2xx": (r) => r.status >= 200 && r.status < 300 });
  }
  if (data.featureId !== null) {
    const tasks = http.get(`${BASE_URL}/api/v1/tasks?feature_id=${data.featureId}`, { headers });
    check(tasks, { "tasks 2xx": (r) => r.status >= 200 && r.status < 300 });
  }

  // Workboard + search
  const workItems = http.get(`${BASE_URL}/api/v1/work-items?section=${data.workItemsSection}`, { headers });
  check(workItems, { "work-items 2xx": (r) => r.status >= 200 && r.status < 300 });

  const search = http.get(`${BASE_URL}/api/v1/search?q=${encodeURIComponent(data.searchQuery)}`, { headers });
  check(search, { "search 2xx": (r) => r.status >= 200 && r.status < 300 });

  // Notifications read + a tiny mutation (mark first notification as read)
  const notifications = http.get(`${BASE_URL}/api/v1/notifications?mine=true&page_size=20`, { headers });
  check(notifications, { "notifications 2xx": (r) => r.status >= 200 && r.status < 300 });

  const nJson = safeJson(notifications);
  const nArr = Array.isArray(nJson) ? nJson : nJson?.data ?? [];
  const firstNotifId = nArr?.[0]?.id ?? null;
  if (firstNotifId !== null) {
    const markRead = http.post(`${BASE_URL}/api/v1/notifications/${firstNotifId}/read`, JSON.stringify({}), {
      headers,
    });
    check(markRead, { "notification read 2xx": (r) => r.status >= 200 && r.status < 300 });
  }

  // Graph/topology reads (home "graph view" + engineering subsystem reads)
  const topology = http.get(`${BASE_URL}/api/v1/graph/topology`, { headers });
  check(topology, { "topology 2xx": (r) => r.status >= 200 && r.status < 300 });

  const members = http.get(`${BASE_URL}/api/v1/graph/members`, { headers });
  check(members, { "graph members 2xx": (r) => r.status >= 200 && r.status < 300 });

  const edges = http.get(`${BASE_URL}/api/v1/graph/edges`, { headers });
  check(edges, { "graph edges 2xx": (r) => r.status >= 200 && r.status < 300 });

  const subsystems = http.get(`${BASE_URL}/api/v1/engineering/subsystems`, { headers });
  check(subsystems, { "subsystems 2xx": (r) => r.status >= 200 && r.status < 300 });

  sleep(1);
}

