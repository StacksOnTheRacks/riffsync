# User stories

MVP slice derived from **`vision.json`** + **`README.md`** — prioritized for sequencing.

## P0 — ship shape

| ID | As a… | I want… | So that… |
| --- | --- | --- | --- |
| US-P0-01 | visitor | browse the catalog hub and its subcategory pages (**MST3K**, **Community**, **Riff Material**, **Movie Night**) without signing up | I can reach mixed or filtered title grids and pick an episode |
| US-P0-02 | visitor | join a hosted room as a guest | I watch in-app without creating an account |
| US-P0-02b | visitor | try to start my own party unsigned | I’m prompted to **sign in to host** |
| US-P0-03 | signed-in fan | create/open a room from the catalog | I’m room admin with **`hostSub`** binding and a share link |
| US-P0-04 | guest | join via URL / lobby | I watch the same picture and audio the admin shares |
| US-P0-05 | room admin | control the embed and start broadcasting | guests receive my shared stream (after browser permission + guest play taps as needed) |
| US-P0-06 | signed-in fan in room | send chat (text, emoji, Giphy GIF) | we can talk during the episode |
| US-P0-06a | signed-in fan in room | react to chat messages with emoji | we can respond without flooding the log |
| US-P0-06b | guest in room | read chat, GIFs, reactions, and avatars | I follow the conversation without signing in |
| US-P0-06c | signed-in fan | upload one profile avatar | my picture shows beside my name on any device |
| US-P0-06d | anyone in room | scroll chat in a fixed panel with stick-to-bottom | the sidebar does not grow with message count |
| US-P0-07 | guest | see advisory premium/ad label | I set expectations on ads |
| US-P0-08 | system | sweep stale rooms | lobby does not show dead parties forever |
| US-P0-09 | room admin | browse the catalog from inside the room and switch episodes | the room’s **current** title updates for everyone (metadata + shared stream) without starting a new room URL |
| US-P0-09a | room admin | hide my room from the lobby after the party starts | friends can still use my bookmarked party link without strangers discovering the room in **Lobby** |
| US-P0-10 | signed-in fan in room | toggle my camera and microphone above chat | friends can see and hear me during the watch party when I choose |
| US-P0-10a | guest in room | view and hear participant A/V when enabled | I follow face-to-face conversation without signing in |
| US-P0-10b | room admin | select **Theater** or **Video Chat** from the host control bar | the room layout matches social vs movie-first viewing for everyone |
| US-P0-10c | room admin | disable room A/V from the host control bar | the room reverts to movie + text chat only until I re-enable |
| US-P0-10d | anyone in room | see **Theater** movie primary with a vertical strip of video-on participants | I watch the shared movie and see who has cameras on |
| US-P0-10e | anyone in room | see **Video Chat** grid of video-on participants instead of the movie region | we can focus on face-to-face conversation during breaks |
| US-P0-11 | anyone in room | remote participant tiles to disappear when someone turns camera off | I do not see frozen last-frame video while their mic may still be audible |
| US-P0-11a | guest in room | host movie share stop to end only the shared screen for me | participant face cams and mic audio continue unless the host disabled room A/V |
| US-P0-11b | signed-in fan in room | chat reconnect without losing my SFU session when video relay is healthy | transient chat issues do not force full media rebuild |
| US-P0-11c | signed-in fan in room | SFU reconnect without chat teardown when chat is healthy | video relay recovery does not silence the conversation panel unnecessarily |
| US-P0-11d | anyone in room | separate chat vs video-relay connection status | I know which realtime plane is degraded |
| US-P0-11e | engineer | PR-blocking conformance tests on web + SFU paths | join → publish → consume → unpublish → reconnect runs against isolated ephemeral SFU + TURN before merge |
| US-P0-12 | anyone in room | see **online** vs **active** badges on the **People** tab | I can tell who is connected vs who is engaged recently |
| US-P0-12a | signed-in fan in room | typing in chat to show an ellipsis indicator to others | the room feels live while I compose without sending yet |
| US-P0-12b | signed-in fan in room | see ephemeral join/leave system lines when other signed-in fans arrive or leave | I notice who joined the party without cluttering durable chat history |
| US-P0-12c | anyone in room | see speaking affordance on video tiles when a participant is talking | I can follow who has the floor during face-to-face moments |
| US-P0-12d | anyone in room | see speaking state for mic-only participants on the **People** tab | I know who is talking even when they have no camera tile |
| US-P0-12e | room admin | **Video Chat** in the host control bar when room A/V is enabled | I can switch between Theater and Video Chat without treating A/V as experimental |
| US-P0-12f | signed-in fan in room | chat and video relay to reconnect independently | a chat blip does not force full media rebuild and vice versa |

| ID | As a… | I want… | So that… |
| --- | --- | --- | --- |
| US-P1-05 | operator | sign in via staff Hosted UI and reach admin entry | I can access staff-gated **`/v1/admin/*`** surfaces without using fan credentials |
| US-P1-05a | operator | sign out of staff session only | I can leave admin surfaces without ending my fan host or guest session |
| US-P1-01 | operator | TMDB-reconciled art/copy | catalog looks good without client-side TMDB |
| US-P1-02 | operator | CloudWatch dashboards | I see health and reconcile outcomes |
| US-P1-03 | fan | federated login (e.g. Facebook) | I can **host** rooms and retain continuity across devices |
| US-P1-04 | operator | admin catalog + lists | I can curate without editing raw JSON in prod (**depends on US-P1-05**) |
| US-P1-06 | signed-in fan in room | my **active** badge to persist across brief reconnects when I was recently engaged | late joiners and refresh see accurate engagement state on **People** |
| US-P1-07 | Cast-capable room viewer | start a viewer-local Cast session from normal room view | I can watch the RiffSync room presentation on a TV while continuing to chat from my sender device |
| US-P1-08 | search visitor | find a specific riffed episode via search engine | I can watch it without already knowing RiffSync exists |
| US-P1-09 | fan | share a direct **`/watch/:id`** link on Discord or Reddit | the link preview shows the episode title and art instead of a generic site card |

## Out of scope (MVP)

- Verified YouTube Premium detection
- Server-side video hosting
- CRDT / multi-host democratic control
- Self-service operator registration or in-app access requests (invite-only provisioning)
- Catalog CRUD, curated lists, fan roster, and activity reporting as part of the **auth slice** (downstream of **US-P1-05**)
- Room moderation or host takeover via staff login
- Server-side or client-side **recording/storage** of participant camera/mic or mixed room audio
- **Per-participant** host mute/remove (distinct from the room-wide **AV kill switch**)
- **Participant screen-share** as a separate publish type from host tab-capture
- **Mesh WebRTC** dev fallback paths (SFU mandatory in all environments)
- **Server-side theater audio mixing** (client-side Web Audio mix remains default until follow-on initiative)
- **Supplementary mic-only stage chrome** (avatar chips, audible-only tile badges) — speaking on **People** rows only for mic-only
- **Guest join/leave system lines** (signed-in fans only; anonymous guests connect silently)
- Room-wide Chromecast or host-controlled casting for all participants (Cast is viewer-local only)
- Native media-only Cast or YouTube-only Cast as the current Cast maturity substitute; the current Cast scope is the custom RiffSync receiver presentation with chat overlay.
- Search-engine indexing of **`/room/*`** or **`/lobby`** — ephemeral, per-instance state with no durable identity worth surfacing to crawlers (**`domain_model.md`** → *Public discoverable surface*).

## Decisions (answered — realtime hardening)

| Question | Decision |
| --- | --- |
| Module split in scope? | **ChatSession**, **SfuMediaSession**, **TheaterPlayback** extraction with thin room shell and narrow SDK. |
| SFU everywhere? | **Yes** — remove mesh; dev/CI use disposable SFU + TURN. |
| CI conformance harness? | **PR-blocking** on web/SFU path changes; isolated ephemeral stack; no prod touch. |

## Decisions (conformance harness scenarios — #155)

| Story | Harness coverage |
| --- | --- |
| **US-P0-11e** (PR-blocking conformance) | All six ordered steps in **`build_packaging.md`** implemented in **`tests/realtime-conformance/run.sh`**. |
| **Partial unpublish** | Step **4**: camera-off / mic-on — video producer closes, audio continues, no full SFU session rebuild (**2s** consumer detach window). |
| **Drawer-independent reconnect** | Steps **5–6**: chat WS drop with SFU up, then SFU WS drop with chat up — sibling drawer stays **`connected`** per **`getDiagnostics()`** (**#140**). |
| **`share_state` matrix** | **Out of MVP harness** — manual checklist only per **`build_packaging.md`** SFU deploy checklist table. |

## Decisions (answered — presence and AV maturity)

| Question | Decision |
| --- | --- |
| P0 presence stories? | **US-P0-12** roster online/active badges; **US-P0-12a** typing; **US-P0-12b** signed-in join/leave lines; **US-P0-12c/d** speaking on tiles + People mic-only; **US-P0-12e** Video Chat host control; **US-P0-12f** AV decoupling (orthogonal reconnect). |
| P1 presence story? | **US-P1-06** — **`lastActiveAt`** rehydrates **active** after reconnect for accurate People badges. |

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### catalog-subcategory-browse
- Per-route SEO head-tag and social-preview copy for catalog subcategory pages is owned by **`interface/presentation.md`** and **`specs/public-site-seo.spec.md`** (not this file). **US-P1-08** / **US-P1-09** stay scoped to search discovery and **`/watch/:id`** share previews unless those contracts extend them.

### existing-room-polish
- **Video Chat empty grid:** copy and layout when **no participant has camera on** (placeholder vs audio-only affordance).
- **Kill switch control affordance:** participant camera/mic toggles **visible but disabled** with short explanation vs hidden when **`avDisabled`** is true (accessibility vs minimal chrome).

### viewer-local-cast
- Specify acceptance tests for "mature and diagnosable" Cast without adding room-wide metrics, room diagnostics, or aggregate product telemetry.
- Specify story-level proof that failed, unsupported, ended, blocked, stopped, reloaded, and cleaned-up Cast states preserve normal room participation and do not affect other participants.

## Decisions (answered — M25 Chromecast delivery slices)

| Issue | Slice |
| --- | --- |
| **#272** | Expose viewer-local Cast availability in normal room view only, without changing room state or playback when unavailable. |
| **#273** | Start Cast from the expanded-view presentation model after availability is known. |
| **#274** | Replace the sender stage with **`Now Casting`** and Stop Cast while local Cast is active. |
| **#275** | Keep sender chat and room participation interactive while local Cast is active. |
| **#276** | Restore normal in-page playback after intentional Stop Cast. |
| **#277** | Preserve room authority, participant playback, SFU permissions, and room fan-out during local Cast. |
| **#278** | Handle local Cast unavailable, failed launch, receiver disconnect, and recovery states. |
| **#279** | Verify Cast lifecycle, accessibility, and cleanup behavior across the milestone. |

## Primary code pointers (optional)

- Link GitHub issues when filed.
- **US-P0-01 (browse):** `apps/web` home + `/catalog` hub and `/catalog/*` subcategory routes load from **`GET /v1/catalog`** when **`VITE_PUBLIC_API_BASE_URL`** is set (**M4 / issue #13**); **US-P0-07 (advisory):** honor-system **`playbackExpectation`** on room/share surfaces (see **`README`**); **`CatalogGridCard`** shows **`episode.tags`** in source order with no playback-advisory fallback when tags are empty (**#349**).
