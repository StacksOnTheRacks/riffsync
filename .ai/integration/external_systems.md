# External systems

Outbound and third-party boundaries. Legal posture: **unofficial fan app**; honor each provider’s ToS.

## YouTube (Google)

| Use | Mechanism | Contract |
| --- | --- | --- |
| **Playback (admin)** | **IFrame / IFrame API** on **room admin** client; `videoId` from catalog / room snapshot. | No download/rehost by RiffSync; embed eligibility may change per video—UI handles failures. |
| **Guest viewing** | **WebRTC** **`MediaStream`** from host tab-capture and, when enabled, **participant A/V** over **self-hosted mediasoup SFU** on **`RiffSyncTurn`** — **`POST /v1/webrtc/sfu-token`** + **coturn**. | **SFU mandatory in all environments** (dev, CI, production). **Mesh WebRTC removed.** Multi-producer registry (host screen + N participant cameras/mics). Theater audio mixing is **client-side** (server-side mix **deferred**). Honor browser permission and autoplay policies. |
| **Thumbnails (optional)** | **`https://img.youtube.com/vi/{id}/{hqdefault|maxresdefault|…}.jpg`** | Reconcile job **`HEAD`** fallback chain; persist resolved URL on catalog row (**`docs/architecture.catalog-images.md`**). No YouTube Data API required for thumbs. |

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
| **DynamoDB** | System of record: catalog, rooms, connections, optional lists/profiles/events. |
| **EventBridge / Scheduler** | Sweeper, TMDB + YouTube thumb reconcile. |
| **Secrets Manager** | TMDB, **Giphy**, optional other backend secrets. |
| **S3** | Catalog assets, **fan avatars** (public HTTPS delivery). |
| **CloudWatch** | Metrics, dashboards, logs, alarms (**`docs/architecture.server.md`** Observability). |
| **Cognito (fan pool)** | **Fan user pool** + public SPA app client: optional **fan JWT** for hosting, **`/v1/fans/*`**, Giphy proxy; **self-sign-up enabled**; **COGNITO-only** IdP in current CDK (Facebook IdP remains **optional** per product—see Meta row). Hosted UI + PKCE; OAuth callback **`/auth/callback`**. Room **host** authority remains **`JWT.sub === room.hostSub`** on **fan** tokens only. |
| **Cognito (staff pool)** | **Separate invite-only staff user pool** + staff SPA app client for **`/v1/admin/*`**: **`selfSignUpEnabled: false`**, **COGNITO-only** (no Facebook IdP), predefined groups **`admin`** / **`curator`**, **second HTTP JWT authorizer** (staff issuer + staff client audience) on the **same HTTP API** as fan routes. Hosted UI + PKCE; OAuth callback **`/admin/auth/callback`** on **same SPA origins** as fan. Staff verification/invite email reuses fan **SES From** (**`noreply@riffsync.tv`**) and shared configuration set. Operator onboarding MVP: **manual console invite** acceptable. |
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
| **`fanSub` in SFU join JWT** | Required on **`participant_av`** producer tokens per SFU **`jwt.ts`** verification — harness mints fixture **`fanSub: harness-fan-sub`**. |
| **ICE credentials** | Static-auth coturn credentials from **`infra/local-media/`** fixture config — **no** prod **`GET /v1/webrtc/ice`** call in CI. |

## Primary code pointers (optional)

- **`docs/contracts.tmdb.md`**, **`docs/architecture.catalog-images.md`**.
