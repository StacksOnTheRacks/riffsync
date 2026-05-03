# RiffSync — frontend architecture (draft)

Tracks MVP UI and client behavior aligned with [`README.md`](../README.md) and [`architecture.server.md`](architecture.server.md). Stack is **TypeScript** with **React or Next.js** plus **YouTube iframe / IFrame API** on the **room admin** surface and **WebRTC** for **guest** playback of the admin’s shared capture — pin the framework when scaffolding. The **backend** is specified as **AWS CDK** plus **TypeScript Lambda** handlers (**Node.js** runtime), **serverless-first**; optional future shared **types** packages can align client and API contracts. **Google Cast** (Chromecast-capable devices) is an **optional per-viewer** surface described under **Chromecast / Google Cast** below.

---

## Route map (MVP)

| Route / area | Purpose |
| --- | --- |
| `/` or `/catalog` | Browse curated catalog → **Open episode** creates or opens **`/room/:id`** with that selection (product choice: always-new vs reuse empty room). |
| `/room/:roomId` | **Canonical session surface:** **in-room library selector** (catalog-backed; defaults to the episode used when opening the room) lets the **room admin** change the **current** title — authoritative **`catalogEpisodeId`**/`videoId` on the room doc updates accordingly; **embedded YouTube** for the admin; **WebRTC `<video>`** for **guests**; WebSocket for chat, presence, pings, **signaling**. Optional **`/watch/:catalogId`** alias may **redirect** here—avoid divergent playback logic. |
| `/lobby` (or sidebar on `/`) | List **live public** rooms from HTTP API → join navigates to `/room/:id`. |
| `/admin/*` (**separate SPA or gated route**) | **Operator-only** UX: roster of **registered** viewers (via admin API), reporting views, catalog + curated list editors — authenticated with **staff** credentials (**`architecture.admin.md`**), not viewer Facebook OAuth. |

Exact path names can change; keep **canonical share URLs** stable once published (`/room/<id>` in README).

**Production canonical origin:** **`https://riffsync.tv`** (**`.forge/project.json`** **`public_domain`**) — use this host when registering **Cognito Hosted UI** / **Meta OAuth** redirect URIs, **Content Security Policy** / frame ancestors if you add them, and any **YouTube embed** or **Cast** origin allowlists.

## Catalog source (repo + API)

Episode metadata + YouTube **`videoId`** ultimately live in **DynamoDB** (canonical catalog — **[`architecture.server.md`](architecture.server.md)**). During early development **`data/catalog/episodes.json`** is a **seed** constrained by **`data/catalog/catalog.schema.json`** (**`youtubeWatchUrl`**, **`tagline`**, **`posterImageUrl`**, **`backdropImageUrl`**, **`tmdbMovieId`**, **`tmdbArtworkSyncedAt`** — nullable until reconcile). After migration the app reads **`GET /v1/catalog`**, where responses may include TMDB copy (**`tmdbOverview`**, **`tmdbPopularity`**, …) per **[`architecture.catalog-images.md`](architecture.catalog-images.md)** — display **`title`** stays the catalog field, not a second TMDB title. Until wiring lands, spikes may load the seed JSON statically and fall back to YouTube thumbnails from **`youtubeVideoId`** when poster art is **`null`**.

---

## Top-level flows

```mermaid
flowchart LR
  subgraph catalog_to_room["Catalog → room"]
    CAT[Catalog] --> ROOM[Room page /room/id]
    CR[Create / open room HTTP] --> ROOM
    LOB[Lobby HTTP] --> ROOM
    LINK[Shared URL] --> ROOM
  end

  subgraph admin_path["Room admin"]
    ROOM --> YT[YouTube iframe API]
    ROOM --> CAP[getDisplayMedia tab capture]
    CAP --> RTC_OUT[WebRTC publish]
  end

  subgraph guest_path["Guests"]
    ROOM --> WS[WebSocket signaling chat ping]
    WS --> SRV[Backend]
    RTC_OUT -.->|SDP ICE via WS or HTTP| GUEST[Guest WebRTC subscribe]
    GUEST --> VID[Inbound media element]
  end
```

---

## YouTube embedding (room admin surface)

- **Official** player only (Iframe API): load by `videoId` from catalog/room snapshot on the **admin’s** client only for shared sessions (guests consume **WebRTC**, not a parallel embed—see **Admin broadcast & WebRTC**).
- **Autoplay**: expect **explicit user gesture** for the admin to start playback and for guests to start **`HTMLMediaElement`** playback of the inbound stream when autoplay policies require it.
- **Ads**: captured stream reflects whatever the **admin’s** embed shows; guests inherit the same interruptions—no separate per-guest ad cadence to reconcile.
- **Embeddability**: some catalog IDs may stop embedding; UI should signal **playback unavailable** on the admin surface and avoid infinite retry loops.
- **Hiding YouTube’s fullscreen control:** In the **IFrame Player API**, set **`playerVars.fs` to `0`** (embed URL equivalent **`fs=0`**) so the player’s **fullscreen button is not shown**. This nudges users toward **theater fullscreen** (**wrapper `requestFullscreen`** — see **Fullscreen & chat overlay**) instead of iframe-only fullscreen, where RiffSync UI disappears. Re-validate against **[current YouTube IFrame API parameter docs](https://developers.google.com/youtube/player_parameters)** when implementing—parameters can evolve; some clients may still expose platform-specific fullscreen paths outside the embed chrome.

**Seam:** wrap the admin-side player in **`PlaybackBackend`** so future **local/partner** sources plug in behind “load / play / seek / listen to time updates”; guest-side **`GuestMediaSurface`** stays “attach inbound **`MediaStream`** + play/pause UX.”

---

## Chromecast / Google Cast (per viewer, optional)

**Product intent:** Each viewer may **optionally** cast **what their browser is playing** to a **nearby Cast receiver**—for the **room admin**, often the **embedded YouTube** session; for **guests**, typically the **inbound WebRTC `<video>`**. **Viewer-local:** the admin does not Cast for the entire room; each person chooses their own sender path when supported.

**Implementation directions** (validate against YouTube embed policy, Cast APIs, and whether guests ever need Cast-specific handling for plain **`MediaStream`** playback):

1. **YouTube embed controls** — Some iframe configurations expose YouTube’s own **Play on TV / Cast** affordance when Google allows it for embedded players. Prefer this on the **admin** surface when reliable.
2. **[Cast Web Sender](https://developers.google.com/cast/docs/web_sender)** — May apply to **`videoId`** / watch URL flows on the admin client; pairing **WebRTC guest `<video>`** with Cast may require different validation—prototype **Chrome** early.
3. **Fallbacks** — When Cast is unavailable (**Safari**, some smart-TV browsers, policy blocks), rely on **inline** playback; optional **“Open in YouTube app”** escape hatch remains product choice for the admin embed path only.

**Watch-room caveats**

- **Guests** watching the **WebRTC** stream cast **that `<video>` element** (or OS-level mirroring)—behavior differs from casting the **YouTube embed** directly.
- **Room admin** casting from the **embedded YouTube** tab follows normal **YouTube + Cast** rules and affects **only their** viewing setup; guests still receive the admin’s shared capture unless product adds alternate flows.

**Detection:** Only render the Cast affordance when sender support is present (e.g. Cast browser API / framework availability). Never block core playback when Cast is missing.

---

## Identity (anonymous MVP)

On **first use that needs a server-visible participant** — **opening `/lobby`**, **creating/opening a room**, or **joining `/room/:id`** (WebSocket connect)—**not** for catalog browse alone (**cost control**: avoid storing anonymous sessions for drive-by readers):

- Assign **random display name** + generate **opaque `sessionId`** (UUID) persisted in **`localStorage`** (or SessionStorage where inappropriate for long-lived persona).
- Optionally **persist `displayName`** and allow **reroll** / minor edit later.
- Send **`sessionId`** on room/lobby HTTP (**`X-Session-Id`** header per **`authorization.md`**) and on WebSocket connect; **`hostSessionId`** on the room is set from the creator’s **`sessionId`** at party create (**no separate reclaim token** MVP—same browser session resumes host if **`sessionId`** unchanged).

Clearing site data ⇒ **new persona**; acceptable per README.

---

## Optional: Facebook login (federated identity)

When the product needs **optional** accounts (cross-device persona, stronger host trust, saved settings) while keeping **no mandatory signup**:

1. **UX** — Offer **“Continue with Facebook”** beside the anonymous path; after success, store **Cognito tokens** (e.g. `id_token` / refresh flow per SDK) in memory + secure patterns; **do not** send Facebook access tokens to your Lambdas as the long-lived trust root—prefer **Cognito-issued JWTs**.
2. **Display name** — Prefer **Cognito attributes** or a small **`GET /v1/me`** (or profile fragment on an existing route) backed by Dynamo **keyed by `sub`**, so chat/rooms show a stable label; allow override vs Facebook **name** per product policy.
3. **WebSocket** — Send the same **Bearer** token (or a short-lived **connection ticket** minted over HTTP) on **`$connect`** so the authorizer can resolve **`sub`** for **future** signed-in features and abuse signals; **MVP host** authority remains **`sessionId` vs `hostSessionId`** (anonymous clients unchanged).
4. **Meta / legal** — Register a **Meta** app with **Facebook Login**, set **OAuth redirect URIs** to match **Cognito Hosted UI** (or your chosen redirect flow), publish a **Privacy Policy** and **user data deletion** instructions where Meta requires them, and document what you store (see Meta **[Data Use Checkup](https://developers.facebook.com/docs/development/release/data-use-checkup)** and current **Platform Terms**).

Implementation detail for Cognito, API Gateway JWT authorizers, and token claims lives in **`architecture.server.md`**.

---

## Realtime WebSocket client

Responsibilities on `/room/:roomId`:

1. **Connection lifecycle** — connect with `roomId` + **`sessionId`**; backoff/reconnect UX; unsubscribe on navigate away.
2. **Periodic ping** — lightweight message on interval so **`lastActivityAt`** stays fresh while idle (coordinate interval with backend).
3. **Inbound events** — **chat**, **presence**, **room metadata** updates (episode selection, visibility, broadcast lifecycle flags as implemented), and **WebRTC signaling envelopes** (SDP / ICE candidates—shape TBD with OpenAPI/contract tables).
4. **Outbound** — **Room-admin only:** episode/load intent if modeled over WS, signaling messages; **not** “broadcast canonical `currentTime` to drive three separate iframes.” Anyone in MVP: **chat**; optional presence typing later.

Treat **WebRTC peer connection state** separately from **YouTube iframe events** so reconnect and ICE restarts do not thrash the embed.

---

## Admin broadcast & WebRTC (shared picture)

**Goal:** Guests watch **one** realtime **`MediaStream`** sourced from the **room admin’s** browser capture of the room page (or chosen display surface), preserving **shared ads and buffering** versus parallel embeds.

**Capture**

- Use **`getDisplayMedia`** with **`preferCurrentTab: true`** (where supported) so the chooser defaults to **the RiffSync tab** that already shows the catalog-selected episode—product copy frames this as **Share video with everyone here**, not generic screen sharing.
- Request **audio** when the browser permits **tab audio** capture alongside video.

**Peers**

- **MVP options:** small-room **mesh** (admin ↔ each guest) vs **SFU** (managed vendor or self-hosted) when fan-out or uplink requires it. Publish **STUN** (`stun:`) in client config; add **TURN** when symmetric NAT / reliability demands—it is required for many real-world networks at scale.
- **Signaling:** reuse WebSocket routes (or HTTP where simpler) to exchange SDP and ICE candidates **after** authz confirms **`sessionId === hostSessionId`** for publisher role.

**Guests**

- Attach remote tracks to a **`<video playsInline>`**; honor autoplay policies with explicit **Play** where needed.
- When the admin stops broadcasting or disconnects, guests show honest **stream ended** UX and fall back per product policy (reload lobby — **no silent iframe substitution** unless explicitly designed).

**Admin-only embed**

- If the room has **no guests**, skip capture/WebRTC to save bandwidth; embed-only path still satisfies **solo** viewing on the room page.

---

## In-room catalog selector (changing what’s playing)

- **Who:** **Room admin only.** Guests see the shared stream (and optional read-only **Now watching** label driven by room metadata)—no picker unless product explicitly adds suggestions later.
- **What:** A compact **library control** backed by the same **`GET /v1/catalog`** data as the main catalog (search/filter UX optional). On **first entry**, it reflects the episode used to **seed** the room (deep link, create payload, or query)—pre-selected in the control even though **`catalogEpisodeId`** ultimately lives on the **room document**.
- **Mutation:** Choosing another row updates **`catalogEpisodeId`** (and derived **`youtubeVideoId`**) on the authoritative room **via HTTP `PATCH` / `PUT`** or an equivalent WebSocket envelope—**conditional write** / **`version`** per **`api_contracts.md`**. Server fan-out notifies guests so headers, lobby projections, and **Now watching** stay consistent.
- **Embed + capture:** Admin client loads the new **`videoId`** in the iframe; ongoing **tab capture** picks up the transition—guests see the switch through the **same WebRTC stream** without parallel embed sync.
- **Lobby:** Public lobby rows **SHOULD** display metadata for the **current** **`catalogEpisodeId`** (title/thumbnail) so listings stay truthful when admins switch mid-party.

---

## Room UI specifics

| Concern | Notes |
| --- | --- |
| **Library / “Now watching”** | Admin: **catalog picker** + transport on embed; guests: label + shared stream only. Reflect **current** **`catalogEpisodeId`** after switches; optional lightweight chat system line when admin changes title (product choice). |
| **Admin vs guest** | Only **`sessionId === hostSessionId`** starts capture and publishes WebRTC; guests are subscribe-only for media (chat rules unchanged). |
| **Chromecast / Cast** | Optional **per-viewer**; behavior differs for **embed** (admin) vs **inbound WebRTC `<video>`** (guest). Hide when unavailable. |
| **Share** | **Copy URL** (`/room/:id`), optional Web Share API on capable devices; show **`playbackExpectation`** on share affordance. |
| **Badges** | Lobby row + room header: Premium vs **free, ad-supported** (**honor-system** disclaimer in microcopy optional). |
| **Fullscreen + chat** | **Yes**, using **custom theater fullscreen:** call **`Element.requestFullscreen()`** on a **wrapper** that contains both the **player surface** (iframe or guest `<video>`) and a **chat column overlaid** on the side (e.g. **right rail**, semi-opaque panel, scrollable messages). Do **not** rely on **YouTube’s built-in iframe fullscreen** for this—the iframe goes fullscreen alone and **won’t** include RiffSync UI; expose an explicit **Theater fullscreen** (or similar) control in your chrome. Honor **Escape** to exit; consider **`prefers-reduced-motion`** and contrast for readability over video (**`presentation.md`**, **`accessibility.md`**). |
| **Empty/error** | Stale room, admin gone, forbidden — clear copy + redirect to lobby. |

---

## Fullscreen & chat overlay (“theater” mode)

- **Feasible:** Treat **player + chat** as one layout region. Fullscreen **that region’s outer container** (not the raw iframe / `<video>` node). Position chat with **CSS** (e.g. **`position: absolute`** / grid: media fills cell, chat occupies **right** fraction with **`max-width`** + **`min-width`** for readability).
- **Limitation:** If the user triggers fullscreen **inside** the YouTube iframe (YouTube’s control), the browser shows **only** YouTube’s surface—**no** RiffSync chat. Mitigate with a clear **in-app fullscreen** affordance and optional copy that theater mode keeps chat visible.
- **Guests:** Same pattern using the **WebRTC `<video>`** as the media child inside the wrapper.
- **Small viewports:** Prefer **bottom sheet**, **toggle overlay**, or **narrow column** instead of a permanent right rail so touch targets stay usable.

---

## Chat & presence

- Append-only **scrollback** capped (e.g. last N messages) — full history MVP optional.
- **Rate limits** surfaced as toast when server rejects.
- **Presence list** keyed by anonymous display labels; join/leave small system lines optional.

---

## Purchased HTML template (visual design)

The **Streamlab-style** multi-page HTML package lives in-repo at **`docs/riffsync-design-template/`** (vendor bundle — honor purchase **license** if public redistribution is restricted). Treat it as the **visual reference**: **reinterpret inside the SPA**, not as the production app shell.

**Layout inside the bundle**

| Path | Role |
| --- | --- |
| **`docs/riffsync-design-template/Main File/red-html/`** | **Red-accent** variant (aligned with earlier demos such as [Tv Shows Home](https://gentechtreedesign.co.in/web-apps/html/streamlab/red-html/tv-shows-home.html)). Static HTML entrypoints e.g. **`movies-home.html`**, **`tv-shows-home.html`**, **`library.html`**, **`single-movie.html`**, **`single-episode.html`**. |
| **`docs/riffsync-design-template/Main File/html/`** | Same page set **without** the red theme swap — pick **one** variant to tokenize first to avoid drift. |
| **`…/css/`** | **`style.css`**, **`responsive.css`**, Bootstrap / plugin sheets (**`swiper-bundle`**, **`owl.carousel`**, **`slick`**, etc.). |
| **`…/js/`** | **`jquery`**, **`bootstrap`**, **`streamlab-core.js`**, **`script.js`**, sliders/loaders — **do not** wire these wholesale into React; mine for selectors and behavior only. |
| **`…/fonts/`**, **`…/images/`** | Icon fonts, backgrounds — copy subsets into **`public/`** (or equivalent) when scaffolding if paths change. |

**Maps to RiffSync (starting points)** — **`/` / catalog** ↔ **`movies-home.html`** / grid sections; **in-room library picker** ↔ **`library.html`** patterns; **detail chrome** ↔ **`single-movie.html`** / **`single-episode.html`** hero + meta rows (adapt copy for MST-flavored catalog fields).

| Topic | Guidance |
| --- | --- |
| **Integration shape** | Port **tokens + layout** into **React** routes (**`/`**, **`/lobby`**, **`/room/:id`**): global CSS import from a **copied** asset tree under **`public/`** (recommended once scaffold exists), plus component overrides so class names stay stable or map cleanly. |
| **Scripts / jQuery** | Prefer **React implementations** (e.g. **Swiper** React, CSS-grid carousels) over **`streamlab-core.js`** + jQuery owning the same DOM nodes as the iframe/WebRTC surfaces. |
| **Branding** | Replace Streamlab logo/wordmark with **RiffSync** where shown in ported layouts. |
| **License & repo hygiene** | Keep **purchase proof**; if license forbids hosting full sources on GitHub, replace this tree with a stub README pointing to a **private artifact** and ship only allowed compiled assets. |
| **Security** | Strip demo analytics / third-party snippets before production; align bundled script/style origins with **CSP**. |

**Next implementation step:** copy **`css/`**, **`fonts/`**, **`images/`** (and any SVG/sprites needed) into the SPA **`public/`** tree with unchanged relative conventions **or** re-root URLs via bundler; leave **`docs/riffsync-design-template/`** as the **authoritative HTML preview** for designers and parity checks.

---

## State management (implementation TBD)

Document **chosen** stack here after bootstrap (e.g. React Query + Zustand, or Redux Toolkit, or Next Server Components boundaries). Principle: **network state** for room snapshot + websocket merge; **ephemeral UI** local.

---

## What this doc deliberately defers

- Visual design system — **started from purchased HTML template** (see **Purchased HTML template (visual design)** above); component library selection **TBD** once scaffold exists.
- i18n, a11y audit checklist (add once components exist).
- Concrete **vendor choice** for SFU/TURN vs mesh-only prototypes.
- **Tests** layout — mirror `CONTRIBUTING.md` or `README` Testing section once CI exists.

Update this file when routes, event schemas, or storage keys stabilize.
