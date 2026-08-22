import http from "k6/http";
import { check, sleep } from "k6";
import { loginAndPrefetch, buildAuthHeaders, BASE_URL } from "./shared.js";

const LOW_VUS = Number(__ENV.SOAK_LOW_VUS || 500);
const LOW_DURATION = __ENV.SOAK_LOW_DURATION || "30m";
const ENABLE_HIGH = (__ENV.SOAK_ENABLE_HIGH || "").toLowerCase() === "true";
const HIGH_VUS = Number(__ENV.SOAK_HIGH_VUS || 1000);
const HIGH_DURATION = __ENV.SOAK_HIGH_DURATION || "60m";

export const options = {
  scenarios: {
    soak: {
      executor: "ramping-vus",
      startVUs: LOW_VUS,
      stages: [
        { duration: LOW_DURATION, target: LOW_VUS },
        ...(ENABLE_HIGH ? [{ duration: HIGH_DURATION, target: HIGH_VUS }] : []),
      ],
      gracefulStop: "60s",
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
  if (data.productId !== null) http.get(`${BASE_URL}/api/v1/products/${data.productId}`, { headers });

  if (data.featureId !== null) http.get(`${BASE_URL}/api/v1/tasks?feature_id=${data.featureId}`, { headers });

  http.get(`${BASE_URL}/api/v1/work-items?section=${data.workItemsSection}`, { headers });
  http.get(`${BASE_URL}/api/v1/search?q=${encodeURIComponent(data.searchQuery)}`, { headers });

  http.get(`${BASE_URL}/api/v1/graph/topology`, { headers });

  sleep(1);
}

