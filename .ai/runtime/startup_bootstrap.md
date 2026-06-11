# Startup & bootstrap

## Lambda

- **Cold start:** initialize **AWS SDK clients** once per execution environment; optionally load **Secrets Manager** ARNs lazily per first reconcile invocation.
- **TMDB `/configuration`** cache: in-memory TTL (e.g. 24h) inside reconcile Lambda to avoid hammering TMDB (**`docs/contracts.tmdb.md`**).

## SPA (browser)

### Fan and guest room path (`/room/:id`)

- **Bootstrap order (contract):** (1) **`ensureGuestSession`** / read fan token from **localStorage**, (2) **room snapshot** (**`fetchRoom`** or join payload) including durable **`roomMode`** and **`avDisabled`**, (3) **`ChatSession`** — open **room WebSocket** with **`sessionId`** + optional fan JWT, (4) warm ICE via **`fetchRtcIceServers`**, (5) **`SfuMediaSession`** — SFU token + connect for media paths that need RTP, (6) **`TheaterPlayback`** init when layout is Theater. Layout and participant AV surfaces must not render authoritative mode or kill-switch state before the room snapshot is applied.
- **Module ownership:** Steps 3–6 map to **`ChatSession`**, ICE warm (shared helper consumed by **`SfuMediaSession`**), **`SfuMediaSession`**, and **`TheaterPlayback`** respectively — see **`execution_model.md`**. Thin **`RoomPage`** orchestrates **`join()`** only.
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
| **SPA env** | Local **`VITE_*`** points at disposable SFU **`wss://`** and local/API test HTTP base as documented in repo **`README`** / **`.env.example`** (TW: exact var names). |
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

## Open implementation decisions

- **`webrtc-sfu-token`** branches for participant producer grant and **`avDisabled`** check at mint time (**#102** / **`integration/api_contracts.md`**).
- Rate limits on participant producer token mint per **`sub`** (**#102** / **`operations/security.md`**).
- **Disposable stack packaging:** docker-compose vs npm script profile for local SFU+TURN; CI service container image pins.
- **Harness credential bootstrap:** test fan JWT mint strategy without prod Cognito secrets in CI — **`.ai/operations/build_packaging.md`**.
- **Local SFU join secret:** dev-only HMAC secret alignment between disposable SFU and local token mint stub.
- **Per-module reconnect backoff constants:** shared vs per-drawer config surface.

## Primary code pointers (optional)

- `main.tsx` / env injection when SPA exists.
