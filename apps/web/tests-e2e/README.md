# Playwright E2E (optional)

Default CI / local runs **skip** the mesh share test unless these env vars are set:

| Variable | Purpose |
| -------- | ------- |
| `RIFFSYNC_E2E_ROOM_PATH` | Path only, e.g. `/room/your-room-id` (uses `baseURL` from config) |
| `RIFFSYNC_E2E_HOST_ACCESS_TOKEN` | Cognito access token for the **room host** |
| `RIFFSYNC_E2E_HOST_REFRESH_TOKEN` | Cognito refresh token (stored in `localStorage`) |
| `RIFFSYNC_E2E_TOKEN_EXPIRY_SEC` | Seconds until access expiry for storage (e.g. `3600`) |

Optional:

- `RIFFSYNC_E2E_BASE_URL` — dev server origin (default `http://127.0.0.1:5173`).
- `RIFFSYNC_E2E_RUN=1` — Playwright starts Vite (`npm run dev`). Without it, no webServer is spawned (safe for **`npm run test:e2e`** in CI when the test itself is skipped).
- `RIFFSYNC_E2E_NO_WEBSERVER=1` — never start Vite from Playwright (you already run `npm run dev` manually).

The host flow uses **`?riffsyncE2e=1`** (dev-only) to avoid real **`getDisplayMedia`** in headless Linux; see [Playwright #31636](https://github.com/microsoft/playwright/issues/31636). Public examples of WebRTC + Playwright flags: [Trystero `playwright.config.ts`](https://github.com/dmotz/trystero/blob/main/playwright.config.ts).

Run:

```bash
cd apps/web && npm run test:e2e
```
