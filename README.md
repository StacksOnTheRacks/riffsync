# RiffSync

**RiffSync** is a fan-made idea centered on a **catalog** of episodes you can watch on **YouTube**. **Hosting** a room (creating one, driving the embed, broadcasting to others) requires a **real signed-in account** (e.g. federated login)—anonymous visitors **cannot** become room admin; they can still **browse**, **join** via link or lobby, and **watch** a hosted session. The room admin uses an **in-room library selector** (pre-filled on the episode used to open the room) to load or **switch** titles, drives the official **embedded player**, and can **share that viewing surface** via **WebRTC** so guests see **one shared picture**—including the same ad breaks the admin sees. Public rooms can appear in the **lobby**; every room has a **shareable URL**. Chat attaches to rooms.

This repository is the home for that project. Implementation details will land here as the project is built.

**Production site:** [https://riffsync.tv](https://riffsync.tv) — canonical public hostname for the deployed fan app (see **`.forge/runtime/configuration.md`** and **`.forge/project.json`**).

## What users do

From the **same catalog**, flows converge on a **`/room/<id>`** page:

1. **Open an episode (signed-in)** — After **elevating** with a real account, **create or reopen** your room seeded with that catalog row as the **current episode** (a **mutable room attribute**); you are **room admin** for that room (until policy says otherwise).
2. **Try to host without an account** — You’re guided to **sign in** (or register if offered); anonymous users **do not** receive admin/publisher privileges.
3. **Room admin** — Sees an **in-room library selector** **pre-selected** on the episode used to open the room; can **switch** titles—the embed updates and guests see the new program through the **same shared capture**. Controls the **official embedded player**, visibility (**public lobby** vs **private link-only** when supported), and **sharing video to the room** (see below).
4. **Guests (often anonymous)** — Join via **lobby** or **direct link** without mandatory signup; watch what the admin shares (often after one browser **Play** tap). **Chat** and **presence** attach here; **lobby rows** reflect the room’s **current** **`catalogEpisodeId`** when listing “what’s playing.”

The admin declares an **experience label** when creating or managing the room: **Premium** (“admin runs YouTube with Premium / broadly ad-free playback on their setup”) versus default **free, ad-supported** — the app cannot detect someone’s subscription; this is advisory for join expectations and chat, **not verified by RiffSync**.

**Share** — **Stable room URL** (`/room/<id>`) with **copy link / share** for Discord, Mastodon, etc.; visibility rules control lobby listing vs link-only.

You can **browse live public rooms** or join by link.

**Chromecast / Cast (optional, per viewer)** — Each viewer may cast **what their browser is playing** (the embed for an admin-only session, or the **received WebRTC stream** for guests—implementation detail). It stays **viewer-local**; the admin does not Cast for the whole room. Availability depends on **browser, OS, embed policy, YouTube, and Cast APIs**. See **`docs/architecture.frontend.md`**.

## Disclaimer

RiffSync is not affiliated with, endorsed by, or connected to *Mystery Science Theater 3000*, Shout! Factory, Alternaversal, or YouTube. Episode metadata and links point at third-party content; availability and embed permissions change over time.

## Goals

- **Catalog** — Curated episodes are **store-backed** (database as canonical source; see **`docs/architecture.server.md`**). Today’s **`data/catalog/episodes.json`** is a **bootstrap seed** + schema reference (**[`data/catalog/README.md`](data/catalog/README.md)**). Choosing an episode routes either to **sign-in to host** or **join** flows depending on context.
- **Rooms & shared viewing** — One **signed-in room admin** per room (**`hostSub`**) drives the **embedded YouTube player**, uses an **in-room catalog picker** to change **what’s playing** (`catalogEpisodeId` / resolved **`videoId`** on the room document), and **broadcasts** that viewing surface to guests via **WebRTC**. Guests may be **anonymous**. Guests do **not** rely on parallel embedded players kept in timeline sync. Each room has a **shareable link**; **public lobby** vs **private** visibility as product rules allow.
- **Playback expectations label** — The admin marks the room **Premium** *or* (default) **free, ad-supported**; the embed/API **cannot** reliably detect YouTube subscription state, so the UI treats this as **self-reported**. Joiners see the badge in lobby and share cards.
- **Discovery** — See what others are watching in public mode and join an active room.
- **Chat** — Room-scoped messages (and optional light presence: who is here, join/leave).
- **Optional Cast to TV** — Per-viewer **Chromecast / Google Cast** affordance for solo and party playback, where the platform allows it (implementation: **`docs/architecture.frontend.md`**).
- **Future (lawful playback only)** — Leave room for lawful sources beyond YouTube (partner streams, clarified purchase terms, or **local / self-hosted** playback). See **Future playback backends** below — without operating a communal upload vault.

## Users & identity

- **No mandatory signup to participate** — Browsing the catalog, joining rooms, watching, and chatting as a **guest** do **not** require an account (**anonymous `sessionId`** + display name).
- **Hosting requires elevation** — Creating a room, acting as **room admin**, publishing WebRTC, or mutating authoritative playback metadata requires **signed-in** identity (**`hostSub`** — Cognito **`sub`**).
- **Anonymous by default** — People who participate in discovery, rooms, or chat get a **random display name** (e.g. adjective+noun+digits) assigned on **first meaningful use**, without an email/password flow.
- **Continuity without accounts** — Keep the chosen name stable on that **browser/device** via local persistence (Storage). Clearing site data ⇒ new persona is acceptable for MVP.
- **Optional tweaks** — Let guests reroll anonymous display name or lightly edit label if you want nicer social UX; defer native email/password accounts unless product demands them beyond federated hosting.
- **“Continue with Facebook” (or equivalent federated login)** — **Required to host** (create a room, publish WebRTC, mutate authoritative playback metadata). **Optional for guests:** anonymous **`sessionId`** + display name remains enough to **browse**, **join**, **watch**, and **chat** in someone else’s room. Signed-in hosts get a stable Cognito **`sub`** stored on the room as **`hostSub`** (see **`docs/architecture.server.md`**). Recommended AWS fit: **Cognito User Pool** + **Facebook as IdP** + **JWT** authorizers on **`POST /v1/rooms`**, room-admin **`PATCH`**, and publisher/signaling paths as implemented (see **`docs/architecture.frontend.md`**, **`authorization.md`**). Operating Facebook Login requires a **Meta developer app**, **Privacy Policy** / **Data deletion** URLs, and compliance with Meta and applicable privacy rules.

Moderation: timeouts/bans can target **opaque `sessionId`** / **`connectionId`** for anonymous guests and **`Cognito sub`** for signed-in hosts or signed-in guests if you later allow optional login there too.

## How shared viewing works (room page; admin broadcast)

**Room page:** Everyone in a session meets on **`/room/<id>`**. The **current episode** is **whatever catalog row the room document says**—usually chosen when the room was opened, then adjustable via the admin’s **in-room library selector**. The **room admin** uses the **official YouTube iframe / IFrame Player API** for that selection—lawful playback, normal ads, no re-hosting of video files on RiffSync infrastructure.

**Guests watch what the admin shares:** After the admin starts **sharing video to the room**, the browser captures the admin’s **tab or window** showing that room page (with browser permission—typically **Share this tab**, steered so it defaults to **the current RiffSync tab** where the catalog-driven episode already loads). That capture is published over **WebRTC**; guests play the **incoming media stream** in the room UI. Everyone sees the **same pixels and audio** from the admin’s session, so **mid-roll ads and buffering match** in a way parallel embeds cannot guarantee.

**Coordination channel:** HTTP + WebSocket remain for **chat**, **presence**, **room metadata** (including **mutable** **current** catalog episode when the admin switches titles, visibility, **`lastActivityAt`** pings), and **WebRTC signaling** (SDP / ICE). The server does **not** implement frame-perfect “sync three separate YouTube embed clocks”; timeline alignment is **inherent** to receiving one shared stream.

**Solo / admin-only:** If no guests need the stream, the admin can watch the embed alone without publishing WebRTC—still on the **room** page when that is the chosen navigation target.

**Mental model:** **One lawful playback surface** (admin’s embed) plus **optional realtime redistribution of that viewing surface** to friends—not a pirate CDN. Other lawful backends can reuse the same split (**local player** / **capture** vs **guest `<video>`**) later.

## Room lifecycle & cleanup

Rooms do **not** clean themselves up by magic. If the **room admin** **pulls power** or **drops offline**, TCP/WebSocket teardown may never arrive—you only learn from **timeouts**.

**Baseline pattern:**

1. **`lastActivityAt`** — Server-maintained timestamp updated on meaningful room traffic (playback control, joins, chat) **and** on heartbeat **pings**.
2. **Ping** — While connected, clients send lightweight pings on an interval over the realtime channel so **idle but healthy** viewers still bump `lastActivityAt` without fake playback events.
3. **Timeout** — If `lastActivityAt` is older than **`STALE_AFTER_MS`**, hide the room from discovery and treat it as dead for new joins; optional **`DELETE_AFTER_MS`** removes the persisted row (or rely on TTL + sweeper).

Tune thresholds so transient issues (tab backgrounded, short disconnect) don’t nuke parties.

**Also useful**

- **`hostReconnectToken`** and a reclaim window so the original **admin** can regain authority after reconnect.
- If the admin stays missing past grace: **freeze**, **promote** another participant, or **end** the room—with simple UX for MVP.

Browsers/networks rarely give instant “admin is gone”; teardown stays **eventually consistent**.

## Future playback backends (design hook)

Fan support might fund clearer distribution paths (sales, bundles, partnerships) or tooling that respects purchase terms. Architecturally you can leave the door **open without hosting other people’s files**:

- Treat **playback** as **pluggable**: room state stays “what are we watching + where are we?” (e.g. stable episode key + `videoId`, or future `source: local|Plex|youtube|partner-stream`).
- A **lawful locally hosted** variant means **each viewer plays media they already have lawful access to** — files **on their own disk**, **their own Plex/Jellyfin LAN**, **official apps**, or **streams you negotiated** — while RiffSync (or self-hosted relay) carries only **commands, timestamps, chat, presence**. No centralized “fans upload ripped Gizmoplex files” vault.
- If the community rallies, effort is better aimed at **licensing clarity**, **official or partner playback**, or **self-hosted installers** everyone runs under **their own** libraries — not anonymous shared uploads.

## Legal and platform constraints

- Use YouTube’s **iframe / IFrame Player API**; do not strip ads, re-host video, or circumvent YouTube’s normal playback.
- Many videos are **not embeddable**; the catalog should only reference IDs that allow embedding, and be prepared for takedowns.
- **Cast / Chromecast** is mediated by **YouTube** and **Google Cast** APIs and rules; embedding may hide or expose cast differently by client. Fail gracefully when Cast is unavailable.
- Browsers enforce **autoplay policies** — expect an explicit user gesture (e.g. **Tap to play**) when joining a stream or starting playback.
- **Premium vs ads** — RiffSync does not query or verify YouTube accounts; rely on honest **admin-reported room labels**, not entitlement checks.
- Naming and MST3K references in the UI should stay clearly **fan / unofficial**.

## Technical direction (sketch)

| Layer | Suggested direction |
| --- | --- |
| Frontend | TypeScript, React or Next.js, YouTube IFrame API (admin room surface), **WebRTC** (tab/window capture → guests), WebSocket client for chat/presence/signaling, optional Google Cast |
| API | REST for rooms/catalog; WebSockets for chat, presence, **WebRTC signaling**, periodic **ping** for liveness |
| State | Authoritative room document (**mutable** **current** catalog episode / `videoId`, **`playbackExpectation`**, **`hostSub`** Cognito user id for the room owner, broadcast/session flags as implemented, **lastActivityAt**, optional reconnect token); ephemeral presence optional; **playback spine pluggable** for future non-YouTube sources |
| AWS (baseline) | **IaC:** **`AWS CDK`** (TypeScript). **Compute:** **Lambda** in **TypeScript** (Node.js bundle) **serverless-first** — **API Gateway v2** (`HTTP` + `WEBSOCKET`), **DynamoDB**, **EventBridge / Scheduler**, **Secrets Manager**. **ElastiCache** (Redis/Valkey-compatible) **optional** for **`GET /v1/catalog`** or lobby caches (VPC-attached Lambdas). **S3** for SPA static hosting or exports if needed — **no ECS/EC2** in the default stack. Details: **`docs/architecture.server.md`**. |
| Deploy / CI | **GitHub Actions**: **pull-request CI** runs **`cdk synth`** (+ **`cfn-lint`**) against **`infra/cdk`** ([**`.github/workflows/ci.yml`**](.github/workflows/ci.yml)). **Manual workflows** (**`workflow_dispatch`**): **`Deploy CDK (staging)`** (**`main` → staging**) and **`Deploy CDK (production)`** (**semver tags → prod**) — see **`infra/cdk/README.md`**. **Semantic versioning** governs production releases. See **`.forge/operations/build_packaging.md`** and **`docs/architecture.server.md`** (Delivery pipeline §). |

**MVP cut:** catalog browse + **anonymous join/watch/chat**, **signed-in-only hosting** (**JWT** / **`hostSub`**), **room page** + **guest WebRTC viewing**, **canonical share URLs** + lobby discovery + join path, embedded YouTube on admin surface, **anonymous guest display names**, **self-reported “Premium” vs “free, ad-supported”** labels. Defer native email/password, heavy moderation, and polished private-room policy if you want speed. **Managed SFU / TURN** is optional when mesh/admin uplink is insufficient—see **`docs/architecture.frontend.md`**.

## Documentation

- [Forge domain contracts & knowledge map (`.forge/`)](.forge/knowledge_map.json) — start at **`vision.json`**; mirrors product + technical boundaries alongside `docs/*`.
- [Catalog data (`data/catalog/`)](data/catalog/README.md)
- [TMDB HTTP contracts — endpoints, fields, image URLs (`contracts.tmdb.md`)](docs/contracts.tmdb.md)
- [Catalog images & TMDB reconciliation (posters + backdrops; draft)](docs/architecture.catalog-images.md)
- [AWS CDK & GitHub Actions deploy (`infra/cdk/`) — synth, `cfn-lint`, staging/prod workflows](infra/cdk/README.md)
- [Server architecture (draft)](docs/architecture.server.md)
- [Operator admin — users, reporting, catalog & lists (draft)](docs/architecture.admin.md)
- [Frontend architecture (draft)](docs/architecture.frontend.md)

## Naming

The repo uses **RiffSync** — short and descriptive. Other directions from brainstorming: **Satellite of Love** (tone), **Crowd Servo** (character nod).

## License

Add a license when you initialize the codebase (for example MIT or AGPL, depending how you distribute the stack).
