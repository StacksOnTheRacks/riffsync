# Startup & bootstrap

## Lambda

- **Cold start:** initialize **AWS SDK clients** once per execution environment; optionally load **Secrets Manager** ARNs lazily per first reconcile invocation.
- **TMDB `/configuration`** cache: in-memory TTL (e.g. 24h) inside reconcile Lambda to avoid hammering TMDB (**`docs/contracts.tmdb.md`**).

## SPA (browser)

### Fan and guest room path (`/room/:id`)

- **Bootstrap order (contract):** (1) **`ensureGuestSession`** / read fan token from **localStorage**, (2) **room snapshot** (**`fetchRoom`** or join payload) including durable **`roomMode`** and **`avDisabled`**, (3) **`ChatSession`** — open **room WebSocket** with **`sessionId`** + optional fan JWT, (4) warm ICE via **`fetchRtcIceServers`**, (5) **`SfuMediaSession`** — SFU token + connect for media paths that need RTP, (6) **`TheaterPlayback`** init when layout is Theater. Layout and participant AV surfaces must not render authoritative mode or kill-switch state before the room snapshot is applied.
- **Module ownership:** Steps 3–6 map to **`ChatSession`**, ICE warm (shared helper consumed by **`SfuMediaSession`**), **`SfuMediaSession`**, and **`TheaterPlayback`** respectively — see **`execution_model.md`**. Thin **`RoomPage`** calls **`RoomRealtimeSdk.join()`** only (**#139**); it does not construct session modules directly.
- **Room snapshot fields:** **`roomMode`** (**Theater** default, **Video Chat** alternate) and **`avDisabled`** are **durable** on the room document; cold load and late join inherit them before WebSocket events arrive.
- **Publish gate:** Participant camera/microphone publish requires signed-in fan JWT, open room WebSocket, active presence row, and **`avDisabled === false`**. Server refuses participant producer SFU tokens when kill switch is on.
- **Media API separation:** Host lawful movie path uses **`getDisplayMedia`** (tab capture). Participant AV uses **`getUserMedia`**. Never substitute one for the other.
- **Reconnect:** After refresh or disconnect, participant camera and microphone default **off**; fan must re-enable manually (privacy-first). **Drawer-independent:** room WS reconnect does not reset SFU session (and vice versa) unless that drawer failed — healthy module stays **`connected`**.
- **Anonymous guests:** Subscribe-only for participant AV; no **`getUserMedia`** publish bootstrap. Attach participant AV SFU consumers **eagerly** after room snapshot + WebSocket open when **`avDisabled === false`**.
- **General:** read **`sessionId`** / display name from **localStorage**; configure API Gateway **WebSocket URL** + HTTP **API base URL** from build-time env (**`architecture.frontend.md`**). **Production** SPA canonical page origin is **`https://riffsync.tv`** (**`.ai/runtime/configuration.md`**, **`.ai/project.json`** **`public_domain`**).
- **Fan auth:** Hosted UI + PKCE on **`/auth/callback`**; fan tokens in the fan **localStorage** namespace; fan refresh and API attachment independent of staff.

### Staff admin paths (`/admin/*`)

- **Scope:** Routes under **`/admin/*`** (including **`/admin/login`**, **`/admin/auth/callback`**, protected admin shell) run a **separate bootstrap** from fan/guest bootstrap. Fan **`sessionId`**, fan JWT refresh, and room flows must **not** clear or overwrite staff tokens.
- **Order:** On navigation to a protected **`/admin/*`** route, (1) read **staff** token storage (distinct keys from fan), (2) refresh staff access token via staff Hosted UI token endpoint if stale, (3) if absent, redirect to staff Hosted UI PKCE (unlisted entry; bookmark/direct URL only).
- **OAuth isolation:** Staff PKCE uses **`/admin/auth/callback`** and staff-namespaced **sessionStorage** PKCE state so fan **`/auth/callback`** and fan PKCE keys never collide.
- **Coexistence:** Fan and staff sessions may **both** be present in one browser; staff sign-out clears staff storage only and returns to **`/admin/login`** without tearing down fan session or **`sessionId`**.
- **API calls:** **`/v1/admin/*`** requests attach **staff** Bearer tokens only; fan tokens must not be sent on admin routes.

## Local and CI media bootstrap profile

**SFU mandatory** in all environments — no mesh fallback. Local dev and PR CI use a **disposable SFU + TURN** stack that mirrors prod topology (mediasoup signaling, coturn relay, HMAC join JWT shape) without touching hosted prod media.

| Concern | Contract |
| --- | --- |
| **Purpose** | Same code path as prod **`SfuMediaSession`**; eliminates **`VITE_WEBRTC_USE_MEDIASOU_SFU`** mesh branch. |
| **Isolation** | CI harness runs against **ephemeral** containers/services — **no** prod SFU/TURN footprint. |
| **Startup order** | Start disposable TURN → start disposable **`riffsync-sfu`** → health probe **`/healthz`** → SPA or headless client **`join()`** per harness scenario. |
| **SPA env** | **`VITE_PUBLIC_SFU_WS_URL=ws://127.0.0.1:3000`** (overrides token **`wsUrl`**); optional **`VITE_WEBRTC_ICE_SERVERS_JSON`** for local coturn; prod **`VITE_PUBLIC_API_BASE_URL`** / **`VITE_PUBLIC_WS_URL`** unchanged — see **`apps/web/.env.example`**. |
| **Operations cross-ref** | Harness triggers, path filters, and flake policy — **`.ai/operations/deployment_environments.md`**, **`build_packaging.md`**. |

Developers **cannot** exercise watch-party media without a running SFU (+ TURN when relay scenarios are in scope).

## Decisions

| Question | Decision |
| --- | --- |
| Global Dynamo DAX? | **Not** MVP baseline. |
| Room mode / kill switch bootstrap? | **Durable room snapshot** before layout render; do not wait for first WebSocket **`room_mode`** / **`avDisabled`** event. |
| Video Chat host capture? | Entering **Video Chat** **fully stops** active tab-capture (not suspend); returning to **Theater** requires host **Share Source Tab** again. |
| Participant toggle gating? | Camera/mic toggles activate only when **`wsStatus === 'open'`**, fan JWT present, and room snapshot **`avDisabled === false`**. |
| **`getUserMedia`** profile? | **`{ video: { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 24, max: 30 } }, audio: { echoCancellation: true, noiseSuppression: true } }`**. If video permission denied but audio granted, allow **mic-only** publish (no camera producer). |
| Anonymous guest consumer attach? | **Eager** after room snapshot + room WebSocket open when **`avDisabled === false`** — same cadence as guest host-screen consumer bootstrap. |
| Token refresh while publishing? | Refetch fan access token on **401** from HTTP APIs; **`SfuMediaSession`** reconnect loop picks up refreshed token on next iteration without preemptively tearing down active producers unless the token is invalid or revoked. |
| Roster GSI race on participant token? | Reuse **`SfuMediaSession`** backoff — suppress user-visible token error for roster **403** on attempts **1–3** (same as host/guest race handling). |
| Mesh vs SFU local? | **SFU only.** Mesh removed. Local + CI use disposable SFU + TURN profile (above). |
| Drawer reconnect? | **Independent** — bootstrap/reconnect loops are per module; see **`execution_model.md`**. |

## Decisions (local media bootstrap — #136)

| Question | Decision |
| --- | --- |
| Disposable stack packaging? | **`infra/local-media/compose.yml`** + root **`npm run media:local`**. |
| Local SFU join secret? | **`SFU_JWT_SECRET`** in **`infra/local-media/.env`** must match prod join HMAC when using prod **`webrtc-sfu-token`**; operator copies from **`riffsync/sfu-join-hmac-secret`** (never commit). |
| Workstation startup order? | **`npm run media:local`** → **`curl /healthz`** → **`cd apps/web && npm run dev`** with **`.env.local`** wired per **`configuration.md`**. |

## Decisions (visible SFU config error — #137)

| Question | Decision |
| --- | --- |
| SFU down during room join? | **`SfuMediaSession`** enters **`degraded`** / failed config state with persistent visible error; **no** mesh fallback. |
| Chat bootstrap when SFU unreachable? | **`ChatSession`** may reach **`connected`** independently; compose/send follows chat drawer policy. |
| Local dev misconfiguration signal? | When **`VITE_PUBLIC_SFU_WS_URL`** targets local disposable host and SFU is not listening, show **`LOCAL_SFU_UNREACHABLE`** copy (see **`configuration.md`**) — not generic infinite "Connecting…" with cleared banners. |

## Open implementation decisions

- **`webrtc-sfu-token`** branches for participant producer grant and **`avDisabled`** check at mint time (**#102** / **`integration/api_contracts.md`**).
- Rate limits on participant producer token mint per **`sub`** (**#102** / **`operations/security.md`**).
- **Harness credential bootstrap:** test fan JWT mint strategy without prod Cognito secrets in CI — **`.ai/operations/build_packaging.md`** (harness milestone).
- **Per-module reconnect backoff constants:** shared vs per-drawer config surface.

## Primary code pointers (optional)

- `main.tsx` / env injection when SPA exists.
