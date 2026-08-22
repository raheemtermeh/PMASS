import http from "k6/http";
import { check, sleep } from "k6";
import { loginAndPrefetch, buildAuthHeaders, BASE_URL } from "./shared.js";

// Stress test: keep increasing load until the first real bottleneck.
// Stop early based on observed error rate / tail latencies / DB pool wait_count.
export const options = {
  scenarios: {
    stress: {
      executor: "ramping-vus",
      startVUs: 50,
      stages: [
        { duration: "2m", target: 100 },
        { duration: "2m", target: 250 },
        { duration: "3m", target: 500 },
        { duration: "3m", target: 1000 },
        { duration: "4m", target: 2000 },
        { duration: "4m", target: 3000 },
      ],
      gracefulStop: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
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
  if (data.productId !== null) {
    http.get(`${BASE_URL}/api/v1/products/${data.productId}`, { headers });
  }

  if (data.featureId !== null) {
    http.get(`${BASE_URL}/api/v1/tasks?feature_id=${data.featureId}`, { headers });
  }

  http.get(`${BASE_URL}/api/v1/work-items?section=${data.workItemsSection}`, { headers });
  http.get(`${BASE_URL}/api/v1/search?q=${encodeURIComponent(data.searchQuery)}`, { headers });

  http.get(`${BASE_URL}/api/v1/graph/topology`, { headers });
  http.get(`${BASE_URL}/api/v1/engineering/subsystems`, { headers });

  sleep(0.5);
}

