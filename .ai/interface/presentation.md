# Presentation

UI-level contract for layout states, honest failure surfaces, and **cost-conscious** defaults (no commercial **SLA** narrative—operators rely on **CloudWatch** + community best effort).

## Global expectations

| Concern | Contract |
| --- | --- |
| **Catalog loading** | Skeleton or **in-catalog placeholders** for rows; avoid blocking the whole shell on **`GET /v1/catalog`** when possible (progressive render). |
| **Empty catalog** | Clear **“nothing to show yet”** copy for operators/contributors—never a silent blank. |
| **Signed-in host / solo room** | **WebSocket** + **JWT** for admin paths; embed errors surface **embed blocked** with host-aware escape hatch (**open on YouTube** for YouTube-host, **open custom URL in new tab** for Custom-host — **`error_state.md`**). |
| **Room / lobby** | **Room-admin** controls only when **`JWT.sub === hostSub`**; anonymous guests see **read-only** player/chat chrome (**picker hidden**, subscribe-only WebRTC). |
| **Theater fullscreen** | Optional **wrapper fullscreen** ( **`requestFullscreen`** on a container that includes the player, optional Theater camera row, and RiffSync chrome) — **not** YouTube iframe-native fullscreen, which cannot show RiffSync chrome. |
| **Share** | **Copy `/room/:id` URL**; show advisory **`playbackExpectation`** near share affordance. |
| **Get App** | Main public nav and footer expose **Get App** linking to **`/download`** when the site is running in a normal browser tab. Room routes render without site header/footer; hide the nav item when the browser reports installed PWA display mode (`standalone` / `minimal-ui` or iOS `navigator.standalone`). |
| **Rate / caps** | Server may return **429** / **WS business `error`** when limits hit (**`api_contracts.md`**); toast or inline message—**no** infinite retry storms. |
| **Catalog browse IA** | Public **`/catalog`** is a **hub**: four large **text** entry links (no imagery) in the page-header subtitle slot above title-search / sort and the retained mixed/all-titles title grid. Link order and labels: **MST3K**, **Community**, **Riff Material**, **Movie Night** (display names only). **Era chips are removed** from **`/catalog`**. Public copy uses **Riff Material** (not Riff Material); route slug **`riff-material`**. Staff-only **`other`** never appears on the hub, nav dropdown, or subcategory chrome. |
| **Catalog subcategory shell** | Routes **`/catalog/mst3k`**, **`/catalog/community`**, **`/catalog/riff-material`**, **`/catalog/movie-night`** share a Streamlab-style shell: page header with the subcategory display name and route-fixed subtitle, the same title-search / sort chrome as the hub (scoped to the route-fixed `catalogs` set), then the existing title/card grid (**`CatalogGridCard`**). Subtitles are **`"Push the button, Frank"`**, **Community Made Riffs**, **Cheesy Flicks Ready to Riff**, and **Pull the Family Together for a Movie Night** respectively. **`/catalog/mst3k`** adds **Era** and **Season** tag pill groups (derived from loaded rows) below the title search; pill labels use the full **`Namespace: Value`** tag text. Host catalog-enum chips remain removed. Per-subcategory visual customization beyond these pills is **deferred**. |

## Public site head tags and heading semantics

Document-level metadata for the durable public surfaces — **`/`**, **`/catalog`**, **`/catalog/mst3k`**, **`/catalog/community`**, **`/catalog/riff-material`**, **`/catalog/movie-night`**, **`/download`**, **`/watch/:catalogEpisodeId`**, **`/how-to-host-a-watchparty`**, **`/terms`**, **`/privacy`** — replacing today's single static **`index.html`** shell that applies the same meta to every route regardless of what renders. See **`business_logic/domain_model.md`** → *Public discoverable surface* for the indexable route boundary; this contract is **mechanism-agnostic** — it holds whether head tags are produced by build-time prerender (**`operations/build_packaging.md`**) or another rendering strategy.

| Route | **`<title>`** | Meta description | Canonical | OG/Twitter image |
| --- | --- | --- | --- | --- |
| **`/`** | **`RiffSync - Watch Parties`** | **`RiffSync — fan watch parties with a curated MST3K-friendly catalog, shared viewing, and room chat. Unofficial fan project.`** | **`{origin}/`** | **`{origin}/og-card.png`** |
| **`/catalog`** | **`RiffSync Catalog - Browse the Library`** | **`Browse the RiffSync catalog of riff-style episodes with lawful YouTube embeds. Explore MST3K, Community, Riff Material, and Movie Night, pick an experiment, and start a watch party. Unofficial fan project.`** | **`{origin}/catalog`** | **`{origin}/og-card.png`** |
| **`/catalog/mst3k`** | **`MST3K - RiffSync Catalog`** | **`Browse Mystery Science Theater 3000 episodes on RiffSync — Joel, Mike, Jonah, and Emily catalogs with lawful YouTube embeds. Unofficial fan project.`** | **`{origin}/catalog/mst3k`** | **`{origin}/og-card.png`** |
| **`/catalog/community`** | **`Community - RiffSync Catalog`** | **`Browse Community catalog titles on RiffSync with lawful YouTube embeds. Pick an experiment and start a watch party. Unofficial fan project.`** | **`{origin}/catalog/community`** | **`{origin}/og-card.png`** |
| **`/catalog/riff-material`** | **`Riff Material - RiffSync Catalog`** | **`Browse Riff Material titles on RiffSync with lawful YouTube embeds. Pick an experiment and start a watch party. Unofficial fan project.`** | **`{origin}/catalog/riff-material`** | **`{origin}/og-card.png`** |
| **`/catalog/movie-night`** | **`Movie Night - RiffSync Catalog`** | **`Browse Movie Night titles on RiffSync with lawful YouTube embeds. Pick an experiment and start a watch party. Unofficial fan project.`** | **`{origin}/catalog/movie-night`** | **`{origin}/og-card.png`** |
| **`/download`** | **`Install the RiffSync App - Download and Add to Home Screen`** | **`Install RiffSync as an app on your phone, tablet, or computer. Step-by-step instructions for Chrome, Edge, Safari, and more. Fan watch parties with a curated catalog.`** | **`{origin}/download`** | **`{origin}/og-card.png`** |
| **`/watch/:catalogEpisodeId`** | **`{episode.title} - RiffSync`** | With **`tagline`**: **`{tagline} — watch {episode.title} on RiffSync. Unofficial fan project with lawful YouTube embeds.`** Without **`tagline`**: **`Watch {episode.title} on RiffSync — fan watch parties with lawful YouTube embeds. Unofficial fan project.`** | **`{origin}/watch/{id}`** | Absolute **`posterImageUrl`**, else absolute **`backdropImageUrl`**, else **`{origin}/og-card.png`** |
| **`/how-to-host-a-watchparty`** | **`How to Host a Watch Party - RiffSync`** | **`Step-by-step help for hosting a RiffSync watch party: share your YouTube tab, keep guests in sync, and fix common screen-share issues.`** | **`{origin}/how-to-host-a-watchparty`** | **`{origin}/og-card.png`** |
| **`/terms`** | **`Terms of Service - RiffSync`** | **`RiffSync Terms of Service — rules for using the fan watch-party site, catalog, chat, and related features. Unofficial fan project; not affiliated with MST3K or RiffTrax.`** | **`{origin}/terms`** | **`{origin}/og-card.png`** |
| **`/privacy`** | **`Privacy Policy - RiffSync`** | **`RiffSync Privacy Policy — what we collect when you browse the catalog, join watch parties, or sign in, and how we use that information.`** | **`{origin}/privacy`** | **`{origin}/og-card.png`** |

**`{origin}`** is the apex canonical build-time origin (**`VITE_PUBLIC_ORIGIN`** or **`https://riffsync.tv`** fallback). Episode art URLs that are root-relative in catalog data are prefixed with **`{origin}`** before emission; already-absolute **`https:`** values pass through unchanged.

**Ephemeral/authenticated/receiver-only routes** (**`/room/:roomId`** and its experimental variant, **`/lobby`**, **`/account`**, **`/admin/*`**, **`/cast/receiver`**, **`/privacy/data-removal`**, **`/auth/callback`**, **`/admin/auth/callback`**) keep the generic app-shell **`<title>RiffSync</title>`** and description plus a **`noindex`** robots meta tag — **no** per-instance head tags.

Meta titles/descriptions/OG for **`/watch/:id`** always use the catalog **`title`** field, never TMDB's **`title`**/**`original_title`** (**`business_logic/domain_model.md`** Invariant 9).

### Home route document outline (sr-only H1)

**`/`** renders **exactly one** static, visually-hidden (**`sr-only`**) **`<h1>RiffSync</h1>`** as the first child inside the home page content wrapper, immediately **before** **`HomeHeroBanner`** on the happy path — matching **`SITE_DOCUMENT_TITLE`** and the generic app-shell **`<title>RiffSync</title>`** — rather than promoting the rotating hero carousel's **`h3`** slide title or the M29 prerender **`<title>RiffSync - Watch Parties</title>`**. A per-slide dynamic H1 would shift the document outline on every autorotate, which is a worse crawler and screen-reader signal than one stable heading. **`HomePage`** loading, error, and empty-catalog branches still render the same single sr-only H1 at the top of the route output so **`/`** never exposes zero or duplicate document-level H1s. The hero, carousel, and spotlight banner keep their **existing visible markup and heading levels** (**`h3`**/**`h4`**) unchanged — no visible layout change.

### Catalog hub and subcategory presentation

- **Hub entry links (on `/catalog`):** Four large **text** navigable links (no imagery or backdrop tiles this capability), placed in the page-header subtitle slot above title-search / sort and the retained mixed/all-titles grid, in this order: **MST3K** -> **`/catalog/mst3k`**, **Community** -> **`/catalog/community`**, **Riff Material** -> **`/catalog/riff-material`**, **Movie Night** -> **`/catalog/movie-night`**. Display names only - no helper microcopy under the links.
- **Subcategory page header:** Visible category display name as the page **H1** (or equivalent primary heading) in a Streamlab-style header block with the route-fixed subtitle underneath it.
- **Subcategory subtitles:** **MST3K** uses **`"Push the button, Frank"`** with quote characters. **Community** uses **Community Made Riffs**. **Riff Material** uses **Cheesy Flicks Ready to Riff**. **Movie Night** uses **Pull the Family Together for a Movie Night**.
- **Search / sort chrome:** Subcategory pages keep the same title-search and sort controls as the hub. Search and sort operate within the route-fixed subcategory `catalogs` set (not a second catalog picker and not an unfiltered catalog).
- **MST3K tag pills:** **`/catalog/mst3k`** renders **Era** and **Season** pill groups below the title search. Pill options are derived from distinct **`Era:*`** and **`Season:*`** tags on the loaded, YouTube-linked MST3K rows after the route's fixed **`mst3k`** catalog constraint. Each pill shows the full tag text (for example **`Season: 1`**). Multiple selected values within one namespace OR together; selected Era and Season namespaces combine with AND; title/tag/label search combines with AND against selected pills. Hub and non-MST3K subcategory routes do **not** render these pill groups.
- **Grid:** Reuse **`CatalogGridCard`** and existing empty-catalog presentation for zero-row filtered views. Era appears only as existing per-card metadata where applicable — not as on-page filter chips on subcategory routes.
- **Nav chrome:** Main-nav **Catalog** parent navigates to **`/catalog`**; a dropdown lists the same four subcategory destinations in the same order and display names as the hub entry links (no helper microcopy). **`other`** is omitted from hub links, dropdown, and subcategory chrome.

### Catalog card image alt text

**`CatalogGridCard`** poster **`<img>`** elements use **`alt={episode.title}`** (catalog **`title`** field only — Invariant 9) instead of today's empty **`alt=""`**. Do **not** append **`poster`**, catalog labels, or experiment numbers to alt text; the adjacent visible **`h3`** link already carries the title for sighted users. Applies on **`/catalog`** and all four subcategory routes. Additive accessibility/SEO fix — no new interaction pattern, no visible layout change. **`HomeMovieCard`** on home rows is unchanged in this slice.

### Catalog card browse metadata

**`CatalogGridCard`** renders **`episode.tags`** in the card metadata area in the exact order received from the API. Tag strings are displayed as provided (namespace-agnostic; no hard-coded **`Season`**, **`Era`**, or **`Genre`** rendering rules). When **`episode.tags`** is empty, the card shows no fallback playback-advisory copy (**`Ads may appear`**, **`Premium-friendly`**, **`Likely ad-supported`**, or equivalent). Catalog cards do **not** show a visible not-embeddable message; **`embedAllows === false`** continues to gate in-app embed affordances through **`EpisodeTileActions`** / watch routing only.

### Admin catalog playback host

Staff **`/admin/catalog`** form gains a **Playback host** selector per episode: **YouTube** | **Custom**.

| Host | Fields | Contract |
| --- | --- | --- |
| **YouTube** | Existing YouTube watch URL / video id fields | Unchanged validation intent; **`embedAllows`** applies to YouTube in-app embed path. |
| **Custom** | **HTTPS** movie-page URL (**`customPlaybackUrl`**) | Required when host is Custom (**max 2048 chars**, NFC-normalized at save). YouTube fields **optional** (may remain for thumbs/metadata). Switching host **preserves** opposite-host fields unless staff explicitly PATCH them (including **`null`**). |

**Form layout (create + edit):**

| Order | Control | Contract |
| --- | --- | --- |
| 1 | **Episode identity** fieldset | Unchanged (`id` create-only, experiment #, title, catalog, tags, labels). |
| 2 | **Playback** fieldset | **Playback host** labeled select: **YouTube** (`youtube`) \| **Custom** (`custom`). Default **`youtube`** on create and when legacy row omits host on load. |
| 3 | Host-conditional URL | **YouTube:** **YouTube watch URL** input (same validation as today — valid watch URL or empty). **Custom:** **Custom playback URL** (`type="url"`) — required before save; client rejects empty, non-HTTPS, or NFC-normalized length **> 2048** with **`customPlaybackUrl must be an HTTPS URL (max 2048 characters)`** (same detail string as Lambda). |
| 4 | **Featured on home page** | Unchanged. |
| 5 | **Reconcile (read-only)** | Edit only; unchanged. |
| 6 | **Operator hints** | Unchanged placement; **`embedAllows`** stays here. When host is **Custom**, helper copy states **`embedAllows` gates YouTube in-app embed only** — it does not block Custom playback. YouTube watch URL and **`embedAllows`** remain editable on Custom rows (optional enrichment). |

**Host-switch UX:** Toggling **Playback host** in the form **does not clear** the other host's URL fields in local state. Save sends **`playbackHost`** when changed; server PATCH merge retains stored opposite-host attributes unless the body explicitly sets them.

**Admin catalog list:** Playback-host column or badge on **`AdminCatalogListPage`** is **optional** and **out of scope** for the admin-form issue — follow-up if staff need list-at-a-glance host filtering.

### Solo watch and party capture (`/watch/:catalogEpisodeId`)

| Concern | Contract |
| --- | --- |
| **YouTube-host** | Existing **`SoloYouTubePlayer`** / YouTube iframe path when **`playbackHost` is `youtube`** and YouTube embed rules allow in-app playback. |
| **Custom-host** | Same page shell; **generic HTTPS iframe** replaces YouTube player, pointing at **`customPlaybackUrl`**. |
| **Party capture** | URL remains **`{origin}/watch/{catalogEpisodeId}?partyCapture=1`**; inner player swaps to generic iframe for Custom. **Tab-sharing workflow unchanged** — host shares this RiffSync tab via browser picker + WebRTC. |
| **Guests** | Unchanged — watch host screen share; no direct Custom URL chrome. |
| **Iframe failure** | Honest blocked/error state; no special X-Frame-Options fallback UI beyond staff embeddable-URL policy. |
| **Custom blocked copy** | Missing URL: **`Playback unavailable — no custom playback URL is linked for this catalog entry.`** (`role="status"`). Embed/load failure: **`This page could not be embedded in RiffSync. Open the movie page in a new tab.`** with **`customPlaybackUrl`** link (`target="_blank"`, `rel="noreferrer"`). |
| **Custom player component** | Dedicated **`SoloCustomIframePlayer`** (`apps/web/src/components/watch/SoloCustomIframePlayer.tsx`) — **not** an extension of **`SoloYouTubePlayer`**. Reuses **`.riffsync-solo-player`**, **`.riffsync-solo-player__frame`**, **`.riffsync-solo-player__chrome`** for layout parity in solo and **`?partyCapture=1`** modes. |
| **Custom iframe a11y** | **`<iframe title={episode.title}>`** (catalog **`title`** only). |

### Room host presentation (`/room/:roomId` host branch)

Host-only **presentation shell** inside **`RoomPlaybackPanel`** (Theater mode stage). Guests continue the existing guest **`<video>`** WebRTC **`host_screen`** path — no direct Custom URL load for guests.

| Concern | Contract |
| --- | --- |
| **Surface** | **`RoomPlaybackPanel`** host branch, **`riffsync-room-page__player-shell`**, within **`/room/:roomId`** stage (standard and expanded layouts). |
| **Custom-host** | When **`playbackHost === 'custom'`** and trimmed **`https://`** **`customPlaybackUrl`** is present, render **`SoloCustomIframePlayer`** in the host player shell using room snapshot mirrors (**#392**) with catalog-query fallback when mirrors are absent. Same iframe attrs and blocked copy as solo watch (**#393**). |
| **YouTube-host** | Unchanged capture workflow: external YouTube tab when not embeddable; RiffSync party-capture watch tab when embeddable. No Custom iframe. Existing host capture preview **`<video>`** when **`captureStream`** is active. |
| **Capture vs embed** | When host **`captureStream`** is **inactive**, player shell shows presentation embed (Custom iframe). When **`captureStream`** is **active**, player shell shows capture preview **`<video>`**; presentation embed is **hidden**. Share controls and intro copy remain available in the host placeholder region. |
| **Separate DOM from capture tab** | Party-capture tab (**`/watch/:id?partyCapture=1`**) and in-room presentation are **separate iframe instances** in separate documents. Both reuse **`SoloCustomIframePlayer`** — not one shared DOM mount across tabs. |
| **React ownership** | Presentation embed is rendered by **`RoomPlaybackPanel`** React tree. **`TheaterPlayback.setYoutubeMountElement`** / dataset metadata is **not** the Custom presentation path; WebRTC video binding stays in **`TheaterPlayback`**. |
| **Episode retarget** | When host **`PATCH`** changes **`catalogEpisodeId`**, presentation embed updates from refreshed snapshot **`playbackHost`** / **`customPlaybackUrl`** mirrors without remounting the room session. |
| **Guest path** | Unchanged — guest **`RoomPlaybackPanel`** branch binds SFU **`host_screen`** to **`<video>`** only. |
| **Cast MVP** | Cast receiver continues **`host_screen`** consume; no Custom iframe on TV (**`viewer-local-cast.spec.md`**). |

### Catalog card actions (`EpisodeTileActions`, hub/subcategory grids, home rows)

Public browse surfaces list episodes that are **playable in-app** (host-aware). Tile actions mirror today's YouTube-linked posture: both **Watch Solo** and **Start Party** are **enabled** when playable and **disabled** when not.

| Concern | Contract |
| --- | --- |
| **Shared helper** | **`apps/web/src/catalog/catalogPlayback.ts`**: **`readCatalogPlaybackHost`**, **`episodeIsPlayableInApp`**, **`catalogEntriesPlayableInApp`**. Replaces **`episodeHasYoutubeLink`** / **`catalogEntriesWithYoutubeLink`** on fan browse paths (**#396**). SEO indexability uses **`apps/web/src/catalog/catalogSeo.ts`**: **`episodeIsIndexableForSeo`**, **`catalogEntriesIndexableForSeo`** (**#397**). |
| **Custom-host playable** | **`playbackHost === 'custom'`** (read-time default **`youtube`** when missing) **and** trimmed **`customPlaybackUrl`** starts with **`https://`**. **`embedAllows`** does **not** apply. |
| **YouTube-host playable (browse)** | Non-empty trimmed **`youtubeVideoId`** — same inclusion rule as legacy **`episodeHasYoutubeLink`**. **`embedAllows`** does **not** exclude rows from browse lists. |
| **YouTube-host in-app embed** | **`embedAllows === false`** continues to gate **solo watch** and external-tab messaging only (**`SoloWatchPage`**); tile actions may remain enabled (unchanged). |
| **Tile actions** | **`EpisodeTileActions`**: **`Watch Solo`** links to **`/watch/:id`** when playable; **`Start Party`** calls **`POST /v1/rooms`** when playable and signed in. When **`!episodeIsPlayableInApp`**, both controls render **disabled** (visible, not navigable). |
| **Card chrome** | **`embedAllows === false`** advisory copy on **`CatalogGridCard`** applies to **YouTube-host** rows only. Custom-host rows show **no** embedAllows message. **No** public playback-host badge in MVP (**optional follow-up**). |
| **Empty browse copy** | When the loaded catalog has rows but none are playable in-app: **`No episodes are available for in-app playback yet.`** When the catalog is empty: **`No episodes in the catalog yet.`** |
| **Surfaces** | **`CatalogPage`** hub grid, **`HomePage`** carousel/spotlight/era/popularity rows, and future M32 subcategory shells reuse the same helper + **`EpisodeTileActions`**. |

### Public site SEO indexability (`catalogSeo.ts`, issue **#397**)

Build-time sitemap, prerender, and verify scripts filter watch routes with a **host-aware indexable predicate** separate from browse playability.

| Concern | Contract |
| --- | --- |
| **Module** | **`apps/web/src/catalog/catalogSeo.ts`** — **`readCatalogPlaybackHost`**, **`episodeIsIndexableForSeo`**, **`catalogEntriesIndexableForSeo`**. |
| **Custom-host** | Never indexable — excluded from **`sitemap.xml`** and **`dist/watch/{id}/index.html`** even when optional **`youtubeVideoId`** remains for artwork. |
| **YouTube-host** | Indexable when trimmed **`youtubeVideoId`** is non-empty (same effective set as legacy **`episodeHasYoutubeLink`** for YouTube-host rows). |
| **Consumers** | **`generateSeoArtifacts.ts`**, **`generate-seo-artifacts.mjs`**, **`prerender-indexable-routes.mjs`**, **`verify-seo-artifacts.mjs`**. |
| **Out of scope** | Static head-tag table marketing copy refresh when Custom episodes exist (deferred follow-up). |

### `/watch/:catalogEpisodeId` heading

The existing **`sr-only`** **`<h1>{episode.title}</h1>`** on **`SoloWatchPage`** already satisfies the document-outline contract; this initiative adds only head-tag metadata (title/description/canonical/OG/Twitter per the table above) — no markup change to the existing heading.

## Chat & scrollback (watch party room)

- **Surface:** **`/room/:roomId`** sidebar **Chat** tab (not solo watch).
- **Layout:** Message list occupies a **bounded flex region** inside the sidebar; **only the log scrolls** (`overflow-y: auto`). Compose toolbar and tabs stay fixed. **Stick-to-bottom:** new messages auto-scroll when the user is within **48px** of the bottom (same threshold as implementation in bounded-log work). **Jump to latest:** when the user has scrolled up beyond that threshold, show a **button** above the compose bar after one or more lines arrive while they are reading history; label **"New messages"** (append **`(N)`** when **N > 1** pending). Activating the control scrolls to the latest line, clears the pending count, and hides the control. Manual scroll back within **48px** of the bottom also clears pending without requiring the button. Programmatic scroll uses **`behavior: 'smooth'`** unless **`prefers-reduced-motion: reduce`**, then **`'auto'`**.
- **Ephemeral** chat: **in-memory / UI scrollback** capped (~**100** recent messages in client; align with **`docs/architecture.frontend.md`**). **No durable transcript** from server—reload clears messages, reactions, and GIF posts (**storage cost**).
- **Rich content (signed-in send):** **Unicode emoji** via compose picker; **Giphy GIF** posts (inline render, bounded dimensions); **emoji reactions** aggregated per message. **Anonymous guests** may **view** all rich content but **cannot** send or react (**`authorization.md`**).

### Compose media picker (emoji / GIF tabs, #258)

Tabbed popover on chat compose (**`ChatComposeMediaPicker`**) — **Emojis** and **GIF** tabs share one shell above the compose row.

| Concern | Contract |
| --- | --- |
| **Stable outer height** | Popover **outer height must not change** when switching tabs or when Giphy transitions between empty, loading, error, and results states. Tab switches must not jitter the compose row. |
| **Fixed tab body** | Content below the tab bar uses a **fixed height of 16.5rem** (matches **`emoji-picker`** body). Both tab panels fill this region. |
| **Giphy scroll** | Search field, status copy, attribution, and results grid render **inside** the fixed panel; the results grid **scrolls internally** (`overflow: auto`) — it must **not** expand the popover when results load. |
| **Viewport cap** | Shell keeps **`width: min(100vw - 1rem, 18.5rem)`** and **`max-height: min(70vh, 24rem)`**; fixed body height must fit within the cap on typical viewports. |
| **Out of scope** | Message **reaction** emoji popover (**`ChatReactionPicker`**) — separate component; not governed by this table. |
- **Avatars:** Signed-in fans may upload **one** profile image (server-retained). Chat rows show a **thumbnail beside display name** using a **public HTTPS** avatar URL when set; guests without avatars use a neutral fallback glyph.
- **Typing indicator:** When a signed-in fan sends **`typing_start`** on the room WebSocket, other participants see an **ellipsis** affordance associated with that sender in the chat log (e.g. **"DisplayName is typing…"** or inline ellipsis row). **Typing start** also marks the sender **active** on the **People** tab. Indicator clears on send, **`typing_stop`**, disconnect, or TTL expiry (exact TTL tier TW). **Do not** imply message archive — typing is ephemeral like chat scrollback.
- **Join/leave system lines:** When a **signed-in fan** connects or disconnects, other participants see a muted **system line** in the chat log (e.g. **"DisplayName joined"** / **"DisplayName left"**). **Anonymous guests** produce **no** system line. Lines are **ephemeral** (in-memory scrollback only) and **not** replayed from server on refresh or **`presence_request`**.
- **People tab presence:** Each roster row shows **online** (connected) by default. Rows also show an **active** badge when server **`active`** is true (derived from **`lastActiveAt`** within the **2-minute** window). **Host** row follows the same badge rules. **Active badge visual:** muted green dot plus **Active** text chip (same visual weight as **Host** badge); **`aria-label`** includes active state. Badges are **visual only** on **People** — not duplicated as stage chrome for mic-only participants except **speaking** (below).
- **People tab producer state (M23):** Each roster row shows **camera** and **microphone** affordances derived from live SFU producer lifecycle per **`sessionId`**: cam **on** when video producer live; mic **on** when audio producer live; mic **muted** when audio producer **`paused`**; mic **off** when no audio producer. Updates within one React commit of **`newProducer`** / **`producerClosed`**. Not persisted server-side.

## Friends and direct messaging

Friends and 1:1 DMs are a **signed-in fan** social layer beside public room chat. They do **not** replace the room **People** roster. Guests and signed-out visitors get **no** friends manage or DM send chrome.

### Auth gate and main-site chrome

| Concern | Contract |
| --- | --- |
| **Signed-out** | Main-site friends affordance is **hidden** (not disabled stub). Existing **Sign In** / **Account** primary-nav behavior remains; the person icon is **not** a silent Account replacement. |
| **Signed-in (non-room)** | Main site header shows the design-template **person icon** friends entry (`gen-account-holder` / `#gen-user-btn` / `fa-user` red circular treatment under `docs/riffsync-design-template/Main File/red-html`) in the header info strip (`gen-header-info-box`), **sibling** to the navbar toggler — **not** inside **`gen-main-menu`**. Activating it opens a **friends dropdown**. The **Account** nav link remains in the primary menu. |
| **Compact room header** | Watch-party compact header does **not** carry the person-icon friends control. Room friends capabilities live in the right-column **Friends** surface only. |
| **Outbound invite send** | **Not** on the main-site dropdown. Signed-in fans send friendship requests from the watch-party **People** roster context menu (see **`interaction_flow.md`** → *Add friend from People roster*). |

### Friends list surfaces (main dropdown + room Friends)

Both surfaces present the same capabilities for the authenticated fan:

- **Accepted friends** rows: display name (and avatar when available from **FanProfiles**), **online** indicator (**Online in a watch party** label or equivalent accessible name plus muted green dot — never People **Active** chip wording), unread dot when **`hasUnread`**, primary control opens DM, **Remove friend** icon button opens confirm dialog.
- **Pending friendship requests** are visible in the lifecycle UI: inbound requests expose **accept** and **decline**; outbound pending is visible as pending (not yet a friend row with DM). Durable friendship chrome appears only after accept.
- **Empty friends:** honest empty copy (never a silent blank). Distinct from “no pending requests” when that section is shown. Normative strings: zero accepted and no pending → **No friends yet.**; pending-only → **No friends yet.** with pending section visible.
- **Loading / error:** skeleton or inline recoverable status; no infinite retry storms (same posture as catalog rate/cap toasts). Load failure → **Could not load friends. Try again.** with retry control.
- **Dropdown shell:** **`max-height: min(70vh, 24rem)`** internal scroll; width **`min(100vw - 1rem, 22rem)`**; anchored under person icon on desktop; same panel on mobile with person icon in header strip (not inside hamburger menu).

### Friends online (distinct from People active)

| Signal | Surface | Meaning |
| --- | --- | --- |
| Friends-list **online** | Friend rows (main dropdown + room Friends) | Friend currently holds **RoomPresence** in **any** RiffSync room. Not platform-wide browsing presence, not last-seen, not same-room-only. |
| People **online** | Room **People** roster | Connected to **this** room (unchanged). |
| People **active** | Room **People** roster | **`lastActiveAt`** within the **2-minute** window (unchanged **Active** chip). |

**Anti-pattern:** Do **not** reuse the People **Active** chip label, copy, or accessible name on friend rows. Friends online must use distinct naming so assistive tech and sighted users do not confuse room engagement with “in a room somewhere.”

### Unread presentation

- Friends list surfaces unread DM activity so new messages are visible without opening every thread.
- **Viewing** the updated messages in that friend’s DM panel **clears** unread via **`POST /v1/dm/threads/{pairKey}/read`** when the user **views** those messages (server-authoritative cursor; badge follows). History **GET** alone does not clear.
- **Boolean dots only** (no numeric counts): per-friend dot on row when **`hasUnread`**; aggregate dot on person-icon trigger when **`anyUnread`** (#361). Room **Friends** tab label aggregate dot follows the same rule (**#364**).

### Direct message panel

- **Visual / interaction language:** Reuse room-chat patterns where contracts allow: bounded message log scroll region, stick-to-bottom, jump-to-latest when reading history, compose row placement. Do **not** invent a separate chat aesthetic.
- **Durability (empty states):** DM history is **account-lifetime durable** until explicit delete or account closure. Opening a thread after reload **must not** present the room-chat ephemeral empty posture (“reload cleared transcript”) as the happy path. An empty DM thread means **no messages yet** (normative copy: **No messages yet. Say hello.**) or history inaccessible after remove, not “ephemeral scrollback was discarded.”
- **Panel placement:** DM opens as a **viewport-anchored overlay** (right-side panel on desktop; full-width sheet on narrow viewports), not inline inside the dropdown list.
- **Compose v1:** **Text-only** compose (**`kind: text`**, max **2000** chars); no emoji/GIF/reaction picker in DM v1 (room chat pickers stay room-scoped).
- **Eligibility:** Compose and history are available only while an **active friendship** exists with that peer.
- **After remove-friend:** For both parties, the prior 1:1 thread is **closed/hidden**: no compose, no history access. Close the DM panel or replace content with **This conversation is closed.** (no compose). Re-friending may create a new edge; default UX does **not** restore prior history unless a later product decision says otherwise.
- **Remove-friend confirm:** Each accepted friend row exposes **Remove friend**; activating opens confirm dialog — title **Remove friend?**, body **This removes {displayName} for both of you. You will not be able to message each other unless you become friends again.**, actions **Cancel** / **Remove friend** (destructive).
- **Guests:** No DM compose or history chrome.

### Watch-party Friends column

- **`riffsync-room-page__chat-column`** gains an additive **Friends** panel/tab alongside **Chat**, **People**, **Room**, and **Profile**. Normative tab order: **Chat → People → Friends → Room → Profile** (#364). The **Friends** tab renders **only** when the viewer holds a fan JWT; anonymous guests do **not** see the tab (not a disabled stub).
- Public room **Chat** and private **DM** remain available in the same party session without leaving the room. Switching sidebar tabs does **not** tear down **`FanDmSession`**; returning to **Friends** restores the list view or the open nested DM thread.
- **People** roster semantics and chrome remain unchanged; Friends must not merge into or replace People.
- **Friends tab label:** Boolean aggregate unread **dot** on the **Friends** tab when **`anyUnread`** (#361), same rule as the main-site person-icon trigger.
- **In-column DM (#364):** Opening a friend's DM from the room Friends list replaces the list with a **nested thread view** inside **`riffsync-room-page__tab-panel--friends`**: header row with **Back to friends** control + peer display name, bounded message log, stick-to-bottom / jump-to-latest, text-only compose. This is **not** a viewport overlay (main-site dropdown uses overlay because the trigger is a compact header control).
- **Copy parity:** Same normative strings as main-site (#363): **No friends yet.**; load failure **Could not load friends. Try again.**; DM empty **No messages yet. Say hello.**; closed **This conversation is closed.**

### Expanded View / Cast

- Expanded overlay and Cast receiver remain **without** a full sidebar tab strip. Friends list/manage and DM open stay **sender-side normal-room** (or main-site) surfaces: **exit expanded** to the normal room sidebar **Friends** tab. **No** compact DM affordance or Friends entry is added to the expanded overlay or Cast receiver chrome (#364).

## Watch party participant AV (`/room/:roomId`)

### Shell boundaries

- **`riffsync-room-page__stage`** holds shared movie playback, participant video surfaces (Theater camera row or Video Chat grid), host tab-capture chrome, and **video-relay** drawer status.
- **`riffsync-room-page__chat-column`** holds sidebar tabs (**Chat**, **People**, **Room**, **Profile**, and additive **Friends** for signed-in fans), participant AV toggles, message log / DM panel content, compose, and **chat** drawer status.
- **`/room/:roomId`** renders as a full-viewport room shell with no site header or footer. Users leave the party through the room **Leave Party** action to return to other RiffSync pages.
- **Theater room mode** (host layout policy) is distinct from **theater fullscreen** (wrapper **`requestFullscreen`**) and from **expanded view** (in-page stage layout). UI copy must not conflate the three.
- **`RoomPage`** is a **thin shell**; realtime drawers are owned by **`ChatSession`**, **`SfuMediaSession`**, and **`TheaterPlayback`** (**`runtime/execution_model.md`**). Presentation contracts describe what users see regardless of module wiring.

### Media path (SFU-only)

- **All environments** (local dev, CI, prod) use the **mediasoup SFU** path for host screen-share and participant A/V. **No mesh WebRTC UI** — remove production mesh warnings, mesh negotiation status strings, and mesh-only guest playback affordances.
- Missing SFU/TURN configuration surfaces an **honest deployment/configuration error** (not a fallback path selector). Stable codes **`SFU_RELAY_URL_MISSING`**, **`LOCAL_SFU_UNREACHABLE`**, **`SFU_RELAY_UNREACHABLE`** map to page **`role="alert"`** and video-relay status (**#137**, **`error_state.md`**). Errors persist through reconnect backoff until signaling **`session.ready`** succeeds.

### Realtime drawer status (separate surfaces)

Chat (room WebSocket) and video relay (SFU signaling + consumers) expose **independent, simultaneous** status when lifecycles diverge. **Do not** consolidate into one banner that implies both planes failed (e.g. avoid combined copy like "Reconnecting chat… Video may pause briefly." when only chat is down).

| Drawer | Placement | When shown |
| --- | --- | --- |
| **Chat** | Top of **`riffsync-room-page__chat-column`**, above tabs/toolbar — **`#riffsync-chat-drawer-status`** (reuse **`riffsync-room-page__ws-banner`** styling) | **`getDiagnostics().drawers.chat.state`** is **`reconnecting`** or **`degraded`**, or chat-plane send is blocked |
| **Video relay** | Stage playback region — **`#riffsync-video-relay-status`** (guest **`riffsync-muted`** status line and/or host **`riffsync-room-page__share-status`**) | **`getDiagnostics().drawers.sfuSignaling.state`** is **`reconnecting`** or **`degraded`**, config-class SFU error active, or guest host-screen FSM is non-**`running`** (see **`interaction_flow.md`**) |

- **Both banners may appear at once** when each drawer is independently unhealthy; each clears when **that** drawer returns to **`connected`** (or equivalent healthy state per **`getDiagnostics()`**).
- **Hard failures** stay drawer-scoped: chat-plane errors near chat/compose; SFU/toggle failures at AV toggles or stage **`role="alert"`** per **`error_state.md`** — not merged into a single realtime toast.

### Drawer status copy (#140 / #150)

Normative fan-visible strings when **`getDiagnostics()`** reports drawer lifecycle states. Guest **host-screen** playback-region copy remains in **`interaction_flow.md`** (SFU three-state model); these strings cover **drawer health** only.

| Drawer | Lifecycle | Copy |
| --- | --- | --- |
| **Chat** | **`reconnecting`** | Reconnecting chat… |
| **Chat** | **`degraded`** | Chat unavailable. Try refreshing the page. |
| **Video relay** | **`reconnecting`** | Video relay reconnecting… |
| **Video relay** | **`degraded`** | Video relay unavailable. Try refreshing the page. |
| **Either** | **`connected`** (recovery) | Clear that drawer's status banner (no success toast). |

- **Both banners may appear at once** when each drawer is independently unhealthy; each clears when **that** drawer returns to **`connected`**.
- **Host screen-share idle/negotiating** states (guest waiting for host share) use the **video-relay** surface, not the chat banner.
- **Anti-pattern (#147 / #150):** video-relay resolvers must **not** branch on chat WS state (e.g. **`chatWsDisconnected`** in **`sfuRelayStatusCopy.ts`**). Retire **"Reconnecting chat… Video may pause briefly."** — chat reconnect belongs on the chat banner only.

### M19 room shell ship gate (#150)

Milestone **M19** verifies the separate surfaces above ship in the thin **`RoomPage`** shell:

| Surface | Implementation owner | Verification |
| --- | --- | --- |
| Chat drawer banner | **`RoomPageSidebar`** + **`drawerErrorPresentation.ts`** (**#186**, **#207**) | Renders from **`drawers.chat`** only — never from SFU diagnostics |
| Video-relay banner | Stage status hooks + **`sfuRelayStatusCopy.ts`** (**#201**, **#186**) | Renders from **`drawers.sfuSignaling`** + config errors + guest host-screen FSM — **no** chat WS input |
| Simultaneous display | **`RoomPage`** / hooks | Both banners visible when each drawer is independently unhealthy; each clears on that drawer's recovery |
| Copy source | **`drawerErrorPresentation.ts`** | Lifecycle strings from **Drawer status copy** table above; error codes from **`error_state.md`** |

Peer issues **#201** (retire combined copy), **#207** (chat banner), **#186** (presentation module) implement the wiring; **#150** is the M19 integration parent.

### M19 guest host-screen status ship gate (#151)

Milestone **M19** verifies SFU-only guest host-screen copy in the stage playback region (mesh FSM strings retired):

| Surface | Implementation owner | Verification |
| --- | --- | --- |
| Guest FSM copy | **`sfuRelayStatusCopy.ts`** + **`TheaterPlayback`** snapshot | **`idle`** → **Waiting for host to share…**; **`verifying_media`** → **Connecting to video relay…**; **`running`** → no status line |
| DOM anchor | **`RoomPlaybackPanel.tsx`** | Guest status line exposes **`id="riffsync-video-relay-status"`** with **`role="status"`** |
| Placeholder dedupe | **`RoomPlaybackPanel.tsx`** | No second not-sharing paragraph when FSM idle copy is shown |
| Chat decoupling | Peer **#201** / parent **#150** | **`resolveGuestVideoRelayStatusLine`** has **no** **`chatWsDisconnected`** input |
| Share-stop idle | Peer **#198** / **#146** | After **`share_state: stopped`**, FSM **`idle`** and status line match **`interaction_flow.md`** |

Sub-issues **#210–#212** implement wiring and tests; parent **#151** tracks M19 exit for this surface.

### Chat compose inline feedback (#149)

- When **`getDiagnostics().drawers.chat.lastErrorCode === 'CHAT_SEND_DROPPED'`** or chat drawer is **`reconnecting`** / **`degraded`**, render an inline **`role="status"`** line **below** the compose row (reuse **`riffsync-room-chat-giphy-status`** error styling).
- Copy: **`error_state.md`** **`CHAT_SEND_DROPPED`** template — "Message could not be sent. Check chat connection and try again."
- **Do not** disable compose solely because SFU video-relay status is unhealthy when chat drawer is **`connected`**.
- Clear inline feedback when chat drawer returns **`connected`** without **`lastErrorCode`**.

### Host control bar (below stage)

- Visible only when **`JWT.sub === hostSub`**.
- Flex row directly below the stage: **room layout** segmented control (**Theater** default, **Video Chat** alternate) on the left; **Disable room A/V** kill switch on the right. Wraps on narrow widths; extension point for future host share controls.
- **Video Chat** is a normal A/V room mode. Do not label it **Beta** or **Experimental**. When **AV kill switch** is on, **Video Chat** selection is unavailable or inert until AV is re-enabled.

### Participant camera/microphone toggles

- Two controls (**Camera**, **Microphone**) sit **above chat compose** in the sidebar when the viewer has a **fan JWT** (signed-in fan or host using participant A/V).
- **Not rendered** for **anonymous guests** — no toggle chrome and no sign-in overlay at this placement; guests remain subscribe-only for participant AV and use chat compose's existing **Sign In to Chat** overlay only for chat send.
- When rendered, toggles stay **visible on every sidebar tab** (**Chat**, **People**, **Room**, **Profile**, and **Friends** when that tab is present) — session-level AV controls, not tab-scoped.
- Each control pairs an icon with a visible text label and reflects explicit on/off state for the local publisher.
- When the host has disabled room AV, toggles **remain visible but disabled** with explanation copy: **"The host turned room A/V off."** (associated via **`aria-describedby`**).

### Theater room mode

- Shared movie player (host tab-capture / guest inbound screen-share stream) stays **primary**.
- On viewports **≥ 992px**, a **horizontal camera row** sits **directly below the movie** within the stage region (not in the chat column and not over the movie).
- The row lists **video-on** participants only, ordered by **stable roster join order** (same source as **People** tab).
- **Speaking affordance:** when a participant's mic is unmuted and client VAD crosses threshold (**`execution_model.md`** M23 params), show a **speaking border or glow** on that participant's row tile. **Mic-only** participants **do not** get row tiles; their speaking state appears on **People** roster rows only. Under **`prefers-reduced-motion: reduce`**, use a static high-contrast border instead of animated glow.
- **Mic-only** participants are audible but **not** shown in the row (identity via **People** tab and chat). **No** avatar chips or audible-only tile badges.
- The **local publisher** appears in the row when their camera is on, labeled **You** (live preview tile).
- The **host** appears in the row when their camera is on, same as other signed-in fans.
- When zero video-on participants, the row container is **not rendered** (no empty chrome) and the movie uses the available stage height.
- The camera row scrolls horizontally or wraps according to responsive layout rules; it must not overlay or obscure the movie.
- Participant **microphones** are audible alongside movie audio while AV is enabled.

### Video Chat room mode

- The movie player region is **replaced** by a **grid** of **video-on** participants on viewports **≥ 992px** (`auto-fill` tiles, **16:9**, scroll when overflow).
- **Speaking affordance** on grid tiles matches Theater strip rules (border/glow when talking and video is on).
- **Mic-only** participants are **excluded** from the grid; audio is still heard; speaking state on **People** tab rows only. **No** supplementary stage chrome for mic-only.
- The **local publisher** appears in the grid when their camera is on, labeled **You**.
- The **host** appears in the grid when their camera is on.
- When zero video-on participants, show centered copy: **"No cameras on yet. Mic-only participants are still audible."**
- Entering **Video Chat** **fully stops** active host tab-capture; returning to **Theater** requires the host to activate **Share Source Tab** again (no warm-resume). Reuse the existing host feedback/status region in stage chrome for **Share Source Tab** prompt when capture is inactive after a Theater return.

### Layout authority and fan-out

- Only the host may change **room mode** or **AV kill switch**; changes are **host-authoritative** and reflected immediately for all participants (no guest confirm step).
- Non-host participants see the active layout but cannot change mode; they **infer mode from layout** — no read-only mode badge or pill in stage chrome in MVP.
- During Theater ↔ Video Chat swap, show brief inline status **"Updating room layout…"** in the stage until consumer attachment reflects the new mode or **3s** elapses (then show empty/sparse state). Cross-fade **200ms** opacity on swap unless **`prefers-reduced-motion: reduce`**, then **instant cut**.

### Participant video tile lifecycle

- Row/grid tiles exist **only** while a **live video** consumer is attached for **`participant_av`** at that **`sessionId`**.
- On **`producerClosed`** for video (camera off, leave, kill switch, session teardown): **remove the tile promptly** — detach **`<video>`**, clear tile state, do **not** leave a **frozen last frame**. Frozen frames are a **contract violation**.
- **Removal timing (#142):** After consumer **`detach`** updates **`videoConsumers`**, the tile must leave row/grid within **one React commit**. The **`<video>`** element must set **`srcObject = null`** before the next paint (cleanup on unmount or stream change).
- **Removal animation (#142):** **Instant DOM detach** for remote tiles and local **You** preview — no fade-out in MVP. **`prefers-reduced-motion`** does not alter behavior (already instant).
- **Mic-only** after camera-off: no tile; audio continues per mode (theater client mix or Video Chat audio path). Visibility rules **unchanged** from pre-hardening contracts.
- **`share_state: stopped`:** guests lose **host-screen** attachment only; participant tiles and mic audio **persist** when SFU plane is healthy (**`interaction_flow.md`**).

### Theater audio (client-side default)

- **Theater** participant microphones and host movie audio are mixed **client-side** via **Web Audio API** at equal gain (**1.0**) — server-side mix is **deferred**.
- **`AudioContext`** suspend / autoplay fragility is a known runtime risk (**`runtime/execution_model.md`** **`THEATER_AUDIO_SUSPENDED`**). Recovery affordance (implicit gesture vs explicit control) is tier TW below.

### Errors and limits

- Device permission denied, missing devices, and SFU/relay failures use **inline recoverable** messaging consistent with existing host **`captureErr`** / guest status patterns — no silent failure.
- When SFU publisher caps block publish, show a **visible hard-fail** error on toggle (no auto-degrade in MVP).

### Viewport scope

- **Desktop (≥ 992px):** Theater camera row below movie; Video Chat uses full-stage grid; host control bar uses full flex row.
- **Narrow (< 992px):** honest **reduced** layout — participant video surfaces render as a **single horizontal scroll row** of tiles positioned **below** the movie primary region (Theater) or **below** the grid primary region (Video Chat). Toggles and host bar remain usable; do not imply desktop layout parity.

### iOS virtual keyboard (stacked room layout, #240)

When **iOS Safari** (iPad and iPhone) opens the **software keyboard** on **`/room/:roomId`**, the **movie player must remain fully visible** within the **visual viewport** — the complete **16:9** player shell stays on screen, scaling down if needed to fit the space above the keyboard. **Pushing the stage entirely off-screen** is a **contract violation**.

| Concern | Contract |
| --- | --- |
| **Scope** | All **iOS Safari** room surfaces where a native text control triggers the OS keyboard: **chat compose**, **Profile** tab fields, **room rename modal**, and any other room text input added later. |
| **Layout authority** | **`riffsync-room-page__stage`** (video + participant row) stays **pinned** in the visible area above the keyboard; **`riffsync-room-page__chat-column`** and in-column scroll regions **compress** and scroll internally — the room shell does **not** document-scroll to bring compose into view at the expense of the player. |
| **Wide layout (≥ 992px)** | Side-by-side desktop/tablet landscape layout was **not reported** for #240; apply the same **player-visible** rule if keyboard focus reproduces displacement there (regression check). |
| **Keyboard dismiss** | Layout may use a **brief transition** (~**200ms**) when returning to full viewport height; honor **`prefers-reduced-motion: reduce`** with **instant** restore. |
| **Implementation hints** | Prefer **`visualViewport`** height/offset to drive room shell CSS variables; consider **`interactive-widget=resizes-content`** on the document viewport meta where supported. Automated CI cannot simulate iOS keyboard — **manual iOS Safari QA** is required for acceptance. |

### Theater fullscreen with participant AV

- When participant AV surfaces are active, custom fullscreen **includes the Theater camera row or Video Chat grid** alongside the shared movie or grid primary region.
- The **host control bar** may remain **outside** the fullscreen wrapper.

### Expanded view (in-page, #259)

**Expanded view** is an optional **in-page** layout within **`/room/:roomId`** - **not** browser **`requestFullscreen`**, **not** YouTube iframe-native fullscreen, and **not** the same as **theater fullscreen** above. The room route already uses a chrome-free full-viewport shell; Expanded View changes only the in-room stage/sidebar/chat presentation.

| Concern | Contract |
| --- | --- |
| **Availability** | Offered in **Theater** and **Video Chat** room modes when viewport **≥ 992px**. **Hidden or inert** below 992px — standard stacked layout unchanged. |
| **Stage primary** | **Theater:** shared movie player (host capture / guest inbound **`host_screen`**) remains primary inside the expanded stage container. **Video Chat:** participant **video-on** tile grid fills the stage region. |
| **Theater camera row** | When one or more participant cameras are on, overlay the camera row **bottom-left over** the movie. When zero cameras are on, omit the row and allow the movie to occupy the available expanded stage. Visibility rules for mic-only participants are unchanged. |
| **Chat overlay** | **Transparent** panel **over** the stage, anchored **bottom-right**. Occupies **at most 50% of stage height** and **at most ~40% of stage width** (exact width via CSS **`clamp`** acceptable). **Does not** span the full right column height. |
| **Overlay contents** | **Chat plane only:** chat drawer status, scrollable message log (bounded flex + stick-to-bottom per chat contract), jump-to-latest, participant AV toggles when fan JWT present, compose. **No** sidebar tab strip (**Chat / People / Room / Profile**). **People / Room / Profile** require **exit expanded view**. |
| **Optional polish** | **Top fade gradient** on the overlay zone (video visible through chat background) is **nice-to-have**, not MVP-required. |
| **Toggle** | **Corner control** on the stage (mockup: top-right). **Visible on pointer hover** over the stage; control remains visible while **keyboard focused**. Accessible names: **Expand view** / **Exit expanded view**. |
| **Host control bar** | **Remains below the stage** in expanded and standard layouts (host-only). |
| **State** | **Session-only** client state — **no** `localStorage` persistence; full reload returns to **standard** layout. |
| **Drawers** | Chat and video-relay drawer status rules **unchanged** — chat banner lives inside the overlay; video-relay status stays on the stage playback surface. |
| **Chromecast composition** | The expanded layout's **stage-primary + chat overlay** shell is the presentation model for optional viewer-local Cast. Cast work reuses this model without making expanded view itself the Cast entry point. |

Regular Expanded View remains a live room surface. Its chat overlay uses the normal room chat plane and must keep compose, GIF posts, reactions, typing indicators, jump-to-latest, chat drawer status, and signed-in / anonymous gates interactive exactly as they are in the standard sidebar. Treating `presentation="overlay"` or `expandedViewActive` as a Chromecast receiver/source mode is a contract violation (#318).

Implementation: `RoomPage.tsx` owns session-only expanded state, `RoomPageSidebar.tsx` renders the shared chat plane as either sidebar or overlay, and `StageParticipantLayout.tsx` renders Theater cameras in a bottom horizontal row for standard desktop layout and a bottom-left overlay row for expanded desktop layout.

### Chromecast Cast view (viewer-local)

Optional Chromecast support is a local room presentation layer for Cast-capable senders. It is **not** a room mode, not host-authoritative, and not visible to other participants unless they independently Cast from their own device.

| Concern | Contract |
| --- | --- |
| **Availability** | Show **Cast to TV** only in **normal room view** when sender support is detected and the existing experimental room feature opt-in is enabled. Cast entry is hidden or inert in expanded view. Until Cast is repaired and release-ready, non-experimental sessions hide or cannot activate the Cast entry point. Missing support or a disabled experimental opt-in must not block normal playback, chat, expanded view, host controls, participant A/V, or room participation. |
| **Start point** | Cast starts from the standard stage/sidebar room layout only. The sender does not need to enter expanded view before starting Cast. |
| **Receiver presentation** | The custom RiffSync Cast receiver must render the expanded-view composition model: stage primary/video plus bottom-right chat overlay. During an active Theater share, stage primary is the live `host_screen` stream, not placeholder text. The Cast presentation does **not** include the sidebar tab strip; **People**, **Room**, and **Profile** remain sender-side room surfaces. Native media-only or YouTube-only Cast does not satisfy this presentation contract. |
| **Sender active state** | After receiver render confirmation, the sender's normal stage replaces the regular video/playback surface with **`Now Casting`** and a stop affordance. The regular in-page video surface does not remain visible while local Cast is active. **`requestSession()`** resolution alone must not show **`Now Casting`**. |
| **Chat while casting** | Sender chat remains interactive under existing rules: signed-in fans may send text, GIFs, and reactions when chat is healthy; anonymous guests may read and retain the sign-in gate for send. |
| **Stop Cast** | Stop returns the sender to normal in-page playback without clearing chat scrollback, compose state, selected sidebar tab, presence, room membership, or authoritative room snapshot state. |
| **Failure / unavailable** | Cast unavailable, blocked, rejected, or failed start surfaces honest local status and leaves normal in-page playback/chat intact. It never implies the room failed or that other participants changed state. |
| **Other participants (#277)** | Other participants see no Cast status, **`Now Casting`** panel, Stop Cast control, room mode indicator, playback change, drawer status change, chat reset, sidebar reset, participant A/V change, or stage layout change caused by another viewer's local Cast session. |
| **Verification (#279)** | Cast presentation coverage must assert normal-view availability, receiver-start feedback, active **`Now Casting`**, Stop Cast restoration, failure/recovery copy, and cleanup removal of stale Cast surfaces. Checks must also prove sidebar/chat state and other participants' presentation remain unchanged. |

### Cast stop restoration (#276)

The #276 slice owns the successful intentional Stop Cast return from the active sender stage to the normal room stage.

| Concern | Contract |
| --- | --- |
| **Stopping surface** | The active **`Now Casting`** panel may show brief local stopping copy after Stop Cast activation. Use the same stage-local status surface as active Cast; do not use chat drawer, video-relay status, host feedback, room error boundaries, or global room announcer copy. |
| **Restored stage** | On successful stop cleanup, remove the active Cast panel and restore the normal **`riffsync-room-page__stage`** playback surface for the current room mode. The regular in-page video/playback surface is visible again. |
| **Sidebar preservation** | Sidebar tabs, selected tab, chat scrollback, compose draft, jump-to-latest state, participant A/V controls, People roster, and Profile/Room tab state remain sender-side room state. Stop Cast must not reset the chat column. |
| **Expanded view** | Do not re-enter expanded view automatically after stop, even if stale internal expanded state existed before Cast became active. The normal room layout returns with the expanded-view toggle available only when the standard expanded-view contract allows it. |
| **Other viewers** | Other participants receive no stop status, stage restoration event, room mode change, playback change, or chat/sidebar reset because of this sender's local Stop Cast. |
| **Failure boundary** | Receiver disconnect, SDK-ended active sessions outside successful user stop, failed stop, blocked/unavailable Cast, and retry copy belong to #278. |

### Cast-active sender stage (#274)

The #274 slice starts only after #273 receiver render confirmation.

| Concern | Contract |
| --- | --- |
| **Stage replacement** | Replace the sender's regular stage video/playback surface with a stage-local active Cast panel. The panel includes visible **`Now Casting`** text and short local copy such as **`Casting to TV`**. App-authored copy must not expose the receiver device name. |
| **Stop affordance** | Render a visible **Stop Cast** button/control in the active Cast panel. The control is local to the sender and must not be placed in **`HostControlBar`** or described as room-wide. |
| **Status surface** | The active panel provides a stage-local **`role="status"`** or equivalent polite live region for the Cast-active state. It must not reuse chat drawer status, video-relay status, host feedback, room error boundaries, or **`#riffsync-a11y-announcer`**. |
| **Expanded view while casting** | Expanded view is unavailable while local Cast is active. If stale expanded-view state exists when Cast becomes active, clear it and show the normal room layout with the **`Now Casting`** sender stage. Do not offer an expand control until Cast is no longer active. |
| **Room context** | Sidebar tabs, chat scrollback, compose draft, selected sidebar tab, presence, participant A/V controls, and room membership remain sender-side state. #275 covers broader chat interactivity while Cast is active; #274 must not regress those surfaces while replacing the stage. |
| **Boundary with #276** | #274 owns rendering the Stop Cast control and invoking local stop intent. #276 owns the complete restoration of normal in-page playback after stop completes. |

### Cast start receiver presentation (#273)

The Cast-start slice proves an actual custom receiver view, not just a sender-side launch request.

| Concern | Contract |
| --- | --- |
| **Receiver shell** | Render **`/cast/receiver`** as a receiver-only page using **`CastReceiverPage`** and **`CastReceiverPresentation`** under **`apps/web/src/pages/cast/`**. It uses the expanded-view shell structure: stage-primary video area plus bottom-right chat overlay. Header, footer, sidebar tab chrome, compose controls, People, Room, Profile, host controls, and participant A/V controls are omitted from the receiver. |
| **TV layout constraints** | The receiver root fills **100vw x 100vh** on a dark, chrome-free background. The stage primary occupies the full available 16:9 TV canvas using contained media/object sizing so it is not cropped on **1280x720**, **1920x1080**, or **3840x2160** displays. The chat overlay is anchored bottom-right inside a TV-safe inset of at least **24px** at 720p, **32px** at 1080p, and **64px** at 4K. Its width is **clamp(22rem, 34vw, 42rem)** and never exceeds **40%** of the stage width; its height never exceeds **45%** of the stage height. The overlay scrolls internally and never covers the center of the stage-primary video. |
| **Sender-proxied content** | The sender sends the receiver a presentation snapshot and subsequent chat-overlay updates over the Cast channel. The receiver does not fetch room state, join chat, or expose sender-only tabs. |
| **Overlay requirement** | The chat overlay is required on the receiver for #273. A native media-only Cast path, tab mirroring guidance, or receiver view without chat overlay does not satisfy this slice. |
| **Custom receiver identity** | The receiver is launched by the configured Custom Web Receiver app id and hosted at the registered TLS receiver URL, currently **`/cast/receiver`**. The receiver uses custom namespace **`urn:x-cast:com.riffsync.presentation`** for sender-proxied presentation messages. |
| **Receiver interactions** | Receiver chat overlay is presentation-only. Chat compose, GIF/emoji pickers, reactions, participant A/V toggles, People, Room, and Profile controls remain on the sender. |
| **Receiver placeholder copy** | Before the first sender presentation snapshot, the receiver shows **`Waiting for party presentation...`** in a polite status surface. When stage-primary playback is not yet available, the stage placeholder uses **`Waiting for room video...`**. When receiver playback is blocked by provider or autoplay policy, the stage placeholder uses **`Playback needs attention on the sender.`** and does not expose provider error codes, receiver device names, or participant identifiers. Empty chat overlay state may show **`Chat will appear here.`** |
| **Start feedback** | While the sender is waiting for receiver render confirmation, keep normal in-page playback visible and use local Cast status near the Cast surface or stage-local Cast status. Do not use chat drawer, video-relay status, room error, or host feedback surfaces. |
| **Success transition** | The sender treats Cast start as confirmed only after the receiver reports that stage-primary video and the bottom-right chat overlay rendered. The #274 slice owns the persistent **`Now Casting`** sender-stage details after confirmation. |
| **Presentation coverage** | Component tests and visual/screenshot fixtures for **`CastReceiverPresentation`** must render the stage primary plus required chat overlay at **1280x720**, **1920x1080**, and **3840x2160** receiver viewport sizes. Regression coverage must fail if the route renders a native media-only surface, a YouTube-only iframe without the RiffSync overlay, sidebar tab chrome, or sender-only interactive controls. |

The read-only receiver rule applies only to the Chromecast receiver/source presentation. It must not be implemented by disabling the regular Expanded View overlay on the sender's computer. Regression coverage for #318 must prove that the normal `/room/:roomId` Expanded View still renders interactive chat controls while `/cast/receiver` remains presentation-only.

### Cast availability in normal room view (#272)

The Cast availability slice exposes availability only after the normal room shell has rendered, the existing experimental room feature opt-in is enabled, and local sender support is confirmed for the configured RiffSync Custom Web Receiver.

| Concern | Contract |
| --- | --- |
| **Primary placement** | Place **Cast to TV** in the normal-view **Room** sidebar action group near existing room actions such as **Copy Party Link** and **Leave Party**. It is a viewer-local room action, not a host-authoritative control. |
| **Host control separation** | Do **not** place Cast availability in **`HostControlBar`** or gate it on **`JWT.sub === hostSub`**. Room admins and guests follow the same local sender-support rule. |
| **Expanded view** | Do not render a Cast start action in expanded view. If normal-view state changes while expanded, the expanded toggle and overlay remain unchanged; the viewer exits expanded view before using Cast. |
| **Required ready state** | Render **Cast to TV** only when the existing experimental room feature opt-in is enabled, the Cast sender SDK reports availability, and the sender can configure **`CastContext`** with **`VITE_CAST_RECEIVER_APP_ID`** and **`chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED`** for the custom receiver. |
| **Unsupported or non-experimental default** | When sender support is absent, unknown, blocked by platform policy, missing receiver app id, unable to configure **`CastContext`**, still checking, or the room is not in the experimental opt-in, omit **Cast to TV**. Normal playback, chat, expanded view, host controls, and participant A/V remain unchanged. |
| **Explainable unavailable state** | If an implementation briefly renders or evaluates the Cast affordance and then learns Cast is unavailable, show a local status line at the Cast surface with copy **Cast is not available in this browser or device.** Do not use the chat drawer banner, video-relay status, room error, global announcer, or host feedback surfaces. |
| **Stage impact** | #272 does not replace the stage, hide the player, or show **`Now Casting`**. The regular **`RoomPlaybackPanel`** remains the active playback surface until a later start-Cast slice confirms a Cast session. |

### Cast launch status in normal room view (#302)

The launch slice adds local status while **`requestSession()`** is in flight or the sender waits in **`session_pending_render`**.

| Concern | Contract |
| --- | --- |
| **Status placement** | Render **`CAST_STARTING`** and **`CAST_START_REJECTED`** copy in the normal-view **Room** sidebar Cast action group at the same surface as **Cast to TV** and **`CAST_UNAVAILABLE`**. Do not use chat drawer, video-relay status, host feedback, room error boundaries, or **`#riffsync-a11y-announcer`**. |
| **Starting copy** | While **`launching`** or **`session_pending_render`**, show **Starting Cast…** with an associated polite **`role="status"`** region near the Cast action. |
| **Failure copy** | On chooser cancel, SDK reject, or **45s** launch timeout, show **Cast could not start. Try again from this browser or device.** and restore **Cast to TV** when sender support remains **`available`**. |
| **Stage during launch** | **`RoomPlaybackPanel`** and normal room controls stay visible through launch, cancel, reject, timeout, and **`session_pending_render`**. Do not show **`Now Casting`** or replace the stage in #302. |
| **Retry affordance** | After failure, **Cast to TV** stays enabled when availability is **`available`**. No separate retry button is required in MVP. |
| **Provider privacy** | Launch status must not expose Cast SDK error codes, receiver device names, or raw provider metadata in room surfaces. |

### Cast render confirmation gate (#304)

The render-confirmation slice gates the sender's active Cast UI after #302 reaches `session_pending_render`.

| Concern | Contract |
| --- | --- |
| **Pending surface** | While waiting for receiver render confirmation, keep **Starting Cast…** at the normal-view Room sidebar Cast surface and keep the normal **RoomPlaybackPanel** visible. Do not replace the stage, show **Now Casting**, render **Stop Cast**, suppress expanded view, or move focus to Stop Cast while only pending. |
| **Acknowledgement payload** | Treat the receiver as rendered only after a JSON `receiver_rendered` acknowledgement over `urn:x-cast:com.riffsync.presentation` includes `schemaVersion: 1`, the latest sender presentation `snapshotId`, `stagePrimaryRendered: true`, and `chatOverlayRendered: true`. Stale ids, missing flags, partial flags, receiver page load, and Cast session resolution do not satisfy the gate. |
| **Timeout and failure copy** | If no valid acknowledgement arrives within **30 seconds** after `requestSession()` resolves, or if the receiver channel closes or reports partial render before active Cast, return to local idle/start-failed posture with **Cast could not start. Try again from this browser or device.** at the Cast surface. Normal playback remains visible throughout. |
| **Retry** | After timeout or invalid acknowledgement, **Cast to TV** is available again when sender support is still `available`. No separate retry button is required in MVP. |
| **Success transition** | Only a valid positive acknowledgement transitions to active Cast. The sender stage then shows **Now Casting** and **Stop Cast**, regular in-page video is hidden while active, expanded view is unavailable, and sender chat/sidebar state remains intact. |
| **Privacy and surface isolation** | Pending, timeout, invalid acknowledgement, and success copy must not expose receiver device names, Cast provider error codes, app ids, participant identifiers, or room-authority language. Do not use chat drawer, video-relay status, host feedback, room error boundaries, or global room announcer copy. |

## Accessibility & motion (baseline)

- Prefer **semantic headings** and **focus order** that match visual flow; **keyboard** paths for **Play**, **share**, **lobby join** before shipping broadly.
- Respect **`prefers-reduced-motion`** for non-critical animations (see sibling **`accessibility.md`**).

## Operator framing

- **Charts / health:** direct maintainers to **AWS CloudWatch** dashboards—**no in-app uptime SLA** promises for the OSS deployment.

## Decisions (answered — presence and AV maturity)

| Question | Decision |
| --- | --- |
| Typing in chat? | **In scope** — ellipsis indicator; typing start marks **active**; ephemeral (not archived). |
| People badges? | **Online** (connected) + **active** (2-minute window) on roster rows; host row included. |
| Speaking on tiles? | **Yes** — border/glow on Theater strip and Video Chat grid when video on and mic unmuted. |
| Mic-only speaking? | **People tab rows only** — no stage tile or audible-only chrome. |
| Video Chat label? | No **Beta** or **Experimental** label; **Video Chat** is a normal host-selectable A/V room mode while **`avDisabled`** is false. |
| People cam/mic icons? | **Yes** — live SFU producer state per **`sessionId`**; mic muted vs off distinct. |
| Speaking VAD? | **`fftSize` 512**, RMS **≥ 0.02**, **150ms** attack, **300ms** hang — **`execution_model.md`**. |
| Separate chat vs video-relay drawers? | **Unchanged** — independent banners per **`getDiagnostics().drawers`**; no combined copy. |

## Decisions (answered — M23 layout polish #242)

| Topic | Decision |
| --- | --- |
| **Layout timeout copy** | After **3s** without consumers attached, keep direction-neutral sparse state — **do not** append alternate **Updating room layout…** variants. |
| **Video Chat empty grid** | **`No cameras on yet. Mic-only participants are still audible.`** |
| **Theater before capture** | Host **Share Source Tab** prompt in existing stage status region. |

## Decisions (answered — lobby host line #257)

| Topic | Decision |
| --- | --- |
| **Placement** | On **`/lobby`**, each list row shows **`Hosted by {hostDisplayName}`** on a line **directly below** the episode **title** (`h2`) and **above** the stats row (activity, connections, playback badge). |
| **Copy** | Sentence case **`Hosted by …`**; **`hostDisplayName`** verbatim from API (already trimmed server-side, max **48**). |
| **Styling** | Muted secondary text — reuse **`riffsync-muted`** or an adjacent lobby stat class; not a second heading. |
| **Missing name** | Rows without **`hostDisplayName`** are **not rendered** — the API omits them; SPA does not synthesize fallback copy. |
| **Private rooms** | Only **`visibility: public`** rooms appear on **`/lobby`**. Host may switch to **`private`** (**Link only**) from the in-room **Room** tab; direct **`/room/:roomId`** join remains open to anyone with the link. |

## Decisions (answered — compose media picker #258)

| Topic | Decision |
| --- | --- |
| **Tab body height** | **16.5rem** fixed below tab bar for both **Emojis** and **GIF** panels. |
| **GIF results growth** | Results grid scrolls inside fixed panel — popover does **not** grow when results appear. |
| **Tab switch jitter** | **Contract violation** if outer popover height changes on tab switch. |

## Decisions (answered — Theater camera placement #261)

| Topic | Decision |
| --- | --- |
| **Standard Theater cameras** | Video-on participants render in a horizontal row directly beneath the movie, not in a right-side rail and not over the movie. |
| **Expanded Theater cameras** | Expanded stage includes the movie plus optional bottom camera row; when the row is empty, the movie may use the full expanded stage. |
| **Chat in expanded Theater** | Chat remains the bottom-right transparent overlay from **#259** and is not displaced by cameras. |
| **Video Chat** | Participant grid remains primary; mic-only and grid visibility rules are unchanged. |

## Decisions (answered — in-room lobby visibility)

| Topic | Decision |
| --- | --- |
| **Create-time default** | Catalog **Start Party** still creates **`visibility: public`** rooms — no create-flow picker. |
| **Host control placement** | **Room** sidebar tab only; not on host control bar or catalog. |
| **Labels** | **Show in lobby** maps to **`public`**; **Link only** maps to **`private`**. |
| **Hint copy** | Muted helper under control: party link still works; link-only rooms are hidden from lobby. |
| **Non-host visibility** | Guests and signed-in non-host fans do not see the control. |
| **URL stability** | Toggling visibility does not mint a new **`roomId`** or change **`/room/:roomId`**. |

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### catalog-playback-host
- **Static SEO table** copy referencing "lawful YouTube embeds" — marketing/legal refresh when Custom episodes ship (Custom-only `/watch/:id` remains excluded from sitemap; **#397** / product follow-up).
- **Admin host selector focus order** — resolved in admin form issue **#391** (*Decisions (M37 — admin catalog form)*).

### existing-room-polish
- **Theater audio resume control:** persistent **Enable party audio** chrome when **`THEATER_AUDIO_SUSPENDED`** — deferred; current room runtime uses implicit gesture resume per **`execution_model.md`**.
- **Telemetry / UX story event names** for layout transition timeout — deferred; per-drawer reconnect and tile lifecycle client log **`event`** names are normative in **`operations/observability.md`** Decisions.

### chromecast-presentation
- No open decisions remain for #303 receiver presentation. The receiver shell uses the route and component contracts above, TV-safe 720p/1080p/4K overlay constraints, explicit waiting/blocked playback copy, and component or screenshot coverage proving native media-only and YouTube-only Cast paths do not satisfy the required RiffSync stage-primary plus chat-overlay presentation.

### public-site-seo
- No open decisions remain for M29 per-route head tags (#326), M30 home H1 / catalog alt (#327), or M33 subcategory SEO packaging copy (#341). Normative copy is the *Public site head tags* table above and the **Decisions (M29 — …)** / **Decisions (M30 — …)** tables below. M33 adopts those subcategory (and hub) title/description/canonical/OG strings as-is; marketing tighten is out of scope for that packaging milestone.

### catalog-sub-pages
- No open decisions remain for M32 catalog subcategory browse IA (#340). Normative hub, nav, subtitle, search/sort, and shell rules are in **Catalog hub and subcategory presentation** and **Decisions (M32 — catalog subcategory browse IA — #340)** below.

### friends-and-direct-messaging
- **People roster invite UX:** Context menu labels, pending/already-friends menu states, and **`fanSub`** on **`presence`** wire — **#377** sub-issue (see **`interaction_flow.md`**).

## Decisions (M36 — watch-party Friends pane — #364)

| Topic | Decision |
| --- | --- |
| **Tab order** | **Chat → People → Friends → Room → Profile**; **Friends** tab signed-in fans only. |
| **Tab visibility** | Omit **Friends** tab for anonymous guests (no manage/send stub). |
| **DM placement** | In-column nested stack inside Friends tab panel; **Back to friends** returns to list. |
| **Main-site parity** | Same list, pending, online (**Online in a watch party**), unread dots, remove confirm, DM compose, and normative copy as #363. |
| **Unread on tab** | Aggregate boolean dot on **Friends** tab label when **`anyUnread`**. |
| **AV toggles** | Participant camera/mic toggles remain visible above compose on **Friends** tab when fan JWT present. |
| **Compact header** | No person-icon friends control on room compact header. |
| **Expanded / Cast** | No Friends tab strip or compact DM in expanded overlay or Cast receiver; exit expanded to use sidebar **Friends**. |
| **Fan DM bootstrap** | Start or attach **`FanDmSession`** on first **Friends** tab activation; reuse open session from main site when present. |
| **Module reuse** | Share **`apps/web/src/friends/`** components and API clients with main-site #363. |

## Decisions (M36 — signed-out and guest auth gates — #365)

| Topic | Decision |
| --- | --- |
| **Signed-out main site** | Person-icon friends affordance **absent** (not disabled, not replaced by **Sign In**). **Account** primary-nav link unchanged. |
| **Guest in room** | **Friends** sidebar tab **omitted** (not a disabled stub). No DM compose or friends manage chrome anywhere in room shell. Room **Sign In to Chat** remains chat-scoped only — it does **not** unlock friends/DM. |
| **Staff-only session** | Staff JWT does **not** show friends/DM chrome and does **not** authorize **`/v1/friends/*`** or **`/v1/dm/*`**. Operator must also hold a **fan** session to use friends/DM. |
| **Client/server agreement** | Client must not render optimistic friends/DM compose for guests or signed-out users. **`FanDmSession`** and friends HTTP clients must not open without fan access token. Server denies **`sessionId`-only** and staff tokens with **401 `fan_auth_required`**. |
| **SEO / discoverability** | No indexable friends/DM routes or sitemap entries. Overlays mount on existing pages only; **`/room/:id`** stays **`noindex`**. |
| **Shared guard module** | **`apps/web/src/friends/`** exposes a single **`requireFanAccessToken()`** (or equivalent) used by dropdown, room pane, **`dmApi`**, and **`FanDmSession`** bootstrap — #363/#364 consume it; #365 owns regression tests. |
| **Verification timing** | Auth-gate QA matrix runs in the **same release train** as #363 and #364 so guests never ship with half-enabled chrome. |

## Decisions (M37 — catalog card actions — #396)

| Topic | Decision |
| --- | --- |
| **Helper module** | **`catalogPlayback.ts`** with **`readCatalogPlaybackHost`**, **`episodeIsPlayableInApp`**, **`catalogEntriesPlayableInApp`**. |
| **Browse inclusion** | Custom-host with valid HTTPS URL **or** YouTube-host with non-empty video id (legacy list rule). |
| **Tile gating** | Disable **Watch Solo** + **Start Party** when **`!episodeIsPlayableInApp`**; do not hide the control group. |
| **Start Party API** | Requires **#392** room gate on **`POST /v1/rooms`**; client only enables the button when playable. |
| **YouTube non-embeddable** | Unchanged — row may list with YouTube id; actions enabled; **`SoloWatchPage`** blocks embed. |
| **Public badge** | **Out of scope** — no playback-host chip on fan catalog cards. |
| **Subcategory routes** | Not shipped in M32 app yet; subcategory shells inherit hub **`CatalogGridCard`** + helper when routed. |

## Decisions (M37 — host presentation Custom iframe — #394)

| Topic | Decision |
| --- | --- |
| **Component reuse** | **`SoloCustomIframePlayer`** from **#393** — same blocked copy, iframe **`allow`**, and **`title={episode.title}`**. Optional **`layout="room"`** (or equivalent) may swap outer shell classes to **`riffsync-room-page__player-shell`** instead of **`.riffsync-solo-player*`** when solo layout classes do not fit the stage. |
| **Mount strategy** | **Separate DOM instances** for in-room presentation vs party-capture tab; **shared component module**, not shared element. |
| **Visibility rule** | Presentation iframe when host **`!captureStream`**; capture preview **`<video>`** when **`captureStream`** active. |
| **Playback mirrors** | Prefer **`room.playbackHost`** and **`room.customPlaybackUrl`** from **`GET /v1/rooms`** (**#392**); defensive fallback to catalog episode query for the same fields. |
| **Snapshot diff** | Extend **`pickRoomSnapshotMediaFields`** / **`useRoomMediaEngine`** diff key to include **`playbackHost`** and **`customPlaybackUrl`** alongside **`youtubeVideoId`**. |
| **TheaterPlayback scope** | **No Custom iframe wiring through **`TheaterPlayback`**. Keep **`setYoutubeVideoIdForTheater`** for YouTube-host episode retarget only; presentation Custom embed is **`RoomPlaybackPanel`** React-owned. |
| **Guest WebRTC** | Unchanged — guests never load **`customPlaybackUrl`** directly. |
| **Out of scope** | Cast receiver Custom iframe; guest-direct Custom load; CSP **`frame-src`** (**#395**). |

## Decisions (M37 — solo watch Custom iframe — #393)

| Topic | Decision |
| --- | --- |
| **Component split** | **`SoloCustomIframePlayer`** dedicated module; **`SoloYouTubePlayer`** unchanged for YouTube-host rows. |
| **Layout shell** | Reuse **`.riffsync-solo-player*`** classes; party-capture flex/stretch rules already target **`.riffsync-solo-player__frame`** — no new aspect-ratio CSS required for Custom. |
| **Playback gate** | **`playbackHost === 'custom'`** + trimmed **`https://`** **`customPlaybackUrl`**; **`embedAllows`** ignored for Custom. YouTube-host gate unchanged (**`youtubeVideoId`** + **`embedAllows !== false`**). |
| **Missing Custom URL** | **`Playback unavailable — no custom playback URL is linked for this catalog entry.`** |
| **Embed blocked** | **`This page could not be embedded in RiffSync. Open the movie page in a new tab.`** + **`customPlaybackUrl`** escape link. |
| **Iframe `title`** | **`episode.title`** (catalog title). |
| **`hostSourceTab`** | Custom rows always party-capture RiffSync watch URL; **`hostSourceOpensOnYoutube`** false. |
| **Out of scope** | Room presentation mount (**#394**), Cast receiver Custom iframe, CSP **`frame-src`** directive syntax (**#395** — resolved in contracts; implementation in **#395**). |

## Decisions (M37 — CSP Custom iframe — #395)

| Topic | Decision |
| --- | --- |
| **CSP delivery** | CloudFront **`ResponseHeadersPolicy`** in **`static-site-stack.ts`** only — no HTML meta CSP. |
| **`frame-src` / `child-src`** | Add **`https:`** scheme source alongside explicit YouTube hostnames. Permits any HTTPS Custom origin; blocks **`http:`** framing. Unrelated directives unchanged. |
| **`sandbox`** | **Omit** on Custom playback iframe — partner embeds need scripts/same-origin; staff curation is the gate. |
| **`Referrer-Policy`** | Inherit existing CloudFront global **`strict-origin-when-cross-origin`**; no per-iframe attribute. |
| **Operator expectation** | Validation: HTTPS any domain, no allowlist at save. CSP: scheme-wide **`https:`**, not per-partner enumeration. |

## Decisions (M36 — main-site friends dropdown — #363)

| Topic | Decision |
| --- | --- |
| **Invite send** | **Not** on main-site dropdown. Outbound invites from watch-party **People** roster context menu (#377). |
| **Person-icon placement** | **`gen-account-holder`** in header info strip; **Account** nav link unchanged. |
| **Signed-out** | Person-icon control **absent** (not disabled). |
| **Dropdown shell** | **`max-height: min(70vh, 24rem)`**, width **`min(100vw - 1rem, 22rem)`**, internal scroll; Catalog-style disclosure keyboard (**`input_handling.md`**). |
| **Empty copy** | No friends → **No friends yet.**; empty DM → **No messages yet. Say hello.**; closed after remove → **This conversation is closed.** |
| **Unread chrome** | Boolean **dots** only: per-friend row + aggregate on person-icon when **`anyUnread`**. |
| **Remove friend** | Confirm dialog before **`DELETE /v1/friends/{pairKey}`** (copy in **Direct message panel** above). |
| **DM panel** | Viewport overlay; room-chat log/compose/scroll language; text-only v1 compose. |
| **Friends online label** | **Online in a watch party** (distinct from People **Active**). |
| **Fan DM bootstrap** | Open **Fan DM WebSocket** when signed-in fan first opens main-site friends dropdown; failure isolated from catalog/room (**`execution_model.md`**). |

## Decisions (answered — friends and direct messaging)

| Topic | Decision |
| --- | --- |
| **Auth gate** | Friends entry and DM actions require authenticated fan session; main-site friends affordance **hidden** when signed out. |
| **Main-site entry** | Person icon in main header opens friends dropdown; friend name opens DM panel; remove-friend available from friends UX. |
| **Room surface** | Compact header has no person icon; additive **Friends** in right column; does **not** replace **People**. |
| **Creation UI** | Invite/accept: pending requests visible; recipient can accept or decline; durable friend row only after accept. |
| **Friends online** | Friend currently in **any** RiffSync room (RoomPresence-derived). Distinct naming from People **Active**. |
| **DM durability UX** | Account-lifetime history; empty state is “no messages yet” / closed, not room-chat ephemeral wipe. |
| **Unread** | Visible on friends list; clears when those messages are viewed. |
| **Remove-friend UX** | Immediately mutual; both parties lose compose and history (closed/hidden). |
| **DM≈room chat** | Reuse room-chat log/compose/scroll language; no separate aesthetic. |

## Decisions (M32 — catalog subcategory browse IA — #340)

| Topic | Decision |
| --- | --- |
| **Page-header subtitle** | The catalog hub uses its subtitle slot for the four category links. Subcategory subtitles are **`"Push the button, Frank"`** for **MST3K**, **Community Made Riffs**, **Cheesy Flicks Ready to Riff**, and **Pull the Family Together for a Movie Night**. |
| **Hub entry links** | Large **text** links (no imagery) placed in the page-header subtitle slot above title-search / sort and the mixed grid. |
| **Subcategory search / sort** | Keep the same title-search and sort chrome as the hub; operate within the route-fixed `catalogs` set. |
| **Link / dropdown order** | **MST3K** → **Community** → **Riff Material** → **Movie Night**. Same order on hub entry links and Catalog nav (desktop dropdown and hamburger). |
| **Labels / microcopy** | Display names only — no helper microcopy under hub or nav subcategory links. |
| **Mobile Catalog disclosure** | Inline accordion inside **`navbar-collapse`** (not a nested flyout) — see **`interaction_flow.md`**. |
| **Out of scope** | Per-subcategory visual customization; SEO sitemap/prerender/head-tag packaging (**M33 #341**). |

## Decisions (M29 — per-route head tags — #326)

| Topic | Decision |
| --- | --- |
| **Static route copy** | Use the exact **`<title>`** and meta description strings in the *Public site head tags* table above for **`/`**, **`/catalog`**, **`/catalog/mst3k`**, **`/catalog/community`**, **`/catalog/riff-material`**, **`/catalog/movie-night`**, **`/how-to-host-a-watchparty`**, **`/terms`**, and **`/privacy`**. |
| **`/watch/:id` title** | **`{episode.title} - RiffSync`** using catalog **`title`** only (Invariant 9). Apply **`trimTabTitleSegment`** only when the composed string exceeds **70** characters for the HTML **`<title>`** element; OG/Twitter **`og:title`** / **`twitter:title`** use the untrimmed catalog title. |
| **`/watch/:id` description** | When **`tagline`** is non-empty after trim: **`{tagline} — watch {episode.title} on RiffSync. Unofficial fan project with lawful YouTube embeds.`** Otherwise: **`Watch {episode.title} on RiffSync — fan watch parties with lawful YouTube embeds. Unofficial fan project.`** |
| **`/watch/:id` OG image** | Prefer absolute **`posterImageUrl`**, then absolute **`backdropImageUrl`**, else **`{origin}/og-card.png`**. Do **not** use YouTube thumbnail URLs for OG/Twitter image tags. |
| **OG/Twitter parity** | Each indexable route emits matching **`og:title`**, **`og:description`**, **`og:url`**, **`og:image`**, **`twitter:card=summary_large_image`**, **`twitter:title`**, **`twitter:description`**, and **`twitter:image`** alongside **`<title>`**, meta description, and canonical **`<link>`**. Reuse today's **`index.html`** **`og:site_name`**, **`og:type=website`**, **`og:locale`**, and **`og:image`** width/height/type tags on static routes. |
| **Generic noindex shell** | Ephemeral/authenticated/receiver-only routes and the SPA fallback artifact use **`<title>RiffSync</title>`**, description **`RiffSync — fan watch parties with a curated MST3K-friendly catalog, shared viewing, and room chat. Unofficial fan project.`**, **`<meta name="robots" content="noindex">`**, and **no** canonical **`<link>`**. |
| **Home H1 / catalog alt** | **Out of scope** — **M30 #327** (see **Decisions (M30 — …)** below). |

## Decisions (M30 — home sr-only H1 and catalog card alt — #327)

| Topic | Decision |
| --- | --- |
| **Home H1 copy** | Static **`RiffSync`** — matches **`SITE_DOCUMENT_TITLE`** / generic shell **`<title>RiffSync</title>`**; not carousel slide title; not M29 **`RiffSync - Watch Parties`** prerender title. |
| **Home H1 placement** | **`HomePage`**: one **`<h1 className="sr-only">RiffSync</h1>`** before **`HomeHeroBanner`** on the happy path; same single H1 at the top of loading, error, and empty branches. |
| **Visible hero unchanged** | **`HomeHeroBanner`**, carousel slides, and **`HomeSpotlightBanner`** keep existing **`h3`**/**`h4`** levels and layout. |
| **Catalog alt template** | **`CatalogGridCard`**: **`alt={episode.title}`** on the poster **`<img>`**; catalog **`title`** only. |
| **Out of scope** | **`HomeMovieCard`** alt, **`SoloWatchPage`** sr-only H1, head-tag/prerender work (M29), **`robots.txt`**/**`sitemap.xml`** (M28). |

## Primary code pointers (optional)

- **`apps/web/src/room/ChatComposeMediaPicker.tsx`**, **`ChatEmojiPicker.tsx`**, **`ChatGiphyPicker.tsx`** — compose emoji/GIF tabbed popover (#258 stable height).
- SPA layout, design system, and route-level **loading/error** boundaries once scaffolded.
- **`apps/web/src/room/RoomPlaybackPanel.tsx`** — guest **`#riffsync-video-relay-status`** host-screen status line.
- **`apps/web/src/pages/RoomPage.tsx`** — thin room shell composing session modules; stage + chat-column layout; expanded-view toggle and overlay wiring (**#259**).
- **`apps/web/src/room/RoomPageSidebar.tsx`** — sidebar tabs + chat; chat/compose subtree reused inside expanded overlay.
- **`apps/web/src/room/stage/participantAvConsumers.ts`**, **`stageParticipantTiles.ts`** — tile attach/detach on **`newProducer`** / **`producerClosed`**.
