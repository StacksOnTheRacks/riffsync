# Error state

User-visible and system-visible failure modes (catalog + room + embed).

## Catalog

| State | UX |
| --- | --- |
| **Episode missing enrich** | Show row with **placeholder** art if URLs null; still allow play if **`youtubeVideoId`** present. |
| **YouTube embed blocked** | Inline error + “open on YouTube” escape hatch (**product choice**, **`architecture.frontend.md`**). |

## Room

| State | UX |
| --- | --- |
| **Room stale / gone** | Lobby hides or marks ended; join shows **not found / ended** without crash. |
| **Hosting without login** | **401 / structured client error** on **`POST /v1/rooms`** / publisher paths — SPA routes user through **Sign in to host** (see **`architecture.frontend.md`**). |
| **Lost admin / host** | **Timeout then end:** if no healthy **publisher** connection tied to **`hostSub`** (per **`Connections`** metadata or heartbeat policy) and **`lastActivityAt`** exceeds **stale-room** window, hide from lobby and treat joins as ended. **No guest promotion** in MVP. UI: honest copy + redirect **`/lobby`**. During **`HOST_DISCONNECT_GRACE_MS`**, public rooms may be temporarily hidden via **`lobbyCleanupAfter`**; when the admin reconnects, **`lobbyPk`** / **`lobbySk`** **must** be restored if the sweeper removed them (#239). |
| **Host badge missing on People** | **Contract violation** — when **`JWT.sub === hostSub`** and the room WebSocket is open, roster **`presence`** **must** show **`isHost: true`** for that session. Fix under #239; not a new UX pattern. |
| **Video relay denied while hosting** | **Contract violation** — spurious **`Video relay denied access`** / SFU **`403`** (**`not_host`**, **`unknown_session`**) while the host is connected and sharing is a bug (#239), not expected degraded UX. |
| **Episode changed by admin** | Broadcast metadata update (+ optional chat system line): guests already on the stream see the new program through capture; **no** expectation that guests load their own embed for the new ID in MVP. |
| **Room A/V disabled (`avDisabled`)** | Server tears down participant producers and denies new publish grants. Room behaves as **movie + text chat only** — no participant A/V publish or consumption. **Video Chat** mode selection **unavailable or inert**. Participant camera/mic toggles show **disabled** state with honest explanation (host disabled room A/V). |
| **Participant A/V permission denied** | Inline recoverable error at toggles (browser **`getUserMedia`** denial); camera/mic remain off; user may retry after fixing browser/OS permission. |
| **Participant A/V publish rejected** | Inline error when SFU/token/capacity blocks publish; toggle returns to **off**; no silent failure. See **Participant A/V error taxonomy** below. |
| **Reconnect after refresh/disconnect** | Signed-in fan camera and microphone **default off**; toggles show off until user manually re-enables (privacy-first). |
| **Video Chat with no video-on participants** | Grid shows honest empty/placeholder state; mic-only participants remain audible; host must **Share Source Tab** again after return to **Theater** if they had been sharing before Video Chat. |
| **Theater with mic-only participants** | Movie stream primary; mic audio heard; mic-only identities **not** shown in participant strip (People tab + chat). |
| **Frozen last-frame remote tile** | **Contract violation** — when a participant turns camera off, remote strip/grid tiles **remove promptly**; mic audio may continue. Fix is compliance with partial producer teardown, not a new UX pattern. |
| **Host share stopped (`share_state: stopped`)** | Guests lose **host movie** picture; participant A/V tiles and mic audio **persist**; video-relay status may show host-not-sharing state without implying full media session loss. |
| **Chat plane degraded** | **Separate** status surface (e.g. "Chat reconnecting"); SFU/video relay may remain healthy; compose may queue or disable send with honest copy until chat recovers. |
| **Typing rate limited** | Server drops excess **`typing_start`** frames per **`sessionId`**; client **does not** show an error toast. Local compose continues; remote typing ellipsis may simply not appear until the limit window resets. |
| **Presence roster stale after reconnect** | Brief **People** tab gap until **`presence_request`** completes; show existing roster or honest loading state — no crash. If roster refresh fails after reconnect, chat drawer shows recoverable status; SFU plane unaffected. |
| **Video relay plane degraded** | **Separate** status surface (e.g. "Video relay reconnecting"); chat read/send may continue when chat plane is healthy; participant toggles reflect publish/consume errors per taxonomy below. |
| **Theater playback blocked** | Inline honest copy when **AudioContext** suspend or autoplay blocks movie/mic mix; chat and SFU sessions may still be connected; user action may be required to resume audio (**client-side mix default**). |
| **Cast unavailable or failed** | Local recoverable Cast status only. Keep normal in-page playback/chat/room participation available; do not leave the room, tear down healthy chat/SFU drawers, stop host share, mutate room state, or imply other participants are affected. |

## Local Cast status taxonomy

The availability, Cast-start, and local recovery slices define local Cast status codes only. These statuses stay sender-local and never become room drawer errors or room messages.

| **`code`** | Source | Surface | User-facing copy (template) |
| --- | --- | --- | --- |
| **`CAST_UNAVAILABLE`** | Sender support check reports no usable Cast sender path, support is blocked by browser/platform policy, or the support detector fails without a recoverable sender action. | Normal-view Room sidebar Cast surface only. | Cast is not available in this browser or device. |
| **`CAST_STARTING`** | Sender launches the custom RiffSync Cast receiver and waits for receiver render confirmation. | Local Cast status near the Cast action or stage-local Cast surface. | Starting Cast… |
| **`CAST_START_REJECTED`** | Sender SDK rejects launch, user cancels the Cast chooser, receiver launch fails, or the receiver does not confirm rendering the stage-primary video plus chat overlay. | Local Cast status near the Cast action or stage-local Cast surface. | Cast could not start. Try again from this browser or device. |
| **`CAST_ACTIVE`** | Receiver render confirmation succeeded and the local sender is actively casting. | Sender stage-local **`Now Casting`** panel with associated Stop Cast control. | Now Casting. Casting to TV. |
| **`CAST_SESSION_ENDED`** | An active Cast session ends outside successful user-initiated Stop Cast: receiver disconnect, route loss, sender SDK session-ended callback, receiver app close, or external TV stop. | Sender stage-local Cast surface while cleanup restores normal playback, then the normal Room Cast surface. | Cast ended. Playback is back in this tab. |
| **`CAST_PLAYBACK_BLOCKED`** | Receiver launches but cannot keep rendering stage-primary playback or reports playback blocked/unavailable after active Cast began. | Sender stage-local Cast surface while keeping chat and room participation available. | Cast playback was interrupted. Playback is available in this tab. |
| **`CAST_STOP_FAILED`** | User activates Stop Cast but sender SDK stop, receiver close, or route cleanup rejects or times out. | Sender stage-local Cast surface with Stop Cast still retryable when the session is still active; otherwise normal Room Cast surface after cleanup. | Cast could not stop from this tab. Try Stop Cast again or use your TV controls. |

Cast status codes must not appear in chat drawer status, video-relay status, room-level alerts, or **`RoomRealtimeSdk.getDiagnostics().drawers.*`**. They are local UI status for the viewer's browser/session only.

## Auth — fan

| State | UX |
| --- | --- |
| **Facebook / Cognito down (fan pool)** | Degrade to **anonymous** for non-host paths where policy allows; **Sign in to host** unavailable until fan IdP recovers. **Staff admin paths unaffected** by fan IdP recovery logic (separate pool). |

## Auth — staff (operator)

| State | UX |
| --- | --- |
| **Wrong token pool** | Fan JWT on **`/v1/admin/*`**: **401/403** — no anonymous fan fallback on admin routes; client prompts **staff** re-auth. |
| **Missing staff group** | Valid staff JWT without **`admin`** or **`curator`**: **403** (authenticated, not authorized); honest not-authorized copy — not treated as guest/anonymous. |
| **Staff session expired / invalid** | Admin shell redirects to staff sign-in; **fan session unchanged** when present. |
| **Staff Hosted UI / Cognito unavailable** | Admin surfaces show unavailable or re-auth guidance; **catalog browse, room join, and guest chat read continue** on fan paths. |
| **Staff OAuth / PKCE failure** | Recoverable inline error on admin login or callback; **no silent blank admin shell**. |
| **Unlisted admin entry** | **`/admin/login`** is bookmark or direct URL only — no links from fan catalog or room chrome. |

## Participant A/V error taxonomy (#106)

Stable client **`code`** values map to **inline recoverable** copy at the camera/microphone toggles (or a dedicated **`role="status"`** region associated via **`aria-describedby`**). **No toast-only** for blocking publish failures (**`accessibility.md`**).

| **`code`** | Source | Toggle behavior | User-facing copy (template) |
| --- | --- | --- | --- |
| **`permission_denied`** | Browser **`getUserMedia`** **`NotAllowedError`** | Stays **off** | Camera/microphone permission was blocked. Check browser or system settings, then try again. |
| **`device_unavailable`** | **`getUserMedia`** **`NotFoundError`** / **`NotReadableError`** / **`OverconstrainedError`** | Stays **off** | No camera or microphone was found, or the device is in use by another app. |
| **`av_disabled`** | Token **403** or room snapshot / WS **`av_disabled`** | **Disabled** (host kill switch) | The host turned room A/V off. |
| **`publisher_cap_exceeded`** | Token **403** **`publisher_cap_exceeded`** | Returns **off** | This room has reached the maximum number of live cameras and microphones. Wait for someone to turn off A/V or ask the host. |
| **`rate_limited`** | Token **429** **`rate_limited`** | Returns **off** | Too many connection attempts. Wait a moment and try again. |
| **`fan_auth_required`** | Token **403** **`fan_auth_required`** | Stays **off** (should not render toggles for guests) | Sign in to use camera and microphone in this room. |
| **`sfu_publish_rejected`** | SFU signaling **`produce`** failure (non-cap) | Returns **off** | Could not publish your camera/microphone. Try again in a moment. |
| **`token_expired`** | SFU JWT expired mid-publish; reconnect did not restore producer | Returns **off** | Your video relay connection expired. Turn the control off and on again. |
| **`sfu_signaling_failed`** | SFU WebSocket closed after reconnect backoff exhausted | Returns **off** | Video relay connection lost. Refresh the page or wait for automatic reconnect. |

- **HTTP token denials** use API **`code`** from **`authorization.md`** where applicable.
- **SFU signaling errors** without a stable server code map to **`sfu_publish_rejected`** or **`sfu_signaling_failed`** at the client boundary.
- Copy may append a short technical hint in dev builds only (see **Dev-only hints (#141)** below); production uses the table strings above.
- Each toggle error associates copy via **`aria-describedby`** pointing at a dedicated **`role="status"`** element **`#riffsync-av-toggle-status`** in the chat column (shared by camera and mic toggles; latest error wins).

## Realtime drawer error taxonomy (hardening extension)

Extends participant A/V codes with **drawer-typed** failures. Each maps to **inline recoverable** copy at the appropriate surface: chat compose/status, video-relay status, AV toggles, or theater playback region. **Separate** chat vs video-relay status when both planes are visible.

| **`code`** | Drawer | Surface | Recoverable? | User-facing copy (template) |
| --- | --- | --- | --- | --- |
| **`CHAT_SEND_DROPPED`** | Chat WS | Compose / chat status | Yes | Message could not be sent. Check chat connection and try again. |
| **`TYPING_RATE_LIMITED`** | Chat WS | _(none — silent drop)_ | No | Excess typing signals dropped server-side; no user-facing banner. |
| **`CHAT_RECONNECTING`** | Chat WS | Chat status only | Yes | Reconnecting chat… |
| **`SIGNALING_TIMEOUT`** | SFU signaling | Video-relay status | Yes | Video relay is slow to connect. Waiting… |
| **`sfu_signaling_failed`** | SFU signaling | Video-relay status / toggles | Yes | Video relay connection lost. Refresh or wait for automatic reconnect. |
| **`ICE_FAILED`** | Connectivity | Video-relay status | Yes | Network connection failed. Check your network or VPN and try again. |
| **`TURN_RELAY_REQUIRED`** | Connectivity | Video-relay status | Yes | A relay connection is required but could not be established. Try again or check network settings. |
| **`PRODUCER_CLOSED`** | Produce/consume | Stage tiles (implicit) | Yes | Remote video tile removes when producer closes; no user toast unless publish/consume also failed. |
| **`sfu_publish_rejected`** | Produce/consume | AV toggles | Yes | (see participant A/V table above) |
| **`PLAYBACK_AUDIO_BLOCKED`** | Theater playback | Theater / mix region | Yes | Party audio is blocked. Tap to enable sound or check browser autoplay settings. |
| **`SFU_RELAY_URL_MISSING`** | SFU signaling | Page alert + video-relay status | No (config) | Video relay URL is missing. Set **`VITE_PUBLIC_SFU_WS_URL`** at build time or redeploy API so **`POST /v1/webrtc/sfu-token`** returns **`wsUrl`**. |
| **`LOCAL_SFU_UNREACHABLE`** | SFU signaling | Page alert + video-relay status | No (config) | Local video relay is not running. Run **`npm run media:local`**, then confirm **`curl -sSf http://127.0.0.1:3000/healthz`**. |
| **`SFU_RELAY_UNREACHABLE`** | SFU signaling | Page alert + video-relay status | No (config) | Video relay is unreachable. Check **`docs/sfu-deploy-checklist.md`** and **`/healthz`** on the signaling host. |

- Drawer codes must **not** collapse into a single generic "connection lost" when planes are independent.
- **`PRODUCER_CLOSED`** is the normative outcome for camera-off partial teardown; frozen tiles indicate client non-compliance.
- **`PRODUCER_CLOSED`** does **not** appear in drawer status banners or **`getDiagnostics().activeErrorCodes`** — tile detach is the only fan-visible outcome unless a separate publish/consume error is active.

## Surface mapping (#141)

Normative association from **`code`** to DOM surfaces and accessibility targets. Implementation: **`apps/web/src/room/realtimeDrawerErrors.ts`** + **`drawerErrorPresentation.ts`**.

| **`code`** | Primary surface | **`aria-describedby` / status target** | In **`activeErrorCodes`**? |
| --- | --- | --- | --- |
| Participant A/V rows | AV toggles | **`#riffsync-av-toggle-status`** | When toggle-blocking |
| **`CHAT_SEND_DROPPED`** | Compose inline + chat drawer banner | **`#riffsync-chat-compose-status`** + **`#riffsync-chat-drawer-status`** | Yes |
| **`CHAT_RECONNECTING`** | Chat drawer banner only | **`#riffsync-chat-drawer-status`** | No (lifecycle, not error code) |
| **`SIGNALING_TIMEOUT`** | Video-relay status | **`#riffsync-video-relay-status`** | Yes |
| **`sfu_signaling_failed`** | Video-relay status + AV toggles when publish blocked | **`#riffsync-video-relay-status`** / **`#riffsync-av-toggle-status`** | Yes |
| **`ICE_FAILED`** | Video-relay status | **`#riffsync-video-relay-status`** | Yes |
| **`TURN_RELAY_REQUIRED`** | Video-relay status | **`#riffsync-video-relay-status`** | Yes |
| **`PRODUCER_CLOSED`** | Stage tiles (implicit detach) | _(none — tile lifecycle only)_ | **No** |
| **`PLAYBACK_AUDIO_BLOCKED`** | Theater mix region | **`#riffsync-theater-audio-status`** | Yes |
| **`THEATER_AUDIO_SUSPENDED`** | Theater mix region (implicit resume) | **`#riffsync-theater-audio-status`** when copy shown | Yes while suspended |
| **`SFU_RELAY_*` config rows** | Page **`role="alert"`** + video-relay status | **`#riffsync-sfu-config-alert`** + **`#riffsync-video-relay-status`** | Yes |

## Dev-only hints (#141)

When **`import.meta.env.DEV`** (or equivalent Vite dev flag), append **` (code: {code})`** to the user-facing string for every row in both taxonomies. **Production builds omit the suffix.**

## Decisions (answered — realtime hardening)

| Question | Decision |
| --- | --- |
| Separate chat vs video-relay status? | **Yes** — simultaneous independent status surfaces per plane. |
| Server-side theater audio mixing? | **Deferred** — **`PLAYBACK_AUDIO_BLOCKED`** and client mix mitigations remain in scope; no server mix fallback this milestone. |
| Mic-only visibility on errors? | Tiles remove on video producer close; mic-only stays off strip/grid; no audible-only badge chrome. |

## Decisions (typed errors — #141)

| Question | Decision |
| --- | --- |
| **`PRODUCER_CLOSED` status chrome?** | **Tile-only** — exclude from **`activeErrorCodes`** and drawer banners; informational at consumer boundary only. |
| **Dev technical hints?** | Append **`(code: …)`** suffix in dev builds only for all taxonomy rows. |
| **AV toggle error association?** | Shared **`#riffsync-av-toggle-status`** **`role="status"`** region; camera/mic toggles reference via **`aria-describedby`**. |
| **Config-class SFU errors?** | Persistent page **`role="alert"`** until signaling **`session.ready`**; do not clear on reconnect attempt alone (**#137**). |

## Decisions (guest host-screen transitional UX — #151)

| Question | Decision |
| --- | --- |
| **Theater pre-capture / not sharing?** | Guest **`idle`** FSM → **Waiting for host to share…** on **`#riffsync-video-relay-status`** — not a drawer **`code`** row; informational **`role="status"`** only. |
| **Consumer attach pending?** | Guest **`verifying_media`** FSM → **Connecting to video relay…** on the same surface until live video track or **`running`**. |
| **Duplicate placeholder?** | Retire **"The host is not sharing video right now."** when FSM idle copy is shown (**`RoomPlaybackPanel`**). |

## Decisions (answered — presence and AV maturity)

| Question | Decision |
| --- | --- |
| Typing rate limit UX? | **Silent drop** — no toast or compose block; **`TYPING_RATE_LIMITED`** excluded from drawer banners and **`activeErrorCodes`**. |
| Presence reconnect errors? | Roster gap or loading until **`presence_request`** completes; no dedicated presence error code unless chat plane is **`degraded`**. |
| Join/leave line failures? | Non-blocking — failure to fan-out a system line does not block join; no user-visible error for ephemeral lines. |

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### existing-room-errors
- **Empty / transitional UX:** Video Chat zero-camera grid only (**`interface/presentation.md`** — centered sparse copy).
- **Kill-switch toggle affordance:** visible-disabled with host explanation per **`presentation.md`** (resolved).

### chromecast-local-errors
- **Resolved for #273:** start uses **`CAST_STARTING`** while waiting for custom receiver render confirmation and **`CAST_START_REJECTED`** when launch is rejected, canceled, or the receiver does not confirm stage-primary video plus chat overlay rendering.
- **Resolved for #274:** active Cast may use **`CAST_ACTIVE`** for the sender-local **`Now Casting`** stage. It remains local UI status only and must not appear in chat/video-relay drawer health.
- **Resolved for #278:** active-session disconnect, SDK-ended sessions, receiver app close, external TV stop, blocked receiver playback, and failed stop map to **`CAST_SESSION_ENDED`**, **`CAST_PLAYBACK_BLOCKED`**, or **`CAST_STOP_FAILED`**. All remain sender-local and keep normal room participation available.
- **Resolved for #278:** **`CAST_SESSION_ENDED`** and **`CAST_PLAYBACK_BLOCKED`** restore or keep in-page playback visible after local cleanup. **`CAST_STOP_FAILED`** leaves Stop Cast retryable only while the sender still believes a Cast session is active.
- **Resolved for #273:** start feedback uses local Cast status near the Cast action or stage-local Cast surface and must not merge with chat drawer or video-relay drawer health.

## Primary code pointers (optional)

- **`apps/web/src/room/realtimeDrawerErrors.ts`** — canonical drawer **`code`** union + module boundary helpers.
- **`apps/web/src/room/drawerErrorPresentation.ts`** — copy templates and surface id mapping.
- **`apps/web/src/room/av/participantAvErrors.ts`** — participant A/V toggle codes (existing).
