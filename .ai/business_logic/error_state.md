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
| **Participant A/V publish rejected** | Inline error when SFU/token/capacity blocks publish (e.g. publisher ceiling); toggle returns to off; no silent failure. |
| **Reconnect after refresh/disconnect** | Signed-in fan camera and microphone **default off**; toggles show off until user manually re-enables (privacy-first). |
| **Video Chat with no video-on participants** | Grid shows honest empty/placeholder state; mic-only participants remain audible; host must **Share Source Tab** again after return to **Theater** if they had been sharing before Video Chat. |
| **Theater with mic-only participants** | Movie stream primary; mic audio heard; mic-only identities **not** shown in participant strip (People tab + chat). |

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

## Open implementation decisions

- **Participant A/V error taxonomy:** stable **`code`** values and recovery copy for permission denied, SFU publish rejected, token expiry mid-publish, and publisher-capacity hard-fail (coordinate with **`error_handling.md`**).

## Primary code pointers (optional)

- Empty/error components in SPA.
