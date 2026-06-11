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
| **Lost admin / host** | **Timeout then end:** if no healthy **publisher** connection tied to **`hostSub`** (per **`Connections`** metadata or heartbeat policy) and **`lastActivityAt`** exceeds **stale-room** window, hide from lobby and treat joins as ended. **No guest promotion** in MVP. UI: honest copy + redirect **`/lobby`**. |
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
| **Video relay plane degraded** | **Separate** status surface (e.g. "Video relay reconnecting"); chat read/send may continue when chat plane is healthy; participant toggles reflect publish/consume errors per taxonomy below. |
| **Theater playback blocked** | Inline honest copy when **AudioContext** suspend or autoplay blocks movie/mic mix; chat and SFU sessions may still be connected; user action may be required to resume audio (**client-side mix default**). |

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
- Copy may append a short technical hint in dev builds only; production uses the table strings above.

## Realtime drawer error taxonomy (hardening extension)

Extends participant A/V codes with **drawer-typed** failures. Each maps to **inline recoverable** copy at the appropriate surface: chat compose/status, video-relay status, AV toggles, or theater playback region. **Separate** chat vs video-relay status when both planes are visible.

| **`code`** | Drawer | Surface | Recoverable? | User-facing copy (template) |
| --- | --- | --- | --- | --- |
| **`CHAT_SEND_DROPPED`** | Chat WS | Compose / chat status | Yes | Message could not be sent. Check chat connection and try again. |
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

## Decisions (answered — realtime hardening)

| Question | Decision |
| --- | --- |
| Separate chat vs video-relay status? | **Yes** — simultaneous independent status surfaces per plane. |
| Server-side theater audio mixing? | **Deferred** — **`PLAYBACK_AUDIO_BLOCKED`** and client mix mitigations remain in scope; no server mix fallback this milestone. |
| Mic-only visibility on errors? | Tiles remove on video producer close; mic-only stays off strip/grid; no audible-only badge chrome. |

## Open implementation decisions

- **Drawer error code table completion:** finalize toggle behavior, **`aria-describedby`** targets, and dev-only technical hints for every row in both taxonomies.
- **Empty / transitional UX:** Video Chat zero-camera grid and Theater pre-capture states (**`interface/presentation.md`**).
- **Kill-switch toggle affordance:** visible-disabled with host explanation vs hidden when **`avDisabled`** (**`user_stories.md`**).

## Primary code pointers (optional)

- Empty/error components in SPA.
