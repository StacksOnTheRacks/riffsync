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

## Primary code pointers (optional)

- Empty/error components in SPA.
