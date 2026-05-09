/**
 * Public HTTP API origin for **`GET /v1/catalog`** (no secrets).
 * Set **`VITE_PUBLIC_API_BASE_URL`** for production builds (see **`.env.example`**).
 */
export function getPublicApiBaseUrl(): string | undefined {
  const raw = import.meta.env.VITE_PUBLIC_API_BASE_URL?.trim()
  return raw && raw.length > 0 ? raw.replace(/\/$/, '') : undefined
}
