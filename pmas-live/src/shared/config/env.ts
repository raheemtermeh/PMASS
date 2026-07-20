export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured;
  // Same-origin in the browser — Next.js rewrites /api/* to the Go backend (no CORS).
  if (typeof window !== "undefined") return "";
  return process.env.API_INTERNAL_URL || "http://localhost:8080";
}
