# RiffSync

**RiffSync** is a fan-made idea centered on a **catalog** of episodes you can watch on **YouTube** — **alone** straight from the library, or together in a **watch party**. Public rooms can be browsed live and joined; each party gets a **shareable URL** hosts can paste elsewhere. Chat attaches to rooms, not solo sessions.

This repository is the home for that project. Implementation details will land here as the project is built.

## What users do

From the **same catalog**:

1. **Play** — Open an episode and watch solo in the app (official embed; normal YouTube rules apply).
2. **Start a watch party** — Choose an episode and open a party: you’re the **host**; synced playback + room chat/presence apply for guests.

The host declares an **experience label** when creating or managing the room: **Premium** (“host runs YouTube with Premium / broadly ad-free playback on their setup”) versus default **free, ad-supported** — the app cannot detect someone’s subscription; this is advisory for join expectations and sync chatter, **not verified by RiffSync**.

**Share** — The host gets a **stable room URL** (e.g. `/room/<id>`) with **copy link / share** suited for Discord, Mastodon, etc.; anyone with the link can join according to visibility rules (**public lobby** vs unlisted/private later).

You can also **browse live public parties** started by someone else and **join** as a participant.

Solo playback does **not** use realtime sync; watch parties do.

## Disclaimer

RiffSync is not affiliated with, endorsed by, or connected to *Mystery Science Theater 3000*, Shout! Factory, Alternaversal, or YouTube. Episode metadata and links point at third-party content; availability and embed permissions change over time.

## Goals

- **Catalog** — Curated list of episodes (or experiments) with metadata: title, episode number, YouTube video ID, era, etc. Entry points for both **solo play** and **starting a party**.
- **Watch parties** — Public rooms (and optionally **unlisted/private** canonical URLs later) where one **host** controls play, pause, seek, and playback rate. Each room has a **shareable link** hosts can paste on social feeds.
- **Playback expectations label** — The host marks the room **Premium** *or* (default) **free, ad-supported**; the embed/API **cannot** reliably detect YouTube subscription state, so the UI treats this as **self-reported**. Joiners see the badge in lobby and share cards.
- **Discovery** — See what others are watching in public mode and join an active room.
- **Chat** — Room-scoped messages (and optional light presence: who is here, join/leave).
- **Future (lawful playback only)** — Leave room for lawful sources beyond YouTube (partner streams, clarified purchase terms, or **local / self-hosted** playback). See **Future playback backends** below — without operating a communal upload vault.

## Users & identity

- **No mandatory signup** — Visiting the app should be enough to browse the catalog and use playback.
- **Anonymous by default** — People who participate in discovery, rooms, or chat get a **random display name** (e.g. adjective+noun+digits) assigned on **first meaningful use**, without an email/password flow.
- **Continuity without accounts** — Keep the chosen name stable on that **browser/device** via local persistence (Storage). Clearing site data ⇒ new persona is acceptable for MVP.
- **Optional tweaks** — Let users reroll name or lightly edit label if you want nicer social UX; defer full auth until you truly need recoverable identity or cross-device history.

Host controls and moderation stay simpler with anonymous users; banning or timeouts can target **opaque client/session ids**, not verified people.

## How sync works (watch parties; no tab sharing)

**Solo:** the client loads the chosen library item in the embedded player only — **no shared room timeline**.

You do **not** need the host to share a screen tab for the default party mode. For the MVP, each participant loads the **same** YouTube video in the **official** embedded player; the app keeps **room state** in sync:

- Current time, play/pause, playback rate  
- Host actions are sent to the server and broadcast to other clients  
- Clients apply small **drift corrections** (e.g. every few seconds, if local time is off by more than a threshold, seek gently)

Mental model: a **synchronized remote control** on top of a playback backend, not a pirate CDN. The MVP uses YouTube; the same coordination layer can apply to other backends later.

## Room lifecycle & cleanup

Rooms do **not** clean themselves up by magic. If the host **pulls power** or **drops offline**, TCP/WebSocket teardown may never arrive—you only learn from **timeouts**.

**Baseline pattern:**

1. **`lastActivityAt`** — Server-maintained timestamp updated on meaningful room traffic (playback control, joins, chat) **and** on heartbeat **pings**.
2. **Ping** — While connected, clients send lightweight pings on an interval over the realtime channel so **idle but healthy** viewers still bump `lastActivityAt` without fake playback events.
3. **Timeout** — If `lastActivityAt` is older than **`STALE_AFTER_MS`**, hide the room from discovery and treat it as dead for new joins; optional **`DELETE_AFTER_MS`** removes the persisted row (or rely on TTL + sweeper).

Tune thresholds so transient issues (tab backgrounded, short disconnect) don’t nuke parties.

**Also useful**

- **`hostReconnectToken`** and a reclaim window so the original host can regain authority after reconnect.
- If host stays missing past grace: **freeze**, **promote** another participant, or **end** the room—with simple UX for MVP.

Browsers/networks rarely give instant “host is dead”; teardown stays **eventually consistent**.

## Future playback backends (design hook)

Fan support might fund clearer distribution paths (sales, bundles, partnerships) or tooling that respects purchase terms. Architecturally you can leave the door **open without hosting other people’s files**:

- Treat **playback** as **pluggable**: room state stays “what are we watching + where are we?” (e.g. stable episode key + `videoId`, or future `source: local|Plex|youtube|partner-stream`).
- A **lawful locally hosted** variant means **each viewer plays media they already have lawful access to** — files **on their own disk**, **their own Plex/Jellyfin LAN**, **official apps**, or **streams you negotiated** — while RiffSync (or self-hosted relay) carries only **commands, timestamps, chat, presence**. No centralized “fans upload ripped Gizmoplex files” vault.
- If the community rallies, effort is better aimed at **licensing clarity**, **official or partner playback**, or **self-hosted installers** everyone runs under **their own** libraries — not anonymous shared uploads.

## Legal and platform constraints

- Use YouTube’s **iframe / IFrame Player API**; do not strip ads, re-host video, or circumvent YouTube’s normal playback.
- Many videos are **not embeddable**; the catalog should only reference IDs that allow embedding, and be prepared for takedowns.
- Browsers enforce **autoplay policies** — expect an explicit user gesture (e.g. “Tap to join sync”) when joining a room.
- **Premium vs ads** — RiffSync does not query or verify YouTube accounts; rely on honest **host-reported room labels**, not entitlement checks.
- Naming and MST3K references in the UI should stay clearly **fan / unofficial**.

## Technical direction (sketch)

| Layer | Suggested direction |
| --- | --- |
| Frontend | TypeScript, React or Next.js, YouTube IFrame API, WebSocket client |
| API | REST for rooms/catalog; WebSockets for playback events, chat, presence, periodic **ping** for liveness |
| State | Authoritative room document (video id or future episode/source key, time, playing, rate, **`playbackExpectation`** `premium \| free-ad-supported`, host id, **lastActivityAt**, optional reconnect token); ephemeral presence optional; **player backend as a pluggable seam** |
| AWS (example) | API Gateway (HTTP + WebSocket) + Lambda, or containerized realtime if you want Socket.IO-level ergonomics; DynamoDB for rooms/catalog metadata; optionally ElastiCache for hot room state on larger scale |

**MVP cut:** catalog **solo play**, catalog → **create watch party**, **canonical share URLs** + lobby discovery + join path, embedded YouTube, host controls, chat, basic sync — **anonymous display names**, **self-reported “Premium” vs “free, ad-supported”** room labels, no signup. Defer full accounts, heavy moderation, and unlisted/private-only rooms if you want speed.

## Naming

The repo uses **RiffSync** — short and descriptive. Other directions from brainstorming: **Satellite of Love** (tone), **Crowd Servo** (character nod).

## License

Add a license when you initialize the codebase (for example MIT or AGPL, depending how you distribute the stack).
