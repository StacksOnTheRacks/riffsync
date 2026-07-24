# Interaction flow

Primary navigation aligned with **`docs/architecture.frontend.md`**.

## Routes (MVP)

| Route | Flow |
| --- | --- |
| **`/`** | Home marketing surface → catalog / watch-party entry points; **anonymous** visitors browse without minting **`sessionId`**. |
| **`/catalog`** | Catalog **hub**: four large text entry links in the page-header subtitle slot to subcategory pages + retained mixed/all-titles grid and shared chrome (search/sort); no public catalog chips. From a title card → **Sign in to host** → **`POST /v1/rooms`** → **`/room/:id`** as admin with episode seed; **anonymous** visitors browse or follow join links only. Pure catalog browse does **not** mint **`sessionId`**. |
| **`/catalog/mst3k`** | Public subcategory browse — aggregated Joel / Mike / Jonah / Emily titles in the shared subcategory shell (header + **`"Push the button, Frank"`** subtitle + search/sort + card grid). No secondary host-catalog chips. Same host/party start path from a title card as **`/catalog`**. |
| **`/catalog/community`** | Public subcategory browse — Community titles in the shared subcategory shell (header + **Community Made Riffs** subtitle + search/sort + card grid). Same host/party start path from a title card as **`/catalog`**. |
| **`/catalog/riff-material`** | Public subcategory browse — **Riff Material** titles (public label; slug **`riff-ready`**) in the shared subcategory shell (header + **Cheesy Flicks Ready to Riff** subtitle + search/sort + card grid). Same host/party start path from a title card as **`/catalog`**. |
| **`/catalog/movie-night`** | Public subcategory browse — Movie Night titles in the shared subcategory shell (header + **Pull the Family Together for a Movie Night** subtitle + search/sort + card grid). Same host/party start path from a title card as **`/catalog`**. |
| **`/watch/:catalogId`** *(optional)* | Prefer **redirect** to **`/room/:...`** so playback logic stays unified; if retained briefly, must not fork drift-prone parallel-sync assumptions. |
| **`/room/:roomId`** | **Admin (`JWT.sub === hostSub`):** picker + embed + broadcast, host control bar (room mode, AV kill switch), **Room** tab lobby visibility toggle (**Show in lobby** / **Link only**). **Signed-in fans:** participant camera/mic toggles above compose. **Guests:** Lazy **`sessionId`**, inbound **`MediaStream`**, **Now watching**, chat, subscribe-only participant AV — **no camera/mic toggle chrome** (**`authorization.md`**). |
| **`/lobby`** | Public rooms from **`GET` lobby API** → navigate to **`/room/:id`**. |
| **`/admin/login`** | **Unlisted** operator gate (bookmark or direct URL only; no links from catalog or room chrome). Primary action starts **staff** Cognito Hosted UI + PKCE; copy makes clear this is **operators only**, not fan Facebook sign-in. |
| **`/admin/auth/callback`** | Staff OAuth code exchange; on success navigates to stored **`returnTo`** or **`/admin`**; on failure shows **recoverable** error with **retry sign-in** (no silent blank shell). |
| **`/admin` / `/admin/*`** | **Staff JWT required** in the SPA before rendering protected admin chrome. Unauthenticated visitors redirect to **`/admin/login`** with intended path preserved for post-login return. **Auth slice:** minimal session probe at **`/admin`** (operator identity / group sanity check) and **Sign out**; catalog, lists, and roster UI are **out of scope** until later initiatives. |

Staff operator routes ship as **gated routes in the existing `apps/web` SPA** (one Vite build, one CloudFront origin). Fan routes (**`/auth/callback`**, catalog **Sign in to host**, room host flows) are unchanged.

## Catalog browse navigation

| Path | Flow |
| --- | --- |
| **Main-nav Catalog parent** | Navigates to the **`/catalog`** hub (not a non-navigating trigger-only control). |
| **Main-nav Catalog dropdown** | Lists four subcategory destinations in order: **MST3K** → **`/catalog/mst3k`**, **Community** → **`/catalog/community`**, **Riff Material** → **`/catalog/riff-material`**, **Movie Night** → **`/catalog/movie-night`**. Display names only (no helper microcopy). Desktop opens via hover and/or click; keyboard activation is required (**`input_handling.md`**, **`accessibility.md`**). |
| **Mobile Catalog** | Inside the existing hamburger / **`navbar-collapse`**, **Catalog** expands as an **inline accordion** that reveals the same four subcategory links in place — not a nested flyout and not hover-only. |
| **Hub entry links** | On **`/catalog`**, four large text links in the page-header subtitle slot navigate to the same four subcategory routes in the same order. |
| **Subcategory subtitles** | Each subcategory page replaces breadcrumb chrome with the route-fixed subtitle defined in **`presentation.md`** while keeping the H1 as the category label. |
| **Subcategory search / sort** | Same title-search and sort chrome as the hub; filters operate within the route-fixed `catalogs` set (not a second catalog picker). |
| **Staff-only catalog** | **`other`** never appears in hub links, dropdown, or subcategory chrome. |

## Staff operator auth (token and session boundaries)

**Login mechanism:** Cognito Hosted UI + PKCE, mirroring the fan pattern (`fanHostedUiPkce.ts` reference implementation). No custom username/password form in MVP.

| Storage | Namespace | Used for |
| --- | --- | --- |
| **localStorage** | **`riffsync.staff*`** (access, refresh, expiry keys) | Staff access token attached to **`/v1/admin/*`** as **`Authorization: Bearer`** |
| **sessionStorage** | **`riffsync.staff.*`** (PKCE verifier, OAuth state, **`returnTo`**) | Ephemeral staff OAuth round-trip only; must not collide with fan **`riffsync.pkceVerifier`** / **`riffsync.oauthState`** keys |

Fan token keys (**`riffsync.fan*`**) and fan PKCE session keys remain **untouched** by staff flows.

**Fan + staff coexistence:** Both sessions **may be active independently** in one browser (separate pools, separate storage). Opening **`/admin`** while hosting a room as a fan does not clear fan tokens; staff sign-out does not end fan hosting or anonymous guest **`sessionId`**. Admin HTTP calls send the **staff** bearer only; the fan token is **never** sent to **`/v1/admin/*`** even when both sessions exist.

**Staff sign-out:** Clears the **`riffsync.staff*`** namespace and navigates to **`/admin/login`**. Does **not** clear fan tokens, fan PKCE state, or anonymous **`sessionId`**. Cognito Hosted UI global logout is **not** required for the auth slice MVP.

**Unauthenticated admin access:** Any protected **`/admin/*`** request without a valid staff token redirects to **`/admin/login`** with **`returnTo`** capturing the intended path (query or sessionStorage at sign-in start, per implementation). After OAuth success, land on the saved path when it remains under **`/admin/*`**, otherwise **`/admin`**.

## Session establishment

**Lazy creation (cost-first):** Do **not** mint **`sessionId`** for pure catalog browsing. When the user **joins lobby or a room as a guest**—**opening `/lobby`**, **joining `/room/:id`**—generate **`sessionId`** + random **display name** (**`authorization.md`**). **Hosts** authenticate via **Cognito JWT** for **`POST /v1/rooms`** and publisher actions (**no anonymous host binding**).

1. **Client:** generate **`sessionId`** + display name at that first boundary; keep stable until site data cleared (**`architecture.frontend.md`**).
2. **WebSocket `$connect`:** send **`roomId` + sessionId`** (+ **`Authorization`** if signed in).

## Watch party participant AV (`/room/:roomId`)

No new routes; AV extends the existing room shell. **Realtime hardening** keeps the same user-visible flows below while splitting orchestration into jurisdictional session modules (**`ChatSession`**, **`SfuMediaSession`**, **`TheaterPlayback`**) behind a thin **`RoomPage`** shell (**`runtime/execution_model.md`**). **SFU is mandatory** in all environments; mesh WebRTC UI paths are removed.

### Drawer-independent reconnect (all roles)

1. **Chat plane** (room WebSocket) and **video relay plane** (SFU signaling) reconnect **independently**. A failure on one plane does **not** tear down the other unless explicit media policy requires it (kill switch, room leave, navigate away).
2. While **chat** is **`reconnecting`**, chat send may fail with recoverable feedback; **participant AV tiles**, host screen-share attachment, and theater mic mix **continue** when the SFU plane is healthy.
3. While **video relay** is **`reconnecting`**, chat send/receive **continues** when the room WebSocket is healthy; stage may show video-relay status and briefly lack new remote media until consumers reattach.
4. After full page refresh, participant camera/microphone still **default off**; user re-enables manually (privacy-first). Drawer reconnect policy does **not** auto-republish local AV.

### `share_state: stopped` (guest host-screen detach)

When the host stops screen-share and guests receive authoritative **`share_state: stopped`**:

1. **Detach `host_screen` consumers only** — clear host movie / tab-capture attachment and show honest **not sharing** placeholder in the guest playback region.
2. **Preserve** SFU signaling session, **`participant_av`** producers/consumers, row/grid tiles, and theater participant mic mix.
3. **Do not** close the full SFU session or reset participant AV toggles for this event alone.

### `share_state: started` (guest host-screen re-attach — #146)

When the host starts screen-share and guests receive authoritative **`share_state: started`** in **Theater** mode:

1. **Do not** close or rebuild the SFU signaling session.
2. **Do not** detach or reset **`participant_av`** consumers or row/grid tiles.
3. Guest playback FSM transitions **`idle`** → **`verifying_media`** until a live **`host_screen`** video track is attached via SFU **`newProducer`** / consumer attach.
4. In **Video Chat** mode, **`share_state: started`** does **not** attach host-screen consumers — layout remains participant-grid primary.

### Participant video tile lifecycle (`producerClosed`)

1. **Camera off (local or remote):** On video **`producerClosed`** for **`participant_av`**, remove the row/grid tile **promptly** for that **`sessionId`**. A **frozen last frame** after camera-off is a **contract violation**.
2. **Mic-only after camera-off:** Participant remains **audible**; tile stays **absent** from row/grid (identity via **People** tab and chat). **No** avatar chips, audible-only badges, or speaking borders this milestone.
3. **Local self-preview:** **You** tile removed when local camera off; toggling camera on again may create a new tile when video producer resumes.
4. **Host tab-capture** is separate from participant AV tiles; **`share_state: stopped`** follows the guest detach flow above, not participant tile rules.

### Host flows

1. **Room mode:** Host selects **Theater** or **Video Chat** from the control bar below the stage. Change is **durable** on the room document and **fan-out** to all participants via WebSocket.
2. **Theater → Video Chat:** If tab-capture is active, **fully stop** capture. Stage swaps to participant video grid; movie region is replaced.
3. **Video Chat → Theater:** Stage restores movie-primary layout. Host must click **Share Source Tab** again to resume broadcast (not automatic warm-resume).
4. **AV kill switch on:** Deny participant AV publish/consume server-side; UI reverts to movie + text chat only. **Video Chat** unavailable until re-enabled.
5. **AV kill switch off:** Restore participant AV surfaces per active **room mode**.

### Signed-in fan flows

1. **Enable camera/mic:** Toggle above compose (rendered on any sidebar tab when fan JWT present). Request device permission → mint SFU producer token → publish. Default **off** on join; **off** again after disconnect/refresh (manual re-enable).
2. **Disable camera/mic:** Toggle off tears down local producer; strip/grid updates for remote viewers and removes local **You** tile when camera off.
3. **Host kill switch active:** Toggles visible but **disabled** with explanation; no publish until host re-enables AV.

### Guest (anonymous) flows

- Subscribe to host screen-share and, when AV enabled, participant AV per layout rules.
- **No camera/mic toggle chrome** rendered; no sign-in overlay at AV placement. Chat compose retains its own **Sign In to Chat** overlay for send only.
- No camera/mic publish; may view video-on participants and hear mixed audio in **Theater** or **Video Chat**.

### Layout fan-out (all roles)

- Participants receive authoritative **room mode** and **AV kill switch** state on join snapshot and realtime updates.
- Non-host users cannot change mode; they see layout swap without confirmation.

### Expanded view (local UI, #259)

1. **Per-viewer toggle:** Any participant may enter or exit **expanded view** independently — **not** host-authoritative and **not** fan-out over WebSocket.
2. **Enter expanded (≥ 992px):** Stage primary fills the room stage column span; chat moves from sidebar column to **bottom-right transparent overlay** (chat-only chrome). The room route is already a no-header/no-footer full-viewport shell, so Expanded View does not control site chrome.
3. **Theater expanded:** Movie player remains primary inside the expanded stage container. When participant cameras are on, render the Theater camera row as a bottom-left overlay over the movie; when no cameras are on, omit the row so the movie may use the available expanded stage.
4. **Video Chat expanded:** Participant video grid fills stage; mic-only rules unchanged.
5. **Exit expanded:** Restore standard side-by-side stage + sidebar grid; active sidebar tab unchanged (defaults to last tab before expand if implementation tracks it; **Chat** tab content remains wired).
6. **Room mode change while expanded:** Apply new mode to stage primary **without** forcing exit — overlay chat rules stay the same.
7. **Reload / navigate away:** Expanded state **clears** — standard layout on return.
8. **Chat interactivity:** Regular Expanded View keeps the same sender-side room chat capabilities as normal view. Signed-in fans can compose text, GIFs, and reactions when the chat plane is healthy; anonymous guests can read chat and keep the existing sign-in gate for send. The read-only Chromecast receiver overlay must not be used as the regular Expanded View chat overlay (#318).

Implementation note: the expanded toggle is client-local React state in `RoomPage.tsx`; no room snapshot patch or WebSocket fan-out is sent when a viewer enters or exits expanded view.

### Chromecast Cast flow (local UI)

1. **Availability gate:** In normal room view, a Cast-capable sender may see **Cast to TV** after local sender support is detected and the existing experimental room feature opt-in is enabled. Until Cast is repaired and release-ready, non-experimental sessions must not show or activate **Cast to TV**. Unsupported, unavailable, or non-experimental Cast never blocks the normal stage, chat, expanded view, host controls, participant A/V, or room controls.
2. **Expanded-view exclusion:** Expanded view does not expose Cast entry. A viewer starts Cast from normal room view; the implementation may reuse expanded-view composition internally without toggling the sender into expanded view.
3. **Start Cast:** Activating **Cast to TV** begins a local Cast start attempt. The sender keeps the normal room session joined and chat usable during the attempt.
4. **Successful start:** Only after the custom receiver confirms that stage-primary video and the chat overlay rendered, the sender's normal stage replaces the regular video surface with **`Now Casting`** plus a stop affordance. **`requestSession()`** resolution or receiver launch alone must not trigger **`Now Casting`**. Other participants receive no room event and see no change.
5. **Receiver presentation:** The TV presentation follows the expanded-view composition model: stage primary/video plus chat overlay, no sidebar tab strip.
6. **Chat while casting:** Chat send/read/reaction/GIF behavior follows the same signed-in and anonymous rules as normal room view; Cast state must not block chat when the chat plane is healthy.
7. **Stop Cast:** Successful intentional Stop Cast returns the sender to normal in-page playback. Room session, chat state, selected sidebar tab, and latest authoritative room state remain intact.
8. **Failure / unavailable:** Start rejection, platform policy block, receiver loss before active Cast, or unsupported sender state returns to normal in-page playback with local recoverable status only. Do not leave the room, reset chat, or tear down healthy SFU/video relay state.
9. **Room authority preservation (#277):** Every Cast lifecycle path is sender-local. Starting, activating, stopping, failing, disconnecting, or clearing Cast must not send room WebSocket messages, change **`share_state`**, call room HTTP mutation APIs, change **`roomMode`** / **`avDisabled`**, alter SFU token eligibility, or change another participant's stage, controls, drawer status, chat state, presence, or playback.
10. **Verification (#279):** Automated and manual checks cover the lifecycle from availability through cleanup: support detection, start, active, stop, unavailable, failed-start, receiver-ended, playback-blocked, stop-failed, cleanup completion, room leave, navigation, and reload. Each path preserves sender chat/sidebar/room state and proves other participants receive no Cast-induced UI, messaging, or media change.

### Cast lifecycle authority matrix (#305)

The #305 refinement turns the broad authority invariant into executable lifecycle rows. All rows are sender-local and must be testable without adding room-wide Cast controls, durable Cast fields, receiver participant identity, host/guest playback-authority changes, or new room fan-out.

| Lifecycle path | Sender-local UI / recovery | Room and participant boundary |
| --- | --- | --- |
| Start attempt | **Cast to TV** enters local launch/pending status and keeps normal playback visible. | No room HTTP mutation, WebSocket send, SFU token request, presence write, chat send, `share_state`, or other-participant render change. |
| Active Cast | Only after receiver render confirmation, the casting sender stage shows **Now Casting** and Stop Cast. | Other participants see the same room snapshot, playback, chat, People roster, drawer status, SFU media, and controls as before Cast. |
| Normal Stop Cast | Stop returns the casting sender to normal in-page playback using the latest locally held authoritative room state. | Stop does not refetch or patch room state solely for Cast, emit room messages, close chat/SFU drawers, or affect other viewers. |
| Receiver loss / ended session | Sender exits active Cast with local `CAST_SESSION_ENDED` recovery and restores or keeps normal playback visible. | Receiver loss is not a room leave, host disconnect, `share_state: stopped`, presence change, chat event, or SFU policy change. |
| Blocked receiver playback | Sender shows local `CAST_PLAYBACK_BLOCKED` recovery and keeps room participation available. | Provider or autoplay failures stay off room drawer status, room logs, and other participant surfaces. |
| Failed Stop Cast | Sender keeps Stop Cast retryable while the route remains active, or performs local cleanup if the route has already ended. | Failed stop does not clear chat/sidebar state, close healthy SFU/theater modules, mutate room state, or imply the room stopped. |
| Sender navigation / reload | Best-effort Cast cleanup runs before or alongside normal room teardown. A new page load starts without persisted Cast state. | Cleanup does not block navigation, create late-join replay, persist Cast state, or broadcast room cleanup messages. |
| Cleanup idempotency | Repeated cleanup clears local timers, listeners, receiver bindings, hidden Cast source bindings, stale **Now Casting**, and detached focus targets. | No Cast cleanup path may synthesize HTTP, room WebSocket, SFU, chat, presence, or other-viewer state changes. |

### Cast sender availability flow (#301)

1. **Probe timing:** After the normal room shell exists, the sender availability hook loads the Google Cast sender SDK, installs **`window.__onGCastApiAvailable`** before script append, and attempts to configure **`CastContext`** for the custom receiver app id.
2. **Available:** Render **Cast to TV** only in the normal-view **Room** sidebar action group when the existing experimental room feature opt-in is enabled, the SDK reports availability, and **`CastContext.setOptions`** succeeds with **`VITE_CAST_RECEIVER_APP_ID`** and **`ORIGIN_SCOPED`** auto-join policy.
3. **Checking / unavailable / non-experimental:** While checking, render no Cast action. When unavailable because the SDK is absent, blocked, timed out, missing **`VITE_CAST_RECEIVER_APP_ID`**, cannot configure **`CastContext`**, or the room is not in the experimental opt-in, show no Cast action; if the implementation renders evaluated Cast status, keep any local copy at the Cast surface only. Do not use chat drawer, video-relay status, host feedback, room error boundaries, or global announcer copy for availability failure.
4. **No launch in this slice:** #301 does not call **`CastContext.requestSession()`** as part of availability detection. User gesture launch, chooser cancellation, start rejection, receiver render timeout, active **`Now Casting`**, stop, and cleanup focus behavior are handled by later M26 slices.
5. **Room isolation:** Availability probing does not call room HTTP APIs, publish room WebSocket messages, request SFU tokens, change **`share_state`**, alter **`roomMode`** / **`avDisabled`**, change presence, reset chat/sidebar state, or expose receiver/device identifiers to the room.

### Cast launch flow (#302)

1. **Entry:** Only a user gesture on **Cast to TV** in normal room view when availability is **`available`** may call **`CastContext.requestSession()`**. Availability probing and expanded view must not invoke launch.
2. **Launching:** On click, enter local **`launching`** state, show **`CAST_STARTING`** copy (**Starting Cast…**) at the Room sidebar Cast surface, and start a **45-second** launch timer. Keep **`RoomPlaybackPanel`** and normal room controls visible. Do not show **`Now Casting`**, replace the stage, or enter expanded view.
3. **Chooser behavior:** **`requestSession()`** opens the Google Cast device chooser for the configured **`VITE_CAST_RECEIVER_APP_ID`**. The sender must not delegate launch to browser-native tab Cast, raw media Cast, or YouTube-only Cast controls.
4. **Chooser cancel:** When the user dismisses the chooser without selecting a device, clear the launch timer, return to **`idle`**, show **`CAST_START_REJECTED`** copy (**Cast could not start. Try again from this browser or device.**) at the Cast surface, and restore **Cast to TV** for retry. Room authority is unchanged.
5. **Launch reject / SDK error:** When **`requestSession()`** rejects or the Cast SDK reports a start error before session resolve, clear the launch timer, return to **`idle`**, show **`CAST_START_REJECTED`** at the Cast surface, and keep normal in-page playback. Do not expose provider error codes, receiver device names, or Cast app ids in room surfaces.
6. **Launch timeout:** If **`requestSession()`** does not resolve or reject within **45 seconds** of the initiating click, abort the pending launch attempt, return to **`idle`**, show **`CAST_START_REJECTED`** at the Cast surface, and keep normal in-page playback. This timeout covers chooser open, device selection, and session establishment only.
7. **Session pending render:** When **`requestSession()`** resolves successfully, transition to **`session_pending_render`**, keep **`CAST_STARTING`** copy and normal in-page playback visible, and wait for receiver render confirmation per #304. **`requestSession()`** resolution alone must not show **`Now Casting`** or hide the regular playback surface.
8. **Retry:** After cancel, reject, or launch timeout, **Cast to TV** remains available when sender support is still **`available`**. The viewer may retry immediately; no cooldown or room-side lockout.
9. **Focus:** During launch, focus stays on **Cast to TV** unless the viewer moves it. After failed launch, return focus to **Cast to TV** when still rendered. Do not move focus to **Stop Cast** in #302.
10. **Room isolation:** Launch, cancel, reject, timeout, and session-pending states do not call room HTTP mutation APIs, publish room WebSocket messages, request SFU tokens, change **`share_state`**, alter **`roomMode`** / **`avDisabled`**, change presence, reset chat/sidebar state, or change other participants' UI.

### Cast render confirmation flow (#304)

1. **Pending entry:** When **`requestSession()`** resolves, the sender is in **`session_pending_render`** and starts a **30-second** receiver render-confirmation timer. Normal in-page playback, chat, sidebar tabs, participant A/V controls, and room controls remain visible and usable.
2. **Receiver acknowledgement:** The receiver sends a JSON **`receiver_rendered`** acknowledgement over **`urn:x-cast:com.riffsync.presentation`** only after stage-primary video and the bottom-right chat overlay rendered. The acknowledgement must include **`schemaVersion: 1`**, the latest presentation **`snapshotId`**, **`stagePrimaryRendered: true`**, and **`chatOverlayRendered: true`**.
3. **Invalid acknowledgement:** Missing booleans, false booleans, stale **`snapshotId`**, malformed payloads, unknown acknowledgement type, receiver page load, or **`requestSession()`** resolution alone keep the sender out of active Cast.
4. **Timeout / pre-active failure:** If the 30-second timer expires, the Cast channel closes, or the receiver reports partial render before active Cast, clear the timer, return to **`idle`**, show **`CAST_START_REJECTED`** copy at the Cast surface, keep normal in-page playback visible, and leave **Cast to TV** retryable when availability remains **`available`**.
5. **Successful confirmation:** A valid positive acknowledgement clears the timer and transitions to active Cast. The sender replaces the normal stage with **Now Casting** and Stop Cast, suppresses expanded view while active, and preserves chat scrollback, compose draft, selected sidebar tab, room membership, presence, and participant A/V state.
6. **Focus:** If focus is still on the initiating **Cast to TV** action when active Cast begins, move focus to **Stop Cast**. If the viewer moved focus elsewhere during pending render, do not steal focus.
7. **Room isolation:** Pending render, invalid acknowledgement, timeout, retry, and successful confirmation do not call RiffSync room HTTP mutation APIs, publish room WebSocket messages, request SFU tokens, change **`share_state`**, change **`roomMode`** / **`avDisabled`**, alter presence, write durable Cast fields, or change other participants' UI.

### Cast-active sender flow (#274)

1. **Active entry:** #274 begins when the local Cast controller reaches active Cast after receiver render confirmation. Do not show **`Now Casting`** before that confirmation.
2. **Sender stage:** Replace the normal stage playback surface with **`Now Casting`** and Stop Cast. The sender remains in the room; sidebar tab state, chat draft, presence, and participant A/V controls remain sender-side.
3. **Stop intent:** Activating Stop Cast sends local stop intent to the Cast controller only. It does not emit room WebSocket messages, mutate room HTTP state, change **`share_state`**, or affect SFU permissions. Full return-to-playback behavior is the #276 continuation.
4. **Expanded view:** While local Cast is active, expanded view cannot be entered. If an internal expanded flag is still true when active Cast starts, clear it before rendering the active sender stage.
5. **Other viewers:** No other participant receives a Cast status, stage replacement, stop affordance, room mode change, or playback change because of this sender's active Cast.

### Cast stop restoration flow (#276)

1. **Stop entry:** The sender activates **Stop Cast** from the active **`Now Casting`** panel. The action enters only the local Cast controller stop path; it does not send room WebSocket messages, mutate room HTTP state, or change SFU permissions.
2. **Stopping feedback:** The active Cast panel may show local stopping feedback while cleanup runs. Chat, sidebar tabs, participant A/V controls, and room presence remain usable according to their existing health rules.
3. **Return target:** After successful stop cleanup, replace the **`Now Casting`** panel with the normal room stage playback surface for the current room mode and latest locally held authoritative room snapshot.
4. **State preservation:** Preserve chat scrollback, compose draft, selected sidebar tab, room membership, presence, participant A/V toggle state, and current room shell state. Do not enter expanded view automatically after stop.
5. **Sibling boundary:** Receiver disconnect, Cast SDK-ended active sessions outside explicit successful stop, stop failure, blocked Cast, and retryable failure copy are handled by #278. #276 may leave hooks for those states but does not define their UX.

### Friends and direct messaging

Friends/DM flows require an authenticated **fan** session. Anonymous guests and signed-out visitors never enter these paths. Domain rules (**FriendshipRequest**, **Friendship**, **DmThread**, unread clear-on-view, mutual remove) live in **`business_logic/domain_model.md`**; this section owns user-visible sequence only.

#### Main-site friends entry

1. **Signed-out:** Person-icon friends control is **absent** from the main header. User may still use **Sign In** / **Account** as today.
2. **Signed-in:** Person icon is visible in the header info strip. Activating it opens the friends dropdown (Catalog-style disclosure: keyboard open, Escape returns focus to trigger — **`accessibility.md`** / **`input_handling.md`**).
3. **From a friend row:** Activating the friend’s name (or primary open-DM control) opens the DM overlay panel for that peer with history sync on open (`PUT` ensure then `GET` history).
4. **Remove friend:** User activates **Remove friend** on an accepted row → confirm dialog → on success mutual teardown and closed DM if open.
5. **Outbound invite:** **Not** from this dropdown — use **People** roster context menu in a watch party (#377).

#### Add friend from People roster (#377)

1. **Who may invite:** Signed-in fan with fan JWT in the room session.
2. **Eligible targets:** Another **People** roster row whose member includes **`fanSub`** (signed-in fan). **Not** self. **Not** anonymous guest rows (no **`fanSub`**).
3. **Pointer path:** **Right-click** the eligible row → context menu primary action **Add friend** → `POST /v1/friends/requests` with **`recipientSub`** = peer **`fanSub`**.
4. **Keyboard path:** Each eligible row exposes a **More actions** overflow control (44×44 min target) opening the same menu as right-click — required because right-click alone is not keyboard-accessible.
5. **Menu states:** **Add friend** when no edge and no pending; **Request pending** (disabled) or **Cancel request** when outbound pending exists; **Friends** (disabled) when accepted edge exists; **Accept** / **Decline** remain on main-site / Friends-pane pending sections for inbound requests.
6. **Errors:** Inline toast or menu-adjacent status for **`already_friends`**, **`friend_request_inbound_exists`**, **`rate_limited`** — map HTTP **`code`** without exposing raw **`sub`** values.

#### Invite / accept lifecycle (UI)

1. **Send invite:** Signed-in fan sends a friendship request to another fan (exact invite affordance placement/microcopy tier-TW). Until accept, the pair is **pending**, not an accepted friend with DM.
2. **Inbound pending:** Recipient sees pending requests and may **accept** or **decline**.
3. **Accept:** Durable friendship forms; both parties see each other as accepted friends and may open/send on the 1:1 DM.
4. **Decline:** Pending clears; no friendship edge; no DM eligibility.
5. **Outbound pending:** Sender sees the request as pending (not yet a DM-capable friend row).

#### Watch-party Friends pane

1. Compact room header has **no** person-icon friends control.
2. Signed-in fan opens the right-column **Friends** surface (additive tab/panel beside **Chat** / **People** / **Room** / **Profile**). Same list, online, unread, remove, pending accept/decline, and DM open/compose behavior as the main-site flow.
3. Public room **Chat** and private **DM** remain usable in one party session without navigating away from **`/room/:roomId`**.
4. **People** roster flows are unchanged; Friends does not replace or merge into People.
5. Guests: no Friends manage / DM send chrome (Friends surface omitted or non-interactive empty — no guest invite/DM path).

#### DM view and unread

1. Opening a friend’s DM loads durable history (sync-on-open) and shows compose while friendship is active.
2. Incoming messages update unread on the friends list until the user **views** those messages in the DM panel; viewing clears unread for them.
3. Stick-to-bottom / jump-to-latest behavior follows room-chat presentation patterns (**`presentation.md`**).
4. DM plane health failures must not tear down a healthy room **ChatSession** / SFU (drawer-independent posture); honest inline status near DM compose when send/history fails (exact copy tier-TW / **`error_state.md`** when codes land).

#### Expanded View / Cast

1. Expanded overlay and Cast receiver omit the full sidebar tab strip. Friends manage and DM open remain available from normal room view (exit expanded) or main site — same boundary as People / Room / Profile today.
2. Cast receiver must not expose friends manage or authenticated DM compose.

### Presence, typing, and People badges

1. **Roster on join:** Client sends **`presence_request`** after room WebSocket connect; server returns **`presence`** roster (with **`lastActiveAt`** / **`active`**) and requester-only **`chat_history`** (capped durable messages — **excludes** ephemeral join/leave system lines).
2. **Online vs active:** **Online** = row present on roster. **Active** = **`lastActiveAt`** within **2 minutes** (union of typing start, chat send, GIF post, reaction toggle, qualifying ping). **People** tab shows both badges per row. **Friends-list online** (any-room RoomPresence) is a separate signal documented under **Friends and direct messaging** / **`presentation.md`** — do not treat People **active** as friends online.
3. **Qualifying actions update `lastActiveAt`:** Server persists epoch seconds on **RoomPresence** on each qualifying inbound route; rebroadcasts **`presence`** or patches roster entry so late joiners and refresh see accurate **active** state.
4. **Typing flow (signed-in fan):** On compose input, client sends **`typing_start`** (throttled client-side; server may **`TYPING_RATE_LIMITED`** drop excess — silent, **`error_state.md`**). Remotes render ellipsis in chat. **Typing start** marks sender **active**. Clear on send, blur/stop, disconnect, or TTL.
5. **Join/leave system lines (signed-in fans only):** On connect/disconnect of a connection with **`fanSub`**, server fans ephemeral **`chat_system`** (or equivalent) line to room WebSocket — e.g. **"DisplayName joined"** / **"DisplayName left"**. **Not** written to **RoomChat**; absent from **`chat_history`** replay. **Anonymous guests:** no line.
6. **Reconnect:** **`presence_request`** rehydrates roster and **`lastActiveAt`**; **active** badge may persist if engagement was recent. Chat and SFU reconnect **orthogonally** (**US-P0-12f**).

### Speaking indicator flows

1. **Video-on (Theater row / Video Chat grid):** Client derives speaking from local mic analyser (self) or inbound audio track energy (remote) when producer is unmuted. Apply **speaking border/glow** on tile while above threshold (debounced tier TW).
2. **Mic-only:** No row/grid tile. Speaking affordance on **People** roster row for that **`sessionId`** only.
3. **Muted mic:** No speaking affordance regardless of energy.
4. **Kill switch / producer closed:** Clear speaking state with tile removal or row update.

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Deep-link `/watch` vs `/room`? | **Room-first:** prefer **`/room/...`**; **`/watch`** only as temporary alias → redirect. |
| When is `sessionId` minted? | **Lazy:** first **lobby** or **`/room/:id` join** — **not** catalog browse alone; room **create** does **not** mint anonymous host (**JWT host instead**). |
| Admin UI delivery shape? | **Gated `/admin/*` routes** in the existing **`apps/web` SPA** (one build, one origin); not a separate admin SPA deploy target. |
| Fan + staff sessions in one browser? | **Coexist independently**; staff sign-out clears staff tokens only. |
| Discoverability of `/admin/login`? | **Unlisted** — bookmark/direct URL only; no public SPA links from fan surfaces. |
| Participant AV toggle visibility across sidebar tabs? | **Always visible** above compose on **Chat**, **People**, **Room**, **Profile**, and **Friends** (when present) when fan JWT present; **hidden** for anonymous guests. |
| Local self-preview in row/grid? | **Yes** — **You** tile when local camera on. |
| Non-host room mode indicator? | **Layout only** — no read-only mode badge in MVP. |
| Narrow viewport participant video? | **Horizontal scroll row** below movie/grid primary region. |
| Mic-only in Video Chat grid? | **Excluded**; audio heard; identity via **People** / chat. |
| Host in row/grid? | **Yes** when host camera is on. |
| Kill switch toggle UX? | **Visible but disabled** with explanation when host disabled room AV. |
| Video Chat tab-capture? | **Fully stop** on enter; **Share Source Tab** again on return to **Theater**. |
| Reconnect AV state? | Camera/mic **default off**; manual re-enable. |
| Room lobby visibility at create? | **Unchanged** — **`POST /v1/rooms`** from catalog still defaults **`visibility: public`**. |
| In-room lobby visibility toggle? | **Host-only** on **Room** sidebar tab: **Show in lobby** (**`public`**) vs **Link only** (**`private`**); **`PATCH /v1/rooms/{roomId}`** with optimistic UI + **`409`** rollback copy. Party URL unchanged either way. |
| Chat vs video relay reconnect? | **Independent** — healthy drawer keeps running; each plane shows its own status surface (**`presentation.md`**). |
| `share_state: stopped` guest scope? | **`host_screen` detach only** — participant AV and SFU session persist. |
| Frozen frame on camera-off? | **Contract violation** — tile must leave row/grid on video **`producerClosed`**. |
| Mic-only stage chrome? | **Unchanged** for tiles — off strip/grid; **speaking** on **People** rows for mic-only; no avatar chips or audible-only tile badges. |
| Media path (all envs)? | **SFU mandatory**; mesh WebRTC UI removed. |
| Chat send while chat **`reconnecting`**? | **Drop** send; show **sidebar chat status** **and** **inline compose feedback** (honest copy per **`error_state.md`** **`CHAT_SEND_DROPPED`**). |
| Chat send while SFU **`reconnecting`** / **`degraded`**? | **Allow** when room WS is **`open`** — compose stays enabled for signed-in fans; send proceeds; **no** SFU status on chat compose (**#149**). Retain draft on chat-plane drop only. |
| iOS software keyboard on room text focus? | **Player stays fully visible** (16:9 shell scales if needed); chat column compresses; all room text inputs that open the keyboard share this behavior (**#240**, **`presentation.md`**). |

## Guest host-screen status (SFU-only, #134)

Guests watching host tab-capture in **Theater** mode see status copy in the **playback region** (not AV toggles). Derived from remote **`MediaStream`** track liveness on the SFU **`host_screen`** consumer — not **`RTCPeerConnection`** FSM.

| State | Guest-visible copy (video-relay / playback region only) |
| --- | --- |
| **`idle`** | Waiting for host to share… |
| **`verifying_media`** | Connecting to video relay… |
| **`running`** | No status line |

**Chat WebSocket reconnect** is **not** shown in the playback region. Use the **sidebar chat drawer status** (**`presentation.md`**: **Reconnecting chat…**). Combined chat+video copy on the stage surface is a **contract violation** (#147).

Mesh-only strings (**`negotiating_ice`**, **`recovering_ice`**, **`Establishing encrypted path…`**, **`Verifying video feed…`**) retire with **`room/sharing/shareSessionFsm.ts`**.

## Decisions (answered — presence and AV maturity)

| Question | Decision |
| --- | --- |
| Typing flow? | Signed-in fan **`typing_start`** → remote ellipsis; marks **active**; silent server drop on rate limit. |
| Active badge source? | **`lastActiveAt`** on **RoomPresence**; 2-minute window; rehydrate on **`presence_request`**. |
| Join/leave lines? | **Signed-in fans only**; ephemeral WS fan-out; not in **RoomChat** or scrollback replay. |
| Speaking — video on? | Theater strip + Video Chat grid tile border/glow when mic unmuted. |
| Speaking — mic-only? | **People** tab row only. |
| Video Chat label? | No **Beta** or **Experimental** label; layout fan-out unchanged. |
| AV decoupling UX? | Chat vs SFU reconnect and status **unchanged** from hardening — separate drawers. |

## Decisions (answered — M22 typing UX)

| Topic | Decision |
| --- | --- |
| **`typing_start` debounce** | **300ms** trailing debounce before emitting **`typing_start`** while composing. |
| **`typing_stop` triggers** | Message send, compose blur, or **3s** without keystroke. |
| **Ellipsis expiry** | **5s** after last inbound **`typing_start`** without **`typing_stop`**. |

## Decisions (answered — M23 speaking flows #242)

| Topic | Decision |
| --- | --- |
| **VAD params** | Same as **`runtime/execution_model.md`** M23 table — **150ms** attack, **300ms** hang, RMS **≥ 0.02**. |
| **Tile vs People** | Tiles: speaking only when video consumer attached. People: speaking for mic-only and video-on when VAD active and mic not **`paused`**. |
| **Clear triggers** | **`producerClosed`**, kill switch, mic mute (**`pause`**), camera-off (tile speaking only). |

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### chromecast-interaction-flow
- Launch-phase copy and status placement for **`CAST_STARTING`**, chooser cancel, start rejected, and launch timeout are specified in **Cast launch flow (#302)** and **`error_state.md`** Local Cast status taxonomy.
- Launch-phase focus behavior is specified in **Cast launch flow (#302)** and **`input_handling.md`** Chromecast Cast controls. Focus on receiver confirmation success, Stop Cast success, stop failure, navigation, reload, and external receiver end remain in #304, #276, and #278.
- Tests that prove **`Now Casting`** is absent until receiver render confirmation and removed on cleanup without resetting sidebar/chat state are specified in **`.ai/specs/viewer-local-cast.spec.md`** and owned by #304 / #279 verification slices.

### catalog-sub-pages
- No open decisions remain for M32 catalog subcategory browse IA (#340). Normative nav, hub, subtitle, and mobile accordion rules are in **Catalog browse navigation** and **`presentation.md`** → **Decisions (M32 — catalog subcategory browse IA — #340)**.

### friends-and-direct-messaging
- **Tab order:** Exact sidebar tab order when **Friends** is present; focus restore when opening/closing nested DM vs Friends list — **#364**.
- **Badge clear timing:** Unread dot clears after **`POST .../read`** when viewer has **viewed** latest messages in open DM panel (not on dropdown open alone).
- Expanded View: optional compact DM entry vs always requiring exit to sidebar Friends — **#364** / Cast boundary.

## Primary code pointers (optional)

- Router config when SPA exists.
- **`apps/web/src/auth/fanHostedUiPkce.ts`**, **`fanTokens.ts`** — fan OAuth/PKCE and **`riffsync.fan*`** storage pattern to mirror for staff (**`/admin/auth/callback`**, **`riffsync.staff*`**).
- **`apps/web/src/room/sfu/sfuRelayStatusCopy.ts`** — guest host-screen FSM copy resolver (**#151**).
- **`apps/web/src/room/sessions/TheaterPlayback.ts`** — **`guestShareFsm`** source for guest host-screen attach states.
