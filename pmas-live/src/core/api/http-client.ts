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

type ApiEnvelope = {
  success?: boolean;
  data?: unknown;
  meta?: unknown;
  errors?: { code?: string; message?: string }[];
  error?: string;
};

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
    "success" in payload &&
    ("data" in payload || "errors" in payload)
  );
}

function messageFromPayload(payload: unknown, status: number): { message: string; code?: string } {
  if (isEnvelope(payload)) {
    const first = payload.errors?.[0];
    if (first?.message) return { message: first.message, code: first.code };
  }
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error: unknown }).error === "string"
  ) {
    return { message: (payload as { error: string }).error };
  }
  return { message: `Request failed with status ${status}` };
}

/** Unwraps VSM `{ success, data, meta, errors }` while keeping legacy raw JSON. */
export function unwrapApiData<T>(payload: unknown): T {
  if (isEnvelope(payload)) {
    if (payload.success === false) {
      const first = payload.errors?.[0];
      throw new HttpError(first?.message ?? "Request failed", 400, payload, first?.code);
    }
    return payload.data as T;
  }
  return payload as T;
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
    const { message, code } = messageFromPayload(payload, response.status);
    throw new HttpError(message, response.status, payload, code);
  }

  return unwrapApiData<T>(payload);
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
