# Security

Defense-in-depth for a **public + anonymous** surface plus **operator** tools.

## Threat posture

| Area | Mitigation |
| --- | --- |
| **Injection / abuse** | Input validation on chat and display names; **rate limits** (API GW / WAF) per environment. |
| **AuthZ** | **Least privilege** IAM per Lambda; **fan** routes accept **fan pool** JWT only; **`/v1/admin/*`** accepts **staff pool** JWT only (**second HTTP JWT authorizer** on staff issuer + staff app-client audience — cross-pool tokens fail at API Gateway). **`cognito-idp:ListUsers`** / **`AdminGetUser`** on admin Lambdas: **Resource** = **fan pool ARN** only (roster reads). Staff-pool **`cognito-idp:*`** (future invite automation): **staff pool ARN** only — never **`cognito-idp:*`** on both pools. |
| **Secrets** | **Secrets Manager** / SSM secure params; **never** in git, env files committed, or browser. |
| **Transport** | **TLS** everywhere (API Gateway defaults). |

## Staff auth and admin Lambda IAM

| Topic | Contract |
| --- | --- |
| **Staff JWT authorizer** | Second **`HttpJwtAuthorizer`** on **`RiffSyncApi-prod`**: issuer **`https://cognito-idp.<region>.amazonaws.com/<staffPoolId>`**, audience **staff SPA app client id**. Bound only on **`/v1/admin/*`**. Fan authorizer unchanged. Trust boundary: **[`authorization.md`](../integration/authorization.md)**. |
| **Admin Lambda roles** | **Separate** execution role per admin handler; fan-route Lambdas do **not** assume admin roles. Handlers read **`cognito:groups`** from authorizer context (**`admin`**, **`curator`**). |
| **Fan roster IAM** | **`cognito-idp:ListUsers`**, **`cognito-idp:AdminGetUser`**: **Resource** = **fan user pool ARN** only (future roster UI). |
| **Staff pool IAM** | Future staff provisioning APIs: **`cognito-idp:*`** scoped to **staff user pool ARN** only — not account-wide. |
| **DynamoDB** | Table-scoped grants when catalog/list handlers ship; auth MVP probe needs authorizer context only. |
| **Staff pool email** | **`UserPoolEmail.withSES`**: reuse verified domain **`riffsync.tv`**, **`From`** **`RiffSync <noreply@riffsync.tv>`**, configuration set **`riffsync-ses-send-prod`** (same outbound reputation pipeline as fan pool). |
| **Operator invites (MVP)** | Manual Cognito console **`AdminCreateUser`** + group assignment; **`selfSignUpEnabled: false`**. |
| **MFA** | Staff pool MFA **`OPTIONAL`** at launch (recommended, not mandatory). |
| **Deploy ordering** | **`RiffSyncStaffAuth-prod`** before **`RiffSyncApi-prod`**; SPA rebuild after staff outputs exist — **[`deployment_environments.md`](deployment_environments.md)**. |

## Data

| Data class | Handling |
| --- | --- |
| **PII (optional Cognito)** | Minimize retention in logs; **mask** in admin roster UI by default per **`architecture.admin.md`**. |
| **RoomChat (public room)** | **Bounded TTL** retention in Dynamo (**RoomChat**). Message bodies, reactions, and GIF posts persist only for the room retention window and may appear in capped requester-only **`chat_history`** on **`presence_request`**. Room chat is public to room members for that window, not a private inbox. Do **not** log raw room-chat text, GIF rendition URLs, or reaction payloads at **INFO**. Abuse handling is **validation**, **rate limits**, and **disconnect** (not staff body review). Retention mechanics: **[`persistence_abstractions.md`](../data/persistence_abstractions.md)**; wire: **[`messaging_async.md`](../integration/messaging_async.md)**. |
| **Direct messages (private 1:1)** | **Account-lifetime** durable private content until explicit delete or account closure. Stricter privacy than **RoomChat** even when room chat is TTL-bounded: DM bodies are private between the two fan principals, not room-visible. Do **not** log raw DM text, GIF URLs, or equivalent body payloads at **INFO**. **No** staff Cognito / **`/v1/admin/*`** path to read DM bodies in this initiative. Abuse stays deny / throttle / validation, not operator content review. |
| **Friendship graph** | Durable friendship edges and pending invite/accept requests keyed by fan Cognito **`sub`**. Invite/accept is an abuse surface (enumeration / spam / harassment): first-class **per-identity / per-route** throttle class alongside DM send and remove-friend. Remove-friend is **immediately mutual**; both parties lose compose and history access to the existing 1:1 thread (closed/hidden for both). Ops honors that hide/delete posture without staff reading bodies. Soft-delete vs hard-delete mechanics are data/TW; privacy obligation is that neither party retains a product-visible history path after mutual unfriend. |
| **Friends online** | Online on a friend row means the friend is currently present in **any** RiffSync room, derived from **RoomPresence**-class signals. **Not** platform-wide browsing presence and **not** a new durable last-seen PII class. Do not introduce last-seen timestamps or log identity-rich presence dumps for this signal. |
| **Fan avatars** | **S3** objects with **public HTTPS** URLs; validate upload size/MIME server-side; **no** chat or GIF bytes in Dynamo. |
| **Giphy** | API key in **Secrets Manager** only; proxy search is JWT-gated and rate limited. **Operator runbook:** [`docs/operations/giphy.md`](../../docs/operations/giphy.md). |

## Friends and direct messaging (privacy and abuse)

| Topic | Contract |
| --- | --- |
| **AuthZ class** | Friends manage, friend-request, accept/decline, remove-friend, DM history, DM send, and unread clear require **fan pool JWT** only. Staff JWT does **not** grant friendship/DM authority or DM body read. |
| **Retention classes (normative)** | **RoomChat** = bounded TTL room retention + do not log bodies. **DM** = account-lifetime private retention + do not log bodies + no staff DM read path. Typing, join/leave **`chat_system`**, and similar control-plane lines remain ephemeral fan-out and are **not** RoomChat/DM body classes. |
| **Private vs room** | UI may reuse room-chat interaction language; ops must **not** treat DM bodies as room-broadcast content. Private threads stay participant-scoped. |
| **Moderation (this initiative)** | **No** staff moderation of DM bodies. No admin tooling that dumps DM history for operators. |
| **Abuse controls** | Friend-request send (**10**/min), accept/decline/cancel (**30**/min combined), remove-friend, DM send, unread mark-read, and friends-online query/push inherit the existing **API Gateway / WAF / Lambda** per-identity / per-route throttle mindset. DM and remove bands refined in peer issues. |
| **Account closure** | DM history and friendship state follow normal account lifecycle deletion/closure obligations once those flows exist; no separate archive/export staff plane in this initiative. |

## Service expectations (OSS / cost)

| Topic | Contract |
| --- | --- |
| **Availability** | **No formal SLA** for the open-source project; self-hosters tune **CloudWatch** alarms and **budgets** per **`.ai/operations/observability.md`**. |
| **Logs** | Avoid logging **raw RoomChat text** or **raw DM bodies** (including GIF URLs and reaction payloads) at **INFO** in production. Prefer **aggregate metrics** + sampled **DEBUG** if needed (cardinality / cost). Denial logs use **`code`** / **`reason`** only, not **`fanSub`**, peer ids, or thread ids. |

## Participant AV (WebRTC media)

| Topic | Contract |
| --- | --- |
| **Join secret** | SFU join HMAC secret class (**`riffsync/sfu-join-hmac-secret`**) unchanged; extending publish eligibility to signed-in fans is an **integration** token-claims change, not a new secret surface. |
| **Publish eligibility** | Only **signed-in fans** receive SFU **`producer`** grants for participant camera/mic; anonymous guests remain **`consumer`**. Preconditions (**open room WebSocket**, active presence row) unchanged. |
| **TURN credentials** | **`GET /v1/webrtc/ice`** REST credentials via **`riffsync/turn-static-auth-secret`**; more publishers increase relay load on the shared TURN instance. |
| **Transport** | TLS on API Gateway; **`wss://`** SFU signaling via Caddy when **`PROD_SFU_SIGNALING_HOSTNAME`** is set. |

## CSP and third-party framing (SPA)

| Topic | Contract |
| --- | --- |
| **Custom playback iframes** | Solo watch, party-capture, and in-room host presentation may embed **arbitrary HTTPS origins** staff curate (**no domain allowlist** at catalog validation). CSP **`frame-src`** (or equivalent) must permit framing those HTTPS Custom origins — prefer an explicit contract note over ad-hoc wildcard edits in deploy scripts. |
| **YouTube iframes** | Existing YouTube embed allowances unchanged for YouTube-host episodes. |
| **Cast receiver CSP** | Unchanged for MVP Custom iframe scope — receiver uses **`host_screen` SFU**, not Custom iframe on TV. |
| **Logging** | Do not log full **Custom playback URLs** at INFO if they carry signed/query tokens; aggregate errors only. |

## Viewer-local Cast

| Topic | Contract |
| --- | --- |
| **Receiver app id** | Public Google Cast receiver application id is not a secret. Treat it like other SPA public config, not like an API token. |
| **Custom receiver route** | **`/cast/receiver`** is a public TLS route. It must not expose room API credentials, fan/staff JWTs, raw SFU join tokens, receiver device identifiers, or privileged room state. |
| **Receiver authority** | The receiver is sender-controlled and may only request a cast-scoped, read-only SFU consumer token for `host_screen` playback. It must not call RiffSync room mutation APIs, open room WebSockets, create presence rows, publish chat, publish media, subscribe to participant A/V control surfaces, mutate room state, or infer host authority. |
| **CSP and framing** | CSP/script/frame policy must allow only the Google Cast and playback resources required by the sender and receiver presentation. Changes for Cast should be explicit and reviewed rather than broad wildcard allowances. |
| **Privacy** | App-authored logs, status copy, and support output must not include receiver device names, identifiers, or room participant identifiers. Browser-owned Cast UI may display device names outside RiffSync control. |

## Compliance cues

| Topic | Contract |
| --- | --- |
| **Third-party ToS** | YouTube embed + TMDB attribution + **Giphy** usage + Meta login rules documented for operators (**Giphy:** [`docs/operations/giphy.md`](../../docs/operations/giphy.md)). |
| **Google Cast** | Sender and receiver behavior follows Google Cast SDK requirements for registered custom receivers, namespace naming, sender origins, and receiver URL reachability. Native media-only Cast is not used as the current custom receiver maturity substitute. |

## SFU token mint abuse controls

| Control | Contract |
| --- | --- |
| **Per-`fanSub` throttle** | Max **30** participant producer mints per rolling minute at **`webrtc-sfu-token`** Lambda (in-memory counter per execution environment + API Gateway route throttle). |
| **Per-room cap** | Lambda rejects mint when estimated **`participant_av`** publishers would exceed **`SFU_MAX_PRODUCERS_PER_ROOM`**; SFU enforces hard cap at **`produce`**. |
| **Logging** | Denials log **`code`** / **`reason`** only at INFO — **no** **`fanSub`** or JWT material. |
| **Metrics** | **`RiffSync/Media/sfu_token_denied`** with **`reason`** dimension. |

## Open implementation decisions

### catalog-playback-host
- Exact **CSP directive** edits in CloudFront response headers or meta tag strategy (**`operations/security.md`**, build packaging).
- Whether generic iframe uses **`sandbox`** attribute and which tokens (**`allow-scripts`**, **`allow-same-origin`**, **`allow-popups`**) for partner players.
- **`Referrer-Policy`** for Custom iframe navigations.
- **Admin validation** max URL length and Unicode normalization for **`customPlaybackUrl`**.

### friends-and-direct-messaging
- Exact **rate-limit bands** for DM send, unread mark-read, and friends-online query or push — **M35**, **#357** (remove-friend **30**/min decided #358).
- WAF / API Gateway throttle key placement vs Lambda in-memory counters for DM HTTP (and any WS) routes.
- Account-closure cascade timing for durable DM rows (batch purge schedule, Dynamo TTL on tombstones, or synchronous delete) once account deletion flows are wired.
- Whether any sampled DEBUG redaction helpers are shared between RoomChat and DM log paths (implementation detail; INFO remains body-free).

## Primary code pointers (optional)

- WAF ACLs on HTTP API when enabled.
