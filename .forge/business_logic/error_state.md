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
| **Lost host** | **Timeout then end:** if no connection from the **`hostSessionId`** client remains and **`lastActivityAt`** exceeds the **stale-room** window (see **`STALE_ROOM_MS`** / sweeper), the room **leaves the lobby** and joins treat it as **ended** (**not found** / “party ended”). **No guest promotion** in MVP. UI: honest copy + redirect to **`/lobby`**. |
| **Episode changed by admin** | Broadcast metadata update (+ optional chat system line): guests already on the stream see the new program through capture; **no** expectation that guests load their own embed for the new ID in MVP. |

## Auth (optional)

| State | UX |
| --- | --- |
| **Facebook / Cognito down** | Degrade to **anonymous** for non-admin paths; admin surfaces show **maintenance**. |

## Primary code pointers (optional)

- Empty/error components in SPA.
