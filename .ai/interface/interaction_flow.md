# Interaction flow

Primary navigation aligned with **`docs/architecture.frontend.md`**.

## Routes (MVP)

| Route | Flow |
| --- | --- |
| **`/` / catalog** | Grid/list → **Sign in to host** → **`POST /v1/rooms`** → **`/room/:id`** as admin with episode seed; **anonymous** visitors browse or follow join links only. |
| **`/watch/:catalogId`** *(optional)* | Prefer **redirect** to **`/room/:...`** so playback logic stays unified; if retained briefly, must not fork drift-prone parallel-sync assumptions. |
| **`/room/:roomId`** | **Admin (`JWT.sub === hostSub`):** picker + embed + broadcast, host control bar (room mode, AV kill switch). **Signed-in fans:** participant camera/mic toggles above compose. **Guests:** Lazy **`sessionId`**, inbound **`MediaStream`**, **Now watching**, chat, subscribe-only participant AV — **no camera/mic toggle chrome** (**`authorization.md`**). |
| **`/lobby`** | Public rooms from **`GET` lobby API** → navigate to **`/room/:id`**. |
| **`/admin/login`** | **Unlisted** operator gate (bookmark or direct URL only; no links from catalog or room chrome). Primary action starts **staff** Cognito Hosted UI + PKCE; copy makes clear this is **operators only**, not fan Facebook sign-in. |
| **`/admin/auth/callback`** | Staff OAuth code exchange; on success navigates to stored **`returnTo`** or **`/admin`**; on failure shows **recoverable** error with **retry sign-in** (no silent blank shell). |
| **`/admin` / `/admin/*`** | **Staff JWT required** in the SPA before rendering protected admin chrome. Unauthenticated visitors redirect to **`/admin/login`** with intended path preserved for post-login return. **Auth slice:** minimal session probe at **`/admin`** (operator identity / group sanity check) and **Sign out**; catalog, lists, and roster UI are **out of scope** until later initiatives. |

Staff operator routes ship as **gated routes in the existing `apps/web` SPA** (one Vite build, one CloudFront origin). Fan routes (**`/auth/callback`**, catalog **Sign in to host**, room host flows) are unchanged.

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
2. **Preserve** SFU signaling session, **`participant_av`** producers/consumers, strip/grid tiles, and theater participant mic mix.
3. **Do not** close the full SFU session or reset participant AV toggles for this event alone.

### `share_state: started` (guest host-screen re-attach — #146)

When the host starts screen-share and guests receive authoritative **`share_state: started`** in **Theater** mode:

1. **Do not** close or rebuild the SFU signaling session.
2. **Do not** detach or reset **`participant_av`** consumers or strip/grid tiles.
3. Guest playback FSM transitions **`idle`** → **`verifying_media`** until a live **`host_screen`** video track is attached via SFU **`newProducer`** / consumer attach.
4. In **Video Chat** mode, **`share_state: started`** does **not** attach host-screen consumers — layout remains participant-grid primary.

### Participant video tile lifecycle (`producerClosed`)

1. **Camera off (local or remote):** On video **`producerClosed`** for **`participant_av`**, remove the strip/grid tile **promptly** for that **`sessionId`**. A **frozen last frame** after camera-off is a **contract violation**.
2. **Mic-only after camera-off:** Participant remains **audible**; tile stays **absent** from strip/grid (identity via **People** tab and chat). **No** avatar chips, audible-only badges, or speaking borders this milestone.
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

### Presence, typing, and People badges

1. **Roster on join:** Client sends **`presence_request`** after room WebSocket connect; server returns **`presence`** roster (with **`lastActiveAt`** / **`active`**) and requester-only **`chat_history`** (capped durable messages — **excludes** ephemeral join/leave system lines).
2. **Online vs active:** **Online** = row present on roster. **Active** = **`lastActiveAt`** within **2 minutes** (union of typing start, chat send, GIF post, reaction toggle, qualifying ping). **People** tab shows both badges per row.
3. **Qualifying actions update `lastActiveAt`:** Server persists epoch seconds on **RoomPresence** on each qualifying inbound route; rebroadcasts **`presence`** or patches roster entry so late joiners and refresh see accurate **active** state.
4. **Typing flow (signed-in fan):** On compose input, client sends **`typing_start`** (throttled client-side; server may **`TYPING_RATE_LIMITED`** drop excess — silent, **`error_state.md`**). Remotes render ellipsis in chat. **Typing start** marks sender **active**. Clear on send, blur/stop, disconnect, or TTL.
5. **Join/leave system lines (signed-in fans only):** On connect/disconnect of a connection with **`fanSub`**, server fans ephemeral **`chat_system`** (or equivalent) line to room WebSocket — e.g. **"DisplayName joined"** / **"DisplayName left"**. **Not** written to **RoomChat**; absent from **`chat_history`** replay. **Anonymous guests:** no line.
6. **Reconnect:** **`presence_request`** rehydrates roster and **`lastActiveAt`**; **active** badge may persist if engagement was recent. Chat and SFU reconnect **orthogonally** (**US-P0-12f**).

### Speaking indicator flows

1. **Video-on (Theater strip / Video Chat grid):** Client derives speaking from local mic analyser (self) or inbound audio track energy (remote) when producer is unmuted. Apply **speaking border/glow** on tile while above threshold (debounced tier TW).
2. **Mic-only:** No strip/grid tile. Speaking affordance on **People** roster row for that **`sessionId`** only.
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
| Participant AV toggle visibility across sidebar tabs? | **Always visible** above compose on **Chat**, **People**, **Room**, **Profile** when fan JWT present; **hidden** for anonymous guests. |
| Local self-preview in strip/grid? | **Yes** — **You** tile when local camera on. |
| Non-host room mode indicator? | **Layout only** — no read-only mode badge in MVP. |
| Narrow viewport participant video? | **Horizontal scroll row** below movie/grid primary region. |
| Mic-only in Video Chat grid? | **Excluded**; audio heard; identity via **People** / chat. |
| Host in strip/grid? | **Yes** when host camera is on. |
| Kill switch toggle UX? | **Visible but disabled** with explanation when host disabled room AV. |
| Video Chat tab-capture? | **Fully stop** on enter; **Share Source Tab** again on return to **Theater**. |
| Reconnect AV state? | Camera/mic **default off**; manual re-enable. |
| Chat vs video relay reconnect? | **Independent** — healthy drawer keeps running; each plane shows its own status surface (**`presentation.md`**). |
| `share_state: stopped` guest scope? | **`host_screen` detach only** — participant AV and SFU session persist. |
| Frozen frame on camera-off? | **Contract violation** — tile must leave strip/grid on video **`producerClosed`**. |
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
| Video Chat Beta? | Host control bar label when **`avDisabled`** false; layout fan-out unchanged. |
| AV decoupling UX? | Chat vs SFU reconnect and status **unchanged** from hardening — separate drawers. |

## Open implementation decisions

- **Typing TTL and client throttle:** debounce **`typing_start`** emissions and ellipsis expiry when composer idle — tier TW.
- **Speaking VAD debounce:** threshold and hold time before border/glow clears — tier TW.

## Primary code pointers (optional)

- Router config when SPA exists.
- **`apps/web/src/auth/fanHostedUiPkce.ts`**, **`fanTokens.ts`** — fan OAuth/PKCE and **`riffsync.fan*`** storage pattern to mirror for staff (**`/admin/auth/callback`**, **`riffsync.staff*`**).
- **`apps/web/src/room/sfu/sfuRelayStatusCopy.ts`** — guest host-screen FSM copy resolver (**#151**).
- **`apps/web/src/room/sessions/TheaterPlayback.ts`** — **`guestShareFsm`** source for guest host-screen attach states.
