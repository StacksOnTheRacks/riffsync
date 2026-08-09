# Viewer-local Cast

## Introduction

Viewer-local Cast lets a room viewer send the RiffSync room presentation to a nearby Google Cast receiver while keeping the sender joined to the room for chat and normal room participation. The capability is optional, sender-local, and never room-authoritative.

This spec covers the Kosmi-like custom receiver path for the RiffSync presentation: Google Cast device picker, a sender-side **Now Casting** controller surface that leaves room chat interactive, and a distinct TV receiver view with full-screen party video plus a bottom-right chat overlay. Native browser media Cast, YouTube-only Cast, tab mirroring guidance, or a receiver without the RiffSync chat overlay is not a substitute for this capability.

## Functional Specification

Cast and Link TV are first-class room controls in the A/V control bar (icon-only Camera, Microphone, Cast, Link TV). Cast availability depends on local sender support and public receiver configuration (`VITE_CAST_RECEIVER_APP_ID`), not on experimental room feature opt-in. Unsupported or unconfigured Cast omits or disables the Cast control and may show local recoverable status without blocking room snapshot, chat, SFU media, participant A/V, expanded view, host controls, or normal playback. Link TV remains available without the Cast SDK.

Starting Cast opens the Google Cast device chooser through the Cast Framework sender session flow. The sender keeps normal in-page playback visible during startup. `Now Casting` appears only after the receiver confirms that it rendered the stage-primary presentation and chat overlay. A resolved sender session or receiver launch acknowledgement alone is not sufficient.

The receiver is a registered Custom Web Receiver launched by receiver application id and hosted at a reachable TLS URL, currently `/cast/receiver` on the canonical production RiffSync origin. The receiver receives sender-proxied presentation snapshots and overlay updates over the Cast channel. For active Theater share, it may also use a cast-scoped, read-only SFU consumer to play the same `host_screen` stream guests see. It does not expose chat compose, reactions, participant A/V controls, People, Room, Profile, or host-only controls.

The read-only receiver behavior is scoped to the Chromecast receiver/source presentation only. Regular Expanded View on a computer remains an interactive room surface: the sender stays on `/room/:roomId`, the overlay uses the normal room chat plane, and chat send, GIF, reaction, typing, scrollback, jump-to-latest, and signed-in / anonymous gates continue under the same rules as normal view (#318).

Every lifecycle outcome is local and recoverable: unavailable sender, chooser cancel, rejected start, receiver render timeout, receiver loss, blocked receiver playback, failed stop, navigation, reload, room leave, and cleanup. These states do not disrupt chat, room session, SFU state, host screen share, participant A/V, room mode, kill switch, presence, or other participants.

## Technical Specification

The web sender uses the current Google Cast Web Sender Framework. It loads `https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1`, assigns `window.__onGCastApiAvailable` before the SDK script loads, calls `cast.framework.CastContext.getInstance().setOptions(...)` with the configured receiver application id and `autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED`, and invokes `CastContext.requestSession()` to open the Cast chooser.

Sender availability is owned by the room Cast modules under `apps/web/src/room/cast/`. `castSenderSupportDetector.ts` owns one-time SDK script injection, the `data-riffsync-cast-framework="true"` script marker, callback registration order, callback timeout handling, and conversion of SDK load/configuration failures into unavailable sender support. `castSenderClient.ts` owns reading public `VITE_CAST_RECEIVER_APP_ID`, configuring `CastContext`, wrapping later `requestSession()` calls, and hiding provider internals from room UI. `castStartController.ts` owns user-gesture launch: `CastContext.requestSession()`, the **45-second** launch timer, chooser cancel/reject handling, and transitions among `idle`, `launching`, and `session_pending_render`. `useCastAvailability` runs after normal room bootstrap and exposes only `checking`, `available`, or `unavailable` to React room surfaces. Cast and Link TV render from `ParticipantAvToggles` in the sidebar footer A/V strip. Link TV opens a panel for pairing-code entry; the TV browser route `/tv` creates a short-lived code via `POST /v1/tv/pairing` and polls until claimed. Chromecast `/cast/receiver` and `/tv` share `TvClientShell`. Sessions correlate with `tvClientSessionId` and `playbackPath` on presentation snapshots.

The public receiver application id is `VITE_CAST_RECEIVER_APP_ID`. Missing or invalid configuration is local Cast unavailability, not a room configuration failure. It must not block room snapshot loading, chat WebSocket bootstrap, SFU media bootstrap, host controls, expanded view, or normal playback.

The receiver is a Custom Web Receiver registered in the Cast SDK Developer Console. It is launched by the configured app id, served from a public HTTPS receiver URL, and configures custom namespace `urn:x-cast:com.riffsync.presentation` in receiver options before `context.start(options)`.

The receiver remains sender-controlled. It must not call RiffSync room mutation APIs, open the room WebSocket, create presence rows, publish chat, mutate `share_state`, or change durable room fields. The only direct RiffSync service access allowed for the receiver is a cast-scoped, read-only SFU consumer token for `host_screen` playback, using sender-provided room/session playback metadata. This token must not grant publish privileges, participant A/V controls, room chat, roster writes, or host authority.

The Cast receiver route is `/cast/receiver` (`CastReceiverPage.tsx`); the browser TV route is `/tv` (`TvClientPage.tsx`). Both render `TvClientShell` (also wrapped by `CastReceiverPresentation` for tests). Cast receiver bootstrap lives in `castReceiverSession.ts`. Pairing TVs create/poll/claim via `/v1/tv/pairing*`. When the snapshot stage primary is `live_stream`, live playback is owned by `castReceiverLiveStream.ts`, which attaches a read-only `host_screen` SFU consumer (guest-equivalent ICE; no TV-only forced relay) and binds it to the TV `<video>`. Idle `youtube_embed` snapshots do not mount an unsynced YouTube iframe on the TV; they show waiting copy until Theater share provides `live_stream`. The TV shell fills the viewport, keeps the stage primary contained at common 16:9 TV sizes, anchors the overlay inside safe insets, caps the overlay to no more than 40% of stage width and 90% of stage height, renders chat without a full-panel translucent background (per-message glass chips, right-aligned TV-legible text, hidden scrollbar), fades each overlay line out about 10 seconds after first sight on the TV client, and scrolls chat internally when needed.

The receiver's first-load placeholder copy is `Waiting for party presentation...`. If the stage primary is not available yet, the stage placeholder is `Waiting for room video...`. If provider or autoplay policy blocks receiver playback, the stage placeholder is `Playback needs attention on the sender.` Provider error codes, receiver device names, participant identifiers, and room-authority language stay out of receiver copy and logs.

Runtime shape stays outside `ChatSession`, `SfuMediaSession`, `TheaterPlayback`, and `RoomRealtimeSdk.getDiagnostics()`. Test-only hooks may inspect local Cast controller state or fake sender/receiver channels, but those hooks must not become room diagnostics, room messages, HTTP fields, SFU claims, active error codes, or persisted state.

The receiver render-confirmation gate (#304) starts after `CastContext.requestSession()` resolves and the sender enters `session_pending_render`. The receiver confirms readiness over `urn:x-cast:com.riffsync.presentation` with a JSON acknowledgement shaped as `type: "receiver_rendered"`, `schemaVersion: 1`, `snapshotId` matching the latest sender presentation snapshot, `stagePrimaryRendered: true`, and `chatOverlayRendered: true`. The acknowledgement is valid only when both the stage-primary presentation and required bottom-right chat overlay have rendered. For `live_stream`, stage-primary is not rendered until the receiver has a live `host_screen` media track bound to the TV `<video>`. Receiver page load, Cast session resolution, receiver launch, native media-only Cast, tab mirroring, YouTube-only receiver paths, stale `snapshotId` values, or partial flags must not activate Cast.

The sender owns a **30-second** receiver render-confirmation timer that starts when `requestSession()` resolves. Timeout, negative or partial acknowledgement, stale acknowledgement, Cast channel close, or receiver route failure before active Cast returns the controller to `idle`, shows `CAST_START_REJECTED` copy at the local Cast surface, keeps normal in-page playback visible, and leaves **Cast to TV** retryable when sender availability remains `available`. Only a valid positive acknowledgement transitions `session_pending_render` to `casting`, replaces the sender stage with **Now Casting** and Stop Cast, suppresses expanded view, and preserves chat, sidebar, room snapshot, SFU, and other participant state.

The lifecycle authority matrix (#305) treats every Cast path as a sender-local transition over the local Cast controller. Start, pending render, active Cast, intentional stop, receiver loss, blocked receiver playback, failed stop, sender navigation, reload, room leave, and cleanup must preserve the current HTTP room snapshot, room WebSocket membership, `share_state`, `roomMode`, `avDisabled`, SFU token claims, SFU producer/consumer state, chat scrollback and send eligibility, presence roster semantics, and every other participant's stage, controls, drawer status, chat state, and playback. The only user-visible mutation allowed outside the receiver is the casting viewer's local Cast surface and normal sender-stage swap.

Issue #305 may add test-only local evidence for this matrix: controller-local lifecycle snapshots, fake sender clients, fake receiver-channel events, fake room HTTP/WebSocket send spies, `RoomRealtimeSdk.getDiagnostics()` snapshots before and after Cast transitions, and multi-viewer component fixtures. These hooks must remain private to tests or local support output and must not become room payloads, room diagnostics drawers, active error codes, CloudWatch product metrics, persisted room fields, or receiver-identifying logs.

Relevant repository versions from package metadata: `@riffsync/web` uses React `^19.2.5`, React Router `^7.14.2`, TypeScript `~6.0.2`, Vite `^8.0.10`, and Vitest `^3.0.2`.

## Testing Strategy

Unit and component tests prove sender SDK bootstrap order, support gating, `CastContext.setOptions`, `requestSession()` use, local status mapping, focus behavior, `Now Casting` gating on receiver render confirmation, stop restoration, failed stop behavior, and idempotent cleanup.

The sender availability slice specifically verifies that the SDK callback is installed before script append, duplicate SDK scripts are not appended, script load failure or callback timeout resolves to unavailable, missing `VITE_CAST_RECEIVER_APP_ID` resolves to unavailable, `CastContext.setOptions` receives the configured receiver app id and `ORIGIN_SCOPED` auto-join policy, `Cast to TV` is hidden while checking, unavailable, or outside the pre-release experimental room feature opt-in, unavailable copy stays at the normal-view Cast surface, expanded view exposes no Cast start action, Cast-only gating does not hide participant A/V or host controls, and availability probing does not call room HTTP APIs, room WebSocket send paths, SFU token paths, or room mutation callbacks.

The launch slice (#302) specifically verifies that **Cast to TV** click invokes `CastContext.requestSession()` only when availability is `available`, launch shows `CAST_STARTING` copy at the Room sidebar Cast surface, chooser cancel and SDK reject map to `CAST_START_REJECTED` and restore **Cast to TV**, unresolved `requestSession()` aborts after **45 seconds** with `CAST_START_REJECTED`, successful session resolve enters `session_pending_render` without showing `Now Casting` or replacing the stage, launch does not call room HTTP mutation APIs or room WebSocket send paths, and tests stub the Cast Framework to prove the configured receiver app id is used instead of a native media Cast path.

The receiver render-confirmation slice (#304) specifically verifies that successful `requestSession()` without a matching `receiver_rendered` acknowledgement leaves **RoomPlaybackPanel** and normal room controls visible; no **Now Casting** panel, Stop Cast control, expanded-view suppression, room WebSocket message, room HTTP mutation, SFU token request, drawer diagnostic, or active error code appears. Tests cover the positive acknowledgement payload, stale `snapshotId`, missing `stagePrimaryRendered`, missing `chatOverlayRendered`, malformed or unknown acknowledgement type, Cast channel close before active Cast, and **30-second** render-confirmation timeout. Positive acknowledgement coverage asserts transition to active Cast and focus transfer to Stop Cast only when focus remains on the initiating **Cast to TV** action.

Receiver tests or stubs prove the custom namespace is configured before receiver context start, the receiver renders the stage-primary plus chat-overlay shell, sender-proxied updates do not introduce room mutation or chat publishing behavior, and `live_stream` confirmation waits for a live media track before entering active Cast.

The receiver slice (#303) specifically verifies that `/cast/receiver` renders through `CastReceiverPage`, `castReceiverSession.test.ts` records namespace listener and `customNamespaces` setup before `context.start(options)`, `CastReceiverPresentation` renders stage-primary content plus a required chat overlay without sidebar tabs or compose controls, and component or screenshot fixtures cover 1280x720, 1920x1080, and 3840x2160 receiver viewports. Regression coverage must fail native media-only, tab-mirroring-only, and YouTube-only receiver paths that lack the RiffSync chat overlay or send render confirmation before both stage primary and overlay are present.

Regression coverage for #318 proves the split between the two overlay paths: regular `/room/:roomId` Expanded View renders the interactive room chat overlay with compose/send, GIF, reaction, jump-to-latest, and typing behavior under normal chat health gates, while the Chromecast receiver/source presentation remains read-only and lacks compose, reactions, participant A/V controls, People, Room, Profile, and host controls.

Integration and regression coverage prove every Cast lifecycle path leaves room authority untouched: no room HTTP mutations, no room WebSocket fan-out, no `share_state` variants, no SFU token claim changes, no drawer diagnostics, no active realtime error codes, and no presentation changes for other participants.

The #305 lifecycle matrix specifically covers:

| Path | Local sender expectation | Required unchanged evidence |
| --- | --- | --- |
| Start / `launching` | `CAST_STARTING` is local; normal in-page playback, chat, and room controls remain mounted. | No room HTTP mutation, room WebSocket send, SFU token request, presence write, chat send, `share_state`, or other-participant UI change. |
| Pending render | `session_pending_render` waits for valid receiver acknowledgement while normal playback remains visible. | Same authority evidence as start, plus no **Now Casting**, Stop Cast, expanded-view suppression, or room diagnostics field before confirmation. |
| Active Cast | Only the casting sender stage swaps to **Now Casting** and Stop Cast after valid receiver render confirmation. | Other participants' stage, chat, People roster, drawer statuses, SFU media, host controls, room snapshot, and playback remain unchanged. |
| Normal Stop Cast | Successful stop restores the casting sender's normal stage from local room state. | No room refetch solely for stop, no chat/SFU teardown, no `share_state`, no room patch, no other-participant fan-out. |
| Receiver loss / session ended | Active sender exits Cast locally with `CAST_SESSION_ENDED` recovery copy and normal playback restored or kept visible. | Chat, presence, room membership, SFU media, and other viewers remain unchanged. |
| Receiver playback blocked | Sender shows `CAST_PLAYBACK_BLOCKED` locally and keeps or restores normal in-page playback. | No provider codes in room surfaces; no room diagnostics, SFU claim, chat, presence, or other-viewer mutation. |
| Failed Stop Cast | Sender keeps Stop Cast retryable when an active route remains; otherwise cleanup returns locally. | Failed stop does not pretend room state changed and does not clear healthy chat/SFU/theater modules. |
| Navigation / reload / room leave | Local cleanup releases Cast handles/listeners best-effort before or alongside normal room teardown. | Cast cleanup must not block room leave, synthesize room messages, or create stale persisted Cast state for late joiners. |
| Cleanup idempotency | Repeated cleanup removes stale timers, receiver channel listeners, sender handles, hidden bindings, and Cast UI. | No stale **Now Casting**, no detached focus target, no retained receiver binding, and no room-authority side effect. |

Automated tests for #305 use fake timers and spies to assert HTTP room fetch/mutation counts, room WebSocket outbound frames, SFU token calls, `ChatSession`, `SfuMediaSession`, and `TheaterPlayback` teardown calls, `RoomRealtimeSdk.getDiagnostics()` drawer snapshots, chat/presence state, and other-participant render output before and after each lifecycle path. Manual smoke rows on physical Cast hardware are limited to browser/Cast behavior that CI cannot emulate: chooser launch, receiver render, active TV display, Stop Cast, receiver disconnect, blocked playback where reproducible, and reload/navigation cleanup. Manual evidence must omit receiver device names, receiver identifiers, room ids, session ids, fan subs, raw provider errors, and participant identifiers from committed notes.

Operations readiness includes manual smoke tests on physical Cast-capable sender and receiver devices because CI cannot fully emulate Cast device discovery and launch behavior. Release checks cover Cast SDK Developer Console registration, public build-time receiver app id, receiver URL reachability, TLS, CSP/script/frame policy, origin allowlist where applicable, and production receiver route availability.

Manual launch verification (#302) on physical hardware must confirm: activating **Cast to TV** opens the Cast Framework chooser for the registered RiffSync Custom Web Receiver app id; the receiver loads the sender-origin `/cast/receiver` route rather than a browser tab-cast or Default Media Receiver path; cancel, reject, and launch-timeout paths return to normal in-page playback with local status only; and **`requestSession()`** resolution without receiver render confirmation does not show **Now Casting** (render confirmation checks continue in #304).

## References

- `.ai/business_logic/domain_model.md`
- `.ai/business_logic/error_state.md`
- `.ai/business_logic/user_stories.md`
- `.ai/integration/external_systems.md`
- `.ai/integration/api_contracts.md`
- `.ai/integration/messaging_async.md`
- `.ai/interface/interaction_flow.md`
- `.ai/interface/presentation.md`
- `.ai/interface/input_handling.md`
- `.ai/interface/accessibility.md`
- `.ai/runtime/configuration.md`
- `.ai/runtime/startup_bootstrap.md`
- `.ai/runtime/execution_model.md`
- `.ai/runtime/lifecycle_shutdown.md`
- `.ai/operations/build_packaging.md`
- `.ai/operations/deployment_environments.md`
- `.ai/operations/observability.md`
- `.ai/operations/security.md`
