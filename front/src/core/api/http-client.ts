import { getApiBaseUrl } from "@/shared/config/env";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
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

export async function httpRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, headers, ...rest } = options;
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed with status ${response.status}`;

    throw new HttpError(message, response.status, payload);
  }

  return payload as T;
}

export const httpClient = {
  get: <T>(path: string) => httpRequest<T>(path),
  post: <T>(path: string, body?: unknown) =>
    httpRequest<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) =>
    httpRequest<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => httpRequest<T>(path, { method: "DELETE" }),
};
