import http from "k6/http";
import { check, sleep } from "k6";
import { loginAndPrefetch, buildAuthHeaders, BASE_URL } from "./shared.js";

// Spike test: 50 -> 500 -> 2000 VUs; observe recovery.
export const options = {
  scenarios: {
    spike: {
      executor: "ramping-vus",
      startVUs: 50,
      stages: [
        { duration: "60s", target: 50 },
        { duration: "30s", target: 500 },
        { duration: "60s", target: 500 },
        { duration: "30s", target: 2000 },
        { duration: "60s", target: 2000 },
        { duration: "60s", target: 50 },
      ],
      gracefulStop: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.08"],
  },
};

export function setup() {
  return loginAndPrefetch();
}

export default function (data) {
  const headers = data.authHeaders ?? buildAuthHeaders(data.token);

  const dash = http.get(`${BASE_URL}/api/v1/dashboard`, { headers });
  check(dash, { "dashboard 2xx": (r) => r.status >= 200 && r.status < 300 });

  http.get(`${BASE_URL}/api/v1/products?page_size=100`, { headers });
  if (data.productId !== null) http.get(`${BASE_URL}/api/v1/products/${data.productId}`, { headers });

  if (data.featureId !== null) http.get(`${BASE_URL}/api/v1/tasks?feature_id=${data.featureId}`, { headers });

  http.get(`${BASE_URL}/api/v1/work-items?section=${data.workItemsSection}`, { headers });
  http.get(`${BASE_URL}/api/v1/search?q=${encodeURIComponent(data.searchQuery)}`, { headers });

  http.get(`${BASE_URL}/api/v1/graph/topology`, { headers });
  http.get(`${BASE_URL}/api/v1/engineering/subsystems`, { headers });

  sleep(0.3);
}

