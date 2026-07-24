# Authorization

Who may do what, and how identity is represented. Aligns with **`docs/architecture.server.md`**, **`docs/architecture.frontend.md`**, **`architecture.admin.md`**.

## Identity modes

| Mode | Representation | Typical use |
| --- | --- | --- |
| **Anonymous guest** | Opaque **`sessionId`** (UUID) + **display name** in **`localStorage`** once the user crosses **lobby** or **joins `/room/:id`** (**lazy mint**); **`X-Session-Id`** + WS **`$connect`**. | **Browse**, **join**, **watch**, **view room chat** (text, GIFs, reactions, avatars)—**cannot** **send** chat, **react**, upload avatars, create rooms, **publish** WebRTC (host screen share **or** participant camera/mic), or use **friends / DM** manage or send. May **subscribe** to participant A/V when the room **`avDisabled`** kill switch is off. |
| **Signed-in fan** | **Cognito JWT** (**`sub`**, claims); **`fanSub`** stored on WS connection row when JWT verified at **`$connect`**. | **Send** chat/GIF/react; **publish participant camera/mic** over SFU when **`avDisabled`** is false; **consume** host screen share and participant A/V; **friends lifecycle** (invite / accept / decline / list / remove) and **1:1 DM** (open history, send, clear unread) under fan JWT only. Non-host fans **cannot** mutate **`roomMode`**, **`avDisabled`**, or authoritative playback. |
| **Signed-in fan (host)** | Same fan JWT; **`JWT.sub === room.hostSub`**. | **Create room**, **room admin**, **PATCH** authoritative playback + **`roomMode`** + **`avDisabled`**, **host screen-share SFU producer**, **participant camera/mic** (same publish tier as other signed-in fans), host-only WS control actions (**`share_state`**, room mode, AV kill switch). **`hostSub`** on room **=** **`sub`**. Host status does **not** grant extra friends/DM authority over another fan’s social graph. |
| **Staff / operator** | **Invite-only** Cognito **staff user pool** (distinct from the fan pool) + **staff JWT authorizer** on **`/v1/admin/*`**. Tokens live in a **separate browser namespace** from fan auth; fan and staff sessions may **coexist** in one browser. | Catalog edits, curated lists, roster/API tools—not fan Facebook login. **No** staff authority to read DM bodies, list another fan’s DMs, or mutate friendships unless the same browser also holds a **separate fan** session acting as that fan. |

## Staff pool (operator)

| Property | Contract |
| --- | --- |
| **Pool boundary** | **Dedicated staff user pool** and **public SPA app client** (no client secret). **Do not** reuse fan pool tokens or app client for **`/v1/admin/*`**. |
| **Provisioning** | **`selfSignUpEnabled: false`** — operators are **invite-only** (console **`AdminCreateUser`**, CLI, or IaC). MVP accepts **manual Cognito console** invites plus **`admin`** / **`curator`** group assignment. |
| **IdP** | **COGNITO only** on the staff pool (no Facebook / Meta IdP). |
| **Roles (MVP)** | **`cognito:groups`** on staff JWTs — predefined groups **`admin`** and **`curator`**. **Custom JWT role claims** are **out of scope**. |
| **SPA sign-in** | **Cognito Hosted UI + PKCE** (mirror fan pattern). OAuth redirect **`/admin/auth/callback`** on the **same SPA origins** as fan auth; logout URLs aligned with **`/admin/*`**. Staff tokens stored under **`riffsync.staff*`** keys; fan **`/auth/callback`** and **`riffsync.fan*`** keys unchanged. |
| **Discoverability** | **`/admin/login`** is **unlisted** (bookmark/direct URL only; no links from fan catalog or room chrome). |
| **MFA** | **Optional** at pool level for MVP (recommended where practical; not a hard gate). |
| **Transactional email** | Staff pool verification/invite email reuses the **same SES From** and configuration set as fan auth (**`noreply@riffsync.tv`**, shared **`riffsync-ses-send-prod`** pattern). |

## Dual JWT authorizers (same HTTP API)

| Authorizer | Issuer / audience | Routes |
| --- | --- | --- |
| **Fan JWT** | Fan pool id + fan SPA client id | **`POST /v1/rooms`**, room-admin **`PATCH`/`PUT`**, **`/v1/fans/*`**, **`/v1/friends/*`**, **`GET /v1/giphy/search`**, **DM** routes (fan authorizer family), publisher WebSocket paths requiring **`sub === hostSub`**. |
| **Staff JWT** | Staff pool id + staff SPA client id | **`/v1/admin/*`** only. **Does not** bind to friends/DM body or friendship mutation routes. |

- **Cross-pool rejection:** API Gateway validates **issuer** and **jwt audience** per route binding. A fan token on **`/v1/admin/*`** or a staff token on fan-gated routes **fails at the authorizer** (typically **401**) without Lambda involvement.
- **Group enforcement:** The staff authorizer proves **pool + client** only. Lambdas (or route-specific authorizer logic) **must** read **`cognito:groups`** from authorizer context and return **403** when the JWT is valid but **required group membership** is missing (auth slice: **`admin`** or **`curator`** suffices on probe routes; finer **`admin` vs `curator`** splits land with catalog handlers).

## Enforcement points

| Layer | Behavior |
| --- | --- |
| **HTTP** | **Staff JWT authorizer** on **`/v1/admin/*`**; **fan JWT authorizer** on fan-gated routes (including friends lifecycle and DM); **`POST /v1/rooms`** and room-admin **`PATCH`/`PUT`** require **fan JWT** (**`sub`**); **`GET /v1/catalog`**, **`GET /v1/lobby`**, room **read/join** paths accept **`sessionId`** via **`X-Session-Id`** for anonymous guests. Friends/DM Lambdas additionally enforce participant membership and friendship state (below). |
| **WebSocket** | **`$connect`**: **`roomId`** + **`sessionId`**; optional fan JWT (**query `accessToken`** or **`Authorization`**) stores **`fanSub`**. **Host-only inbound route:** **`share_state`** (connection row **`hostSub === room.hostSub`**). **Durable **`roomMode`** / **`avDisabled`** use HTTP host **`PATCH`** only (#103 fans out outbound **`room_mode`** / **`av_disabled`**). Map **`connectionId → roomId`** (+ optional **`fanSub`** / **`sessionId`** metadata). **Fan DM push plane (#360):** separate WebSocket API; **`$connect`** requires fan JWT and writes **`FanConnections`** **`connectionId → fanSub`** only — **no** **`roomId`**, **no** room chat inbound routes. |
| **SFU join token** | **`POST /v1/webrtc/sfu-token`**: **`X-Session-Id`** + active presence row required; **`Authorization`** fan JWT required for **producer** grants. Host screen-share producer: **`JWT.sub === room.hostSub`**. Participant A/V producer: **`fanSub`** on connection row, room **`avDisabled`** false, caller not anonymous. **403** when kill switch on or prerequisites missing. |

## WebRTC publish tiers

| Tier | Who | SFU producer class | Notes |
| --- | --- | --- | --- |
| **Host screen share** | **`JWT.sub === room.hostSub`** only | **`host_screen`** (video + audio from tab capture) | Distinct from participant **`getUserMedia`**; host may hold **both** host screen and participant A/V producers concurrently. |
| **Participant A/V** | Signed-in fan with **`fanSub`** on WS connection | **`participant_av`** (camera and/or mic) | **Not** anonymous guests; denied when **`avDisabled`** is true (server-enforced: no new tokens, active producers torn down). |
| **Consumer** | Any connected participant (guest or fan) | N/A — SFU **consumer** role | Subscribes to host screen and/or participant producers per **`roomMode`** and kill-switch rules (**`api_contracts.md`**). |

## Rules (domain)

- **Room-admin authority:** only **`JWT.sub === room.hostSub`** may mutate authoritative playback metadata, **`roomMode`**, **`avDisabled`**, host tab-capture lifecycle, and host-only WebSocket control actions.
- **Participant publish:** signed-in non-host fans and the host (when using participant toggles) may publish **participant A/V** only; never room-admin playback or layout fields.
- **AV kill switch (server-enforced):** when **`avDisabled`** is true, deny new participant producer SFU tokens, tear down active participant producers on the SFU, and broadcast authoritative disabled state; room reverts to movie + text chat (no participant A/V publish or consumption).
- **Viewer-local Cast:** starting, stopping, or failing a Cast session does not grant room-admin authority, does not require host status, and does not change fan/guest chat or SFU permissions. Any connected participant may use local Cast when their browser/device supports it, subject to the same room access they already have.
- **Moderation:** target **`sessionId`** / **`connectionId`** for anonymous guests; **`sub`** for signed-in hosts (**`docs/architecture.admin.md`**). Staff moderation of **DM bodies** is **out of scope** for this product slice.
- **Principle:** never require an IdP to **browse catalog**, **join**, **watch**, or **read** room chat; **do** require **fan JWT** to **send** chat (text/emoji/GIF), **react**, **upload avatar**, **publish participant A/V**, **host**, or use **friends / DM** manage and send.

## Friends and DM authorization

| Concern | Contract |
| --- | --- |
| **Identity** | Friendship and DM principals are fan Cognito **`sub`** only. Guests (**`sessionId`**) cannot invite, accept, decline, list-manage, remove, open DM history, send DMs, or clear unread. |
| **Authorizer** | Friends lifecycle and DM routes use the **fan JWT authorizer** on the shared HTTP API (no new IdP; no staff authorizer binding). |
| **Invite / accept / decline** | Caller must be a signed-in fan. Only the **recipient** of a pending request may **accept** or **decline** it. Durable friendship exists **only after accept**. |
| **DM eligibility** | Open history, send, and unread clear require an **active friendship** between caller **`sub`** and peer **`sub`**. Stranger DMs are denied. |
| **Remove-friend** | Remove is **immediately mutual**: both parties lose the friendship edge at once. |
| **Post-remove DM access** | After mutual remove, **both** parties lose **compose (send)** and **history** access for that 1:1 thread (closed / hidden for both). DM list, history, and send handlers **must** re-check active friendship (or explicit closed-thread state) and deny when the edge is gone. Re-friending may create a new edge; whether prior history is restored is a later product decision (default: remains inaccessible). |
| **Staff** | Staff JWT **never** grants DM body read, DM send, or friendship mutation. No admin DM moderation path in this slice. |
| **Room membership** | Being in the same room (or holding host) does **not** by itself authorize friendship or DM actions. Room **People** roster ≠ friends graph. |
| **Realtime DM** | Fan DM push plane authenticates **`fanSub`** at **`$connect`**. Send is fan JWT HTTP **`POST`**. Push fans out only to the **recipient** participant's **`FanConnections`** rows — never room-wide **`roomId`** broadcast of DM bodies. |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Same Cognito pool for fans and staff? | **No** — **separate staff user pool** and staff SPA client; independent token stores in the browser. |
| Fan + staff session in one browser? | **Allow coexistence** — staff sign-out clears **staff** tokens only; fan hosting and guest **`sessionId`** continue unaffected. |
| Who enforces **`cognito:groups`**? | **Lambdas** (and future route guards) after API Gateway staff JWT validation; authorizer does **not** filter by group. |
| JWT on WebSocket? | **Required** for **host control** routes and **fan send** paths; **`fanSub`** from verified JWT at **`$connect`** gates chat/react and participant publish eligibility. Anonymous **`sessionId`**-only connect remains valid for subscribe-only participation. |
| Admin role claims MVP? | **`cognito:groups`** on **staff** pool tokens (e.g. **`admin`**, **`curator`**); Lambdas read group membership from the authorizer context. **Custom JWT claims** for roles are **out of scope** until IAM/Cognito needs them. |
| Who may publish participant camera/mic? | **Signed-in fans only** (**fanSub** on connection); anonymous guests **subscribe-only** for participant A/V. |
| AV kill switch enforcement? | **Server-enforced** — deny SFU participant producer tokens, tear down active participant producers, broadcast **`avDisabled`**; not client-cooperative-only. |
| Host participant A/V while screen sharing? | **Allowed** — host may publish **participant A/V** alongside **host screen** (two video sources on the same SFU router). |
| Chromecast authority? | **No new authority tier.** Cast is local to the sender/receiver and does not mutate room state or authorize room-wide actions. |
| Friends / DM identity? | **Fan Cognito JWT `sub` only** — guests out; staff pool does not grant DM body or friendship authority. |
| Friendship create authz? | **Invite / accept / decline** under fan JWT; durable edge only after accept. |
| DM send / history authz? | Requires **active friendship** between the two fan **`sub`s**. |
| Remove-friend authz effect? | **Mutual** edge teardown; **both** lose DM send and history access — enforced on DM routes. |
| Staff DM moderation? | **Out of scope** — no staff DM body read path. |

## Decisions (answered — friendship invite/accept lifecycle #356)

| Question | Decision |
| --- | --- |
| **Invite / accept / decline / cancel authz?** | **Fan JWT `sub` only**. Recipient-only accept/decline; requester-only cancel. Guests **401**; staff token on route **401** at authorizer. |
| **Pending vs friendship for DM?** | Pending request grants **no** DM or accepted-friends list authority. |

## Friendship lifecycle HTTP deny codes (#356)

When status is **400**, **403**, **404**, or **409**, body includes stable **`code`** (optional **`message`**):

| **`code`** | HTTP | Meaning |
| --- | --- | --- |
| **`cannot_friend_self`** | **400** | **`recipientSub`** equals caller **`sub`**. |
| **`fan_auth_required`** | **401** | Missing or invalid fan JWT (authorizer or handler). |
| **`friend_request_not_recipient`** | **403** | Accept/decline by non-recipient. |
| **`friend_request_not_requester`** | **403** | Cancel by non-requester. |
| **`friend_request_not_found`** | **404** | Unknown **`requestId`** or no longer pending. |
| **`already_friends`** | **409** | Active **Friendship** **`pairKey`** exists. |
| **`friend_request_pending`** | **409** | Same-direction pending already exists (non-idempotent clients; prefer idempotent **200**). |
| **`friend_request_inbound_exists`** | **409** | Opposite-direction pending exists; accept/decline inbound instead. |
| **`rate_limited`** | **429** | Per-**`fanSub`** throttle exceeded. |

## Decisions (answered — post-remove DM access enforcement #362)

| Check | Contract |
| --- | --- |
| **Shared helper** | **`assertDmThreadAccess`** (name illustrative) in **`infra/cdk/lambda/`** — membership in path **`pairKey`**, **Friendships** **GetItem**, **DmThreads** **GetItem** **`status`**. Used by ensure, history, send, and mark-read Lambdas. |
| **Pre-write re-check** | Send and mark-read call helper **immediately before** **PutItem** / cursor update so concurrent **#358** remove wins (**403**). |
| **Post-remove deny** | **Both** parties lose ensure (until re-friend reopen), history, send, and read. **`friendship_not_active`** when edge missing; **`dm_thread_closed`** when row **`closed`**. |
| **Physical retention** | **DirectMessage** bodies **not** deleted on unfriend; access closed in handlers only (**soft-hide** product rule). |
| **Re-friend reopen** | Active **Friendship** + **`closed`** thread → **`PUT` ensure** sets **`open`**, **`reopenedAt`**, keeps **`closedAt`** cutoff; history excludes **`sentAt <= closedAt`**. |
| **Staff / guests** | Unchanged — **401** at authorizer for non-fan tokens. |

## Decisions (answered — DM thread open and history #359)

| Check | Contract |
| --- | --- |
| **Thread ensure** | Active **Friendship** required; deny **`cannot_dm_self`**, **`friendship_not_active`**, **`dm_thread_closed`**. |
| **History read** | Caller must be **`pairKey`** member; active friendship + open thread (or **`404 dm_thread_not_found`** when no thread row yet). |
| **Post-remove** | **`friendship_not_active`** and/or **`dm_thread_closed`** even though **DirectMessage** rows remain in storage. |

## SFU join token claims (`SfuJoinClaims`)

| Field | When present | Contract |
| --- | --- | --- |
| **`env`** | Always | API environment slug (today **`prod`**). |
| **`roomId`** | Always | Target watch room. |
| **`sessionId`** | Always | Browser tab presence id (**`X-Session-Id`**). |
| **`role`** | Always | **`producer`** or **`consumer`**. |
| **`producerClasses`** | **`role === producer`** | Non-empty array of allowed classes: **`host_screen`**, **`participant_av`**, or both. Authoritative grant shape. |
| **`producerClass`** | Legacy rollout only | Single class; verify as **`[producerClass]`**. Prefer **`producerClasses`** on new mints. |
| **`fanSub`** | When **`participant_av`** is in **`producerClasses`** | Cognito **`sub`** for audit and rate limits. |
| **`iat`**, **`exp`** | Always | HMAC JWT lifetime (**900s** today). |

- **One producer token per session** authorizes **multiple** mediasoup **`produce`** calls on the same SFU WebSocket (separate **`audio`** and **`video`** producers per class). No per-kind re-mint.
- **Host concurrent producers:** **one SFU WebSocket per browser tab** may carry **`host_screen`** and **`participant_av`** producers together when both appear in **`producerClasses`**.
- **Host mint:** **`POST /v1/webrtc/sfu-token`** signs **`producerClasses: ['host_screen', 'participant_av']`** for the room host when **`avDisabled`** is false; **`['host_screen']`** only when the kill switch is on.
- **Non-host fan mint:** signs **`producerClasses: ['participant_av']`** when eligible.

## `POST /v1/webrtc/sfu-token` denial codes

When status is **403** (or **429** for throttle), body includes stable **`code`** for client copy:

| **`code`** | Meaning |
| --- | --- |
| **`av_disabled`** | Room **`avDisabled`** is true (participant producer only). |
| **`fan_auth_required`** | Participant producer requested without verified fan JWT / **`fanSub`** on presence row. |
| **`not_host`** | **`host_screen`** producer requested but **`JWT.sub !== room.hostSub`**. |
| **`unknown_session`** | No active presence row for **`X-Session-Id`**. |
| **`publisher_cap_exceeded`** | Per-room participant publisher estimate at cap. |
| **`rate_limited`** | Per-**`fanSub`** mint throttle exceeded. |

## Participant producer mint rate limit

- **30** participant producer token mints per **`fanSub`** per rolling minute (Lambda guard + API Gateway route throttle).
- Emit aggregate metric **`RiffSync/Media/sfu_token_denied`** with **`reason`** dimension; **no** **`fanSub`** in logs at INFO.

## Primary code pointers (optional)

- API Gateway authorizer ARNs; Cognito pool IDs in parameterized config.
