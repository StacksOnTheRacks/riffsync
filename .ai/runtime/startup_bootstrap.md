# Startup & bootstrap

## Lambda

- **Cold start:** initialize **AWS SDK clients** once per execution environment; optionally load **Secrets Manager** ARNs lazily per first reconcile invocation.
- **TMDB `/configuration`** cache: in-memory TTL (e.g. 24h) inside reconcile Lambda to avoid hammering TMDB (**`docs/contracts.tmdb.md`**).

## SPA (browser)

### Fan and guest room path (`/room/:id`)

- **Bootstrap order (contract):** (1) **`ensureGuestSession`** / read fan token from **localStorage**, (2) **room snapshot** (**`fetchRoom`** or join payload) including durable **`roomMode`** and **`avDisabled`**, (3) open **room WebSocket** with **`sessionId`** + optional fan JWT, (4) warm ICE via **`fetchRtcIceServers`**, (5) **only then** SFU token + connect for media paths that need RTP. Layout and participant AV surfaces must not render authoritative mode or kill-switch state before the room snapshot is applied.
- **Room snapshot fields:** **`roomMode`** (**Theater** default, **Video Chat** alternate) and **`avDisabled`** are **durable** on the room document; cold load and late join inherit them before WebSocket events arrive.
- **Publish gate:** Participant camera/microphone publish requires signed-in fan JWT, open room WebSocket, active presence row, and **`avDisabled === false`**. Server refuses participant producer SFU tokens when kill switch is on.
- **Media API separation:** Host lawful movie path uses **`getDisplayMedia`** (tab capture). Participant AV uses **`getUserMedia`**. Never substitute one for the other.
- **Reconnect:** After refresh or disconnect, participant camera and microphone default **off**; fan must re-enable manually (privacy-first).
- **Anonymous guests:** Subscribe-only for participant AV; no **`getUserMedia`** publish bootstrap. SFU consumer attach timing (eager on room entry vs lazy) is an open implementation decision below.
- **General:** read **`sessionId`** / display name from **localStorage**; configure API Gateway **WebSocket URL** + HTTP **API base URL** from build-time env (**`architecture.frontend.md`**). **Production** SPA canonical page origin is **`https://riffsync.tv`** (**`.ai/runtime/configuration.md`**, **`.ai/project.json`** **`public_domain`**).
- **Fan auth:** Hosted UI + PKCE on **`/auth/callback`**; fan tokens in the fan **localStorage** namespace; fan refresh and API attachment independent of staff.

### Staff admin paths (`/admin/*`)

- **Scope:** Routes under **`/admin/*`** (including **`/admin/login`**, **`/admin/auth/callback`**, protected admin shell) run a **separate bootstrap** from fan/guest bootstrap. Fan **`sessionId`**, fan JWT refresh, and room flows must **not** clear or overwrite staff tokens.
- **Order:** On navigation to a protected **`/admin/*`** route, (1) read **staff** token storage (distinct keys from fan), (2) refresh staff access token via staff Hosted UI token endpoint if stale, (3) if absent, redirect to staff Hosted UI PKCE (unlisted entry; bookmark/direct URL only).
- **OAuth isolation:** Staff PKCE uses **`/admin/auth/callback`** and staff-namespaced **sessionStorage** PKCE state so fan **`/auth/callback`** and fan PKCE keys never collide.
- **Coexistence:** Fan and staff sessions may **both** be present in one browser; staff sign-out clears staff storage only and returns to **`/admin/login`** without tearing down fan session or **`sessionId`**.
- **API calls:** **`/v1/admin/*`** requests attach **staff** Bearer tokens only; fan tokens must not be sent on admin routes.

## Decisions

| Question | Decision |
| --- | --- |
| Global Dynamo DAX? | **Not** MVP baseline. |
| Room mode / kill switch bootstrap? | **Durable room snapshot** before layout render; do not wait for first WebSocket **`room_mode`** / **`avDisabled`** event. |
| Video Chat host capture? | Entering **Video Chat** **fully stops** active tab-capture (not suspend); returning to **Theater** requires host **Share Source Tab** again. |

## Open implementation decisions

- Gate participant toggles on **`wsStatus === 'open'`**, fan JWT present, and server **`avDisabled`** flag from snapshot.
- **`getUserMedia`** constraint profile (resolution, frame rate, echo cancellation) and fallback when video denied but audio allowed.
- Anonymous guest SFU consumer attach: on room entry vs lazy when layout requires participant AV.
- Token refresh while camera on: refetch interval vs on-401; overlap with **`startSfuRoomSession`** attempt counter.
- **`webrtc-sfu-token`** branches for participant producer grant; **`avDisabled`** room attribute check at mint time.
- Roster GSI retry/backoff for participant token (reuse host guest race handling in **`sfuRoomSession`**).
- Rate limits on participant producer token mint per **`sub`**.

## Primary code pointers (optional)

- `main.tsx` / env injection when SPA exists.
