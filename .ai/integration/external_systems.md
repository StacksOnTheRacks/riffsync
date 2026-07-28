# External systems

Outbound and third-party boundaries. Legal posture: **unofficial fan app**; honor each provider’s ToS.

## YouTube (Google)

| Use | Mechanism | Contract |
| --- | --- | --- |
| **Playback (YouTube-host episodes)** | **IFrame / IFrame API** on **room admin** and solo/party-capture clients when catalog **`playbackHost` is `youtube`**; `videoId` from catalog / room snapshot. | No download/rehost by RiffSync; embed eligibility may change per video—UI handles failures. YouTube **playable / embed checks** at room create apply **only** for YouTube-host rows. |
| **Thumbnails (optional)** | **`https://img.youtube.com/vi/{id}/{hqdefault|maxresdefault|…}.jpg`** | Reconcile job **`HEAD`** fallback chain when **`youtubeVideoId` present**; persist resolved URL on catalog row (**`docs/architecture.catalog-images.md`**). No YouTube Data API required for thumbs. Custom-only rows without YouTube id skip thumb reconcile. |

## Custom playback (staff-curated HTTPS pages)

| Use | Mechanism | Contract |
| --- | --- | --- |
| **Playback (Custom-host episodes)** | **Generic HTTPS iframe** on **`/watch/:catalogEpisodeId`**, party-capture (**`?partyCapture=1`**), and in-room host presentation when catalog **`playbackHost` is `custom`**. | Staff enter **known embeddable** HTTPS movie-page URLs (**HTTPS only**, any domain, no domain allowlist at validation). RiffSync does **not** rehost or transcode. **No YouTube IFrame API sync** for Custom URLs. Iframe embed failure (X-Frame-Options): honest error UI; no product runtime fallback beyond staff policy. |
| **Guest viewing** | **Unchanged** — guests consume **WebRTC `host_screen`** from host tab-capture of the RiffSync watch/party-capture tab; they do **not** load the Custom URL directly. | Party capture tab URL stays **`{origin}/watch/{catalogEpisodeId}?partyCapture=1`**; inner player is generic iframe for Custom. **`hostSourceOpensOnYoutube`** is false for Custom rows. |
| **Cast (MVP)** | **Unchanged `host_screen` SFU path** | Custom iframe on TV receiver is **out of scope** for MVP unless a later Cast spec says otherwise. |

## WebRTC media (all playback hosts)

| Use | Mechanism | Contract |
| --- | --- | --- |
| **Guest viewing (both hosts)** | **WebRTC** **`MediaStream`** from host tab-capture and, when enabled, **participant A/V** over **self-hosted mediasoup SFU** on **`RiffSyncTurn`** — **`POST /v1/webrtc/sfu-token`** + **coturn**. | **SFU mandatory in all environments** (dev, CI, production). **Mesh WebRTC removed.** Multi-producer registry (host screen + N participant cameras/mics). Theater audio mixing is **client-side** (server-side mix **deferred**). Honor browser permission and autoplay policies. Tab-sharing workflow for watch parties is **unchanged** for Custom host. |

## Google Cast / Chromecast

| Use | Mechanism | Contract |
| --- | --- | --- |
| **Viewer-local Cast sender** | Current Google Cast Web Sender Framework. The SPA loads **`https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1`**, assigns **`window.__onGCastApiAvailable`** before the SDK script loads, configures **`cast.framework.CastContext.getInstance().setOptions({ receiverApplicationId, autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED })`**, and opens the chooser through **`CastContext.requestSession()`**. | Optional and availability-gated. Cast entry appears only in normal room view when sender support and receiver app id configuration are present. Cast failure or unavailability leaves normal inline playback/chat/room participation intact. |
| **Custom receiver application** | Registered Google Cast **Custom Web Receiver** launched by application id, hosted at a reachable HTTPS URL, currently **`/cast/receiver`** on the canonical RiffSync origin. The receiver configures custom namespace **`urn:x-cast:com.riffsync.presentation`** before **`context.start(options)`**. | The receiver reconstructs the expanded-view composition model: full-screen stage-primary video plus bottom-right chat overlay, without the sidebar tab strip. Active Theater share uses a cast-scoped, read-only SFU consumer for `host_screen` playback. Native media-only Cast, YouTube-only Cast, or receiver launch without the RiffSync chat overlay is not an acceptable substitute for this capability. |

**Boundary:** Cast state is not written to RiffSync HTTP APIs, not sent over the room WebSocket, and not represented in **`share_state`**. The sender remains the sole room participant for this Cast session and owns the room snapshot, chat log, and overlay updates it forwards to the receiver. The receiver may request only a cast-scoped, read-only SFU consumer token for `host_screen` playback using sender-provided playback metadata. It must not create presence, publish media, write chat, fan out room events, or infer host authority.

**Verification (#279):** Cast lifecycle, failure, and cleanup tests must assert the integration boundary above. The receiver must not call room mutation APIs, open room WebSockets, create presence rows, publish chat, or introduce room-wide Cast payloads. Sender lifecycle and cleanup must not emit room WebSocket messages, mutate **`share_state`**, or change durable room fields. Receiver SFU access is limited to read-only `host_screen` consume.

### Cast sender availability gate (#272)

The first Cast implementation slice adds a browser-local sender support detector for the registered RiffSync Custom Web Receiver. It reports whether the current normal room view may show **Cast to TV**; it does not start Cast, render the receiver, or send presentation data.

| Gate | Contract |
| --- | --- |
| **Runtime phase** | Run after normal room shell render/bootstrap. Detection must not block room snapshot, chat WebSocket, SFU bootstrap, normal playback, expanded view, or host controls. |
| **Required support** | Show **Cast to TV** only when the browser/session exposes the Cast Framework sender API, the public **`VITE_CAST_RECEIVER_APP_ID`** is configured, and **`CastContext.setOptions({ receiverApplicationId, autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED })`** succeeds for the custom receiver. |
| **Unsupported / unknown** | Omit the Cast entry while support is unknown or absent. Missing receiver app id, sender SDK load failure, callback timeout, absent **`ORIGIN_SCOPED`** policy, or failed **`CastContext`** configuration map to local **`CAST_UNAVAILABLE`** copy in **`error_state.md`**. |
| **Sender module ownership** | **`apps/web/src/room/cast/castSenderSupportDetector.ts`** owns sender SDK script injection and **`window.__onGCastApiAvailable`** registration before script append. **`apps/web/src/room/cast/castSenderClient.ts`** owns receiver app id reads, **`CastContext.setOptions`**, and later **`requestSession()`** wrapping. **`useCastAvailability`** exposes the post-render React state used by normal room view. |
| **No authority side effects** | Detection must not call RiffSync HTTP APIs, publish WebSocket messages, request SFU tokens, alter **`roomMode`**, alter **`share_state`**, or inspect/identify receiver devices in room state. |

### Cast start receiver boundary (#273)

The Cast-start slice uses a custom RiffSync Cast receiver page. The receiver renders a live presentation supplied by the sender, not a second room client.

| Concern | Contract |
| --- | --- |
| **Receiver application** | A RiffSync receiver route/page reconstructs the expanded-view presentation shell for Cast. It renders stage-primary video plus bottom-right chat overlay and omits the sidebar tab strip. |
| **Sender framework** | The sender uses the Cast Framework **`CastContext`** APIs above, including configured receiver application id and **`ORIGIN_SCOPED`** auto-join policy. Browser-native Cast controls or raw media Cast flows do not satisfy the custom receiver start contract. |
| **Receiver registration** | The receiver is launched by the registered app id from the Cast SDK Developer Console. The production receiver URL is reachable by Cast devices over TLS, and **`apps/web/src/pages/cast/castReceiverSession.ts`** registers **`urn:x-cast:com.riffsync.presentation`** as a JSON custom namespace before receiver context start. |
| **Receiver bootstrap fixture** | **`apps/web/src/pages/cast/castReceiverSession.test.ts`** owns a fake Cast receiver framework fixture that records call order and options. The fixture must prove **`addCustomMessageListener(RIFFSYNC_CAST_NAMESPACE, ...)`** and **`CastReceiverOptions.customNamespaces[RIFFSYNC_CAST_NAMESPACE] = MessageType.JSON`** occur before **`context.start(options)`**. It must also prove sender-proxied **`presentation_snapshot`** and **`chat_overlay_update`** messages are accepted over the custom namespace without room HTTP, room WebSocket, SFU token, presence, or chat-publish calls. |
| **Sender authority** | The sender stays joined to the room and remains the only RiffSync participant involved in the Cast session. The receiver receives sender-proxied presentation data over the Cast channel. |
| **Room access** | The receiver does not call room mutation APIs, open the room WebSocket, create a presence row, publish chat, or subscribe to participant A/V directly. The receiver may request a cast-scoped, read-only `host_screen` SFU consumer token so the TV plays the same live party video guests see. |
| **Chat overlay** | The receiver overlay is required for #273. Native media Cast without the RiffSync chat overlay is outside #273 and not an acceptable M25 substitute. |
| **Provider metadata** | Google Cast receiver registration, application id, origin allowlist, CSP, and iframe policy are configuration concerns for this custom receiver path. They must not introduce receiver room authority. |

### Cast launch sender boundary (#302)

The launch slice starts a Cast Framework sender session from normal room view without changing room authority.

| Concern | Contract |
| --- | --- |
| **Entry** | Only a user gesture on **Cast to TV** when sender availability is **`available`** invokes **`CastContext.requestSession()`**. |
| **Custom receiver path** | Launch uses the configured **`VITE_CAST_RECEIVER_APP_ID`** and **`ORIGIN_SCOPED`** policy from #301. Browser-native tab Cast, raw media Cast, and YouTube-only Cast are out of scope and must not satisfy this slice. |
| **Launch timer** | Abort unresolved **`requestSession()`** attempts after **45 seconds** from the initiating click; map to local **`CAST_START_REJECTED`**. |
| **Pending render window** | Successful **`requestSession()`** enters **`session_pending_render`** with normal in-page playback still visible until #304 receiver render confirmation or #304 render timeout. |
| **Module ownership** | **`castLaunchController.ts`** (or equivalent) owns **`requestSession()`**, launch timer, chooser cancel/reject handling, and launch-state transitions. **`castSenderClient.ts`** remains the **`CastContext`** configuration owner. |
| **No authority side effects** | Launch, cancel, reject, timeout, and session-pending states must not call room HTTP mutation APIs, publish room WebSocket messages, request SFU tokens, alter **`share_state`**, or change durable room fields. |

### Cast receiver render-confirmation boundary (#304)

The receiver render-confirmation acknowledgement is Google Cast sender/receiver channel traffic only. It is not a RiffSync HTTP request, room WebSocket route, room fan-out payload, **`share_state`** variant, durable event, SFU token claim, presence event, or room diagnostics field.

| Concern | Contract |
| --- | --- |
| **Namespace** | Use **`urn:x-cast:com.riffsync.presentation`**, the same custom namespace as sender-proxied presentation messages. |
| **Positive acknowledgement** | Receiver sends **`{ type: "receiver_rendered", schemaVersion: 1, snapshotId, stagePrimaryRendered: true, chatOverlayRendered: true }`** after both required presentation surfaces rendered. |
| **Sender validation** | Sender accepts only the latest **`snapshotId`**. Missing flags, false flags, stale ids, malformed payloads, receiver launch, page load, and **`requestSession()`** resolution do not activate Cast. |
| **Timeout** | Sender waits **30 seconds** after **`requestSession()`** resolves, then treats missing or invalid confirmation as **`CAST_START_REJECTED`** with normal playback still visible. |
| **Room boundary** | Confirmation success, timeout, invalid acknowledgement, and retry do not call RiffSync room HTTP APIs, open or publish to room WebSockets, request SFU tokens, create presence rows, mutate **`share_state`**, or change durable room fields. |

## TMDB (The Movie Database)

| Use | Mechanism | Contract |
| --- | --- | --- |
| **Metadata & art** | Server-side **v3** HTTP only; **`docs/contracts.tmdb.md`** is normative. | **No** persistence of TMDB **`title`** / **`original_title`**; catalog **`title`** is curator-owned. Persist **`tagline`**, **`overview`**, **`popularity`**, **`poster_path`/`backdrop_path`** (or resolved URLs), **`tmdbMovieId`**, **`tmdbArtworkSyncedAt`**. |
| **Credentials** | **Secrets Manager** (or env from secret); **never** browser. | Attribution and logo rules per TMDB. |

## Giphy

| Use | Mechanism | Contract |
| --- | --- | --- |
| **GIF search & post** | Server-side **Giphy API** via **`GET /v1/giphy/search`** (JWT); chat posts reference **Giphy-hosted** rendition URLs in **`chat_gif`** WebSocket payloads. | **No** Giphy API key in browser; honor **Giphy ToS** and attribution requirements. **No** user-uploaded GIF files to RiffSync storage in this slice. **Operator runbook:** [`docs/operations/giphy.md`](../../docs/operations/giphy.md). |

## Meta (Facebook) — optional

| Use | Mechanism | Contract |
| --- | --- | --- |
| **Viewer login** | **Cognito User Pool** + **Facebook IdP** → JWT to clients. | **Required** to **host**; **optional** for guests who want continuity—must **not** block catalog browse or joining rooms (**`authorization.md`**). |

## AWS (platform)

**Provisioning:** **`AWS CDK`** (TypeScript) — **`cdk deploy`** drives CloudFormation updates. **Lambdas:** **TypeScript** → Node.js bundles. **Prefer serverless** primitives below over always-on compute.

| Service | Role |
| --- | --- |
| **API Gateway v2** | HTTP + WebSocket front door. |
| **Lambda** | Sync handlers + scheduled workers. |
| **DynamoDB** | System of record: catalog, rooms, connections, optional lists/profiles/events, and (when shipped) **friendship** edges / pending requests, **1:1 DM** threads/messages, and DM unread watermarks. Friends/DM do **not** introduce an external social-graph SaaS. |
| **EventBridge / Scheduler** | Sweeper, TMDB + YouTube thumb reconcile. |
| **Secrets Manager** | TMDB, **Giphy**, optional other backend secrets. |
| **S3** | Catalog assets, **fan avatars** (public HTTPS delivery). |
| **CloudWatch** | Metrics, dashboards, logs, alarms (**`docs/architecture.server.md`** Observability). |
| **Cognito (fan pool)** | **Fan user pool** + public SPA app client: optional **fan JWT** for hosting, **`/v1/fans/*`**, Giphy proxy, and **friends / DM** manage-and-send; **self-sign-up enabled**; **COGNITO-only** IdP in current CDK (Facebook IdP remains **optional** per product—see Meta row). Hosted UI + PKCE; OAuth callback **`/auth/callback`**. Room **host** authority remains **`JWT.sub === room.hostSub`** on **fan** tokens only. Friends/DM principals are fan **`sub`** only. |
| **Cognito (staff pool)** | **Separate invite-only staff user pool** + staff SPA app client for **`/v1/admin/*`**: **`selfSignUpEnabled: false`**, **COGNITO-only** (no Facebook IdP), predefined groups **`admin`** / **`curator`**, **second HTTP JWT authorizer** (staff issuer + staff client audience) on the **same HTTP API** as fan routes. Hosted UI + PKCE; OAuth callback **`/admin/auth/callback`** on **same SPA origins** as fan. Staff verification/invite email reuses fan **SES From** (**`noreply@riffsync.tv`**) and shared configuration set. Operator onboarding MVP: **manual console invite** acceptable. Staff tokens do **not** authorize DM body access or friendship mutation. |
| **ElastiCache** | Optional read-through cache for catalog/lobby. |
| **EC2 (`RiffSyncTurn`)** | **mediasoup SFU** + **coturn** on shared VPC instances; **`POST /v1/webrtc/sfu-token`** mints HMAC join JWTs; browsers connect **`wss://`** for RTP. Multi-producer rooms replace single **`producersByKind`** slot model. **Local dev and CI** use disposable SFU + TURN containers or profiles with the same signaling contract — not mesh fallback. |

## Mesh WebRTC deprecation

| Topic | Contract |
| --- | --- |
| **Stance** | **Removed** this milestone. No API Gateway **`signaling`** WebSocket route for SDP/ICE relay; no client **`RTCPeerConnection`** mesh path for watch-party media. |
| **Rationale** | Dual mesh/SFU paths diverged behavior between dev and prod; hardening mandates one topology. |
| **Migration** | Delete mesh client branches, CDK **`signaling`** route, and env flags (**`VITE_WEBRTC_USE_MEDIASOU_SFU`**). All media conformance runs against SFU + TURN. |

## Integration conformance harness (pointer)

| Topic | Contract |
| --- | --- |
| **Scope** | **PR-blocking** when **`apps/web/**`** or **`services/riffsync-sfu/**`** change. Runs against **fully isolated** ephemeral SFU + TURN — **no prod footprint**. |
| **Integration surfaces exercised** | Room WS **`$connect`**, **`chat`**, **`POST /v1/webrtc/sfu-token`**, SFU WS produce/consume/unpublish, TURN credential fetch (**`GET /v1/webrtc/ice`** or equivalent), reconnect of each drawer independently. |
| **Pass/fail signals** | Per-drawer: chat delivery, **`producerClosed`** tile detach, partial unpublish (camera off / mic on), **`share_state: stopped`** guest behavior (host_screen detach only). |
| **Detail owner** | **`operations/build_packaging.md`** (job wiring, container profile, secrets handling). |

## SFU admin teardown (kill switch)

| Topic | Contract |
| --- | --- |
| **Surface** | Internal HTTP on the SFU EC2 process: **`POST /admin/teardown-producers`**. |
| **Auth** | Shared **`SFU_ADMIN_SECRET`** header; bind to loopback or VPC-only callers. |
| **Body** | **`{ env, roomId, producerClass?: "participant_av" }`** — omit **`producerClass`** to tear down all **`participant_av`** producers in the room; **`host_screen`** is never torn down by kill switch. |
| **Caller** | Room **`PATCH`** Lambda after durable **`avDisabled: true`** write (#101 / #102). Idempotent close-by-**`sessionId`** / **`producerId`**. |
| **Failure** | Log + metric; room state remains **`avDisabled`**; token mint denial prevents re-publish. |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Client calls TMDB? | **No**; only reconcile + **`GET /v1/catalog`**. |
| Record sessions to S3? | **No** MVP — **no** server-side recording of WebRTC as default product posture; future lawful backends remain pluggable. |
| Mesh dev fallback? | **No** — SFU + TURN in all environments; mesh removed. |
| Server-side theater audio mix? | **Deferred** — client-side Web Audio remains default (**`api_contracts.md`**). |
| Chromecast boundary? | **Viewer-local only.** Optional sender/receiver integration; no room API, WebSocket fan-out, `share_state`, or room-authority change. |
| Custom playback on Cast receiver? | **Out of scope MVP** — receiver uses **`host_screen` SFU consume** when Theater share is active; no Custom iframe on TV in this slice. |
| External social graph for friends/DM? | **No** — Dynamo-backed inside RiffSync; fan Cognito **`sub`** identity only. |
| New IdP for friends/DM? | **No** — existing fan Cognito pool + fan JWT authorizer. |
| Staff access to DM bodies via admin tools? | **No** for this slice — staff pool remains catalog/ops only. |

## Decisions (local disposable profile — #136)

| Question | Decision |
| --- | --- |
| Local TURN credential source? | **coturn** in **`infra/local-media/`** compose with static-auth secret shared via **`.env`**; SPA may override ICE via **`VITE_WEBRTC_ICE_SERVERS_JSON`**. |
| Staging AWS slice for harness? | **Out of scope** — isolated local/ephemeral only. |

## Decisions (CI ephemeral bootstrap — #154)

| Question | Decision |
| --- | --- |
| Harness container image? | Compose **`build`** from **`services/riffsync-sfu/Dockerfile`** at PR checkout — same context as local **`media:local`**; **no** separate pinned harness image for MVP. |

## Decisions (harness join credentials — #155)

| Topic | Decision |
| --- | --- |
| **SFU join JWT** | Harness mints join tokens **in-process** via **`signSfuJoinToken`** (**`infra/cdk/lambda/sfu-join-token-sign.ts`**) using bootstrap **`SFU_JWT_SECRET`** — payload shape matches prod **`SfuJoinClaims`**. |
| **Fan Cognito JWT** | **Not required** for MVP harness scenarios — room WS stub accepts connections without API Gateway authorizer emulation. |
| **ICE credentials** | Static-auth coturn credentials from **`infra/local-media/`** fixture config — **no** prod **`GET /v1/webrtc/ice`** call in CI. |

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### catalog-playback-host
- Exact **CSP `frame-src`** directive syntax for arbitrary HTTPS Custom origins (coordinate with **operations/security.md**).

### friends-dm-aws-surfaces
- Whether DM realtime adds a **new** API Gateway WebSocket API / stage vs reusing the room WS API with non-room routes (must stay explicit if shared).
- New Dynamo table names, GSIs, and Lambda env vars for friendship / DM / unread (coordinate with data domain).
- Optional EventBridge/Scheduler purge jobs for account-closure DM cleanup (reuse existing Scheduler → Lambda class; no new fabric).

### chromecast-provider-boundary
- No open decisions remain for #303 receiver bootstrap. **`apps/web/src/pages/cast/castReceiverSession.ts`** owns Cast receiver framework loading, namespace listener registration, custom namespace options, and context start; **`apps/web/src/pages/cast/castReceiverSession.test.ts`** proves the RiffSync namespace is registered before start and that sender-proxied presentation messages do not introduce room-service access.
- No open decisions remain for sender availability provider errors. Availability-time sender failures map to local **`CAST_UNAVAILABLE`**; later start/session failures map to local Cast start/lifecycle statuses in the issue that owns that path. Provider errors, receiver identifiers, and device names are not exposed in room surfaces or room diagnostics.

## Primary code pointers (optional)

- **`docs/contracts.tmdb.md`**, **`docs/architecture.catalog-images.md`**.
