import { getApiBaseUrl } from "@/shared/config/env";
import { useAuthStore } from "@/core/auth/auth-store";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean;
}

interface ApiEnvelope<T = unknown> {
  success?: boolean;
  data?: T;
  meta?: unknown;
  errors?: { code?: string; message?: string }[];
  error?: string;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isEnvelope(payload: unknown): payload is ApiEnvelope {
  return (
    typeof payload === "object" &&
    payload !== null &&
    ("success" in payload || "data" in payload || "errors" in payload)
  );
}

/** Unwraps VSM `{ success, data }` envelope; passes through legacy raw payloads. */
export function unwrapData<T>(payload: unknown): T {
  if (isEnvelope(payload) && "data" in payload && payload.data !== undefined) {
    return payload.data as T;
  }
  return payload as T;
}

export function unwrapList<T>(payload: unknown): T[] {
  const data = unwrapData<unknown>(payload);
  return Array.isArray(data) ? (data as T[]) : [];
}

function errorFromPayload(payload: unknown, status: number): HttpError {
  if (isEnvelope(payload) && Array.isArray(payload.errors) && payload.errors.length > 0) {
    const first = payload.errors[0];
    return new HttpError(
      first.message || `Request failed with status ${status}`,
      status,
      payload,
      first.code,
    );
  }
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error: unknown }).error === "string"
  ) {
    return new HttpError((payload as { error: string }).error, status, payload);
  }
  return new HttpError(`Request failed with status ${status}`, status, payload);
}

export async function httpRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, headers, auth = true, ...rest } = options;
  const token = useAuthStore.getState().token;

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    throw errorFromPayload(payload, response.status);
  }

  // Business errors sometimes returned as 200 with success:false — treat as failure.
  if (isEnvelope(payload) && payload.success === false) {
    throw errorFromPayload(payload, response.status || 400);
  }

  return unwrapData<T>(payload);
}

export const httpClient = {
  get: <T>(path: string, auth = true) => httpRequest<T>(path, { auth }),
  post: <T>(path: string, body?: unknown, auth = true) =>
    httpRequest<T>(path, { method: "POST", body, auth }),
  put: <T>(path: string, body?: unknown, auth = true) =>
    httpRequest<T>(path, { method: "PUT", body, auth }),
  patch: <T>(path: string, body?: unknown, auth = true) =>
    httpRequest<T>(path, { method: "PATCH", body, auth }),
  delete: <T>(path: string, auth = true) =>
    httpRequest<T>(path, { method: "DELETE", auth }),
};
