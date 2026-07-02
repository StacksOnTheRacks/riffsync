# Viewer-local Cast

## Introduction

Viewer-local Cast lets a room viewer send the RiffSync room presentation to a nearby Google Cast receiver while keeping the sender joined to the room for chat and normal room participation. The capability is optional, sender-local, and never room-authoritative.

This spec covers the current custom receiver path for the RiffSync presentation: stage-primary video with a bottom-right chat overlay. Native browser media Cast, YouTube-only Cast, tab mirroring guidance, or a receiver without the RiffSync chat overlay is not a substitute for this capability.

## Functional Specification

Cast availability is shown only in normal room view after local sender support and public receiver configuration are present. Unsupported, blocked, or unconfigured Cast omits the start action or shows local recoverable status without blocking room snapshot, chat, SFU media, expanded view, host controls, or normal playback.

Starting Cast opens the Google Cast device chooser through the Cast Framework sender session flow. The sender keeps normal in-page playback visible during startup. `Now Casting` appears only after the receiver confirms that it rendered the stage-primary presentation and chat overlay. A resolved sender session or receiver launch acknowledgement alone is not sufficient.

The receiver is a registered Custom Web Receiver launched by receiver application id and hosted at a reachable TLS URL, currently `/cast/receiver` on the production RiffSync origin. The receiver receives sender-proxied presentation snapshots and overlay updates over the Cast channel. It does not expose chat compose, reactions, participant A/V controls, People, Room, Profile, or host-only controls.

Every lifecycle outcome is local and recoverable: unavailable sender, chooser cancel, rejected start, receiver render timeout, receiver loss, blocked receiver playback, failed stop, navigation, reload, room leave, and cleanup. These states do not disrupt chat, room session, SFU state, host screen share, participant A/V, room mode, kill switch, presence, or other participants.

## Technical Specification

The web sender uses the current Google Cast Web Sender Framework. It loads `https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1`, assigns `window.__onGCastApiAvailable` before the SDK script loads, calls `cast.framework.CastContext.getInstance().setOptions(...)` with the configured receiver application id and `autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED`, and invokes `CastContext.requestSession()` to open the Cast chooser.

Sender availability is owned by the room Cast modules under `apps/web/src/room/cast/`. `castSenderSupportDetector.ts` owns one-time SDK script injection, the `data-riffsync-cast-framework="true"` script marker, callback registration order, callback timeout handling, and conversion of SDK load/configuration failures into unavailable sender support. `castSenderClient.ts` owns reading public `VITE_CAST_RECEIVER_APP_ID`, configuring `CastContext`, wrapping later `requestSession()` calls, and hiding provider internals from room UI. `castLaunchController.ts` (or equivalent) owns user-gesture launch: `CastContext.requestSession()`, the **45-second** launch timer, chooser cancel/reject handling, and transitions among `idle`, `launching`, and `session_pending_render`. `useCastAvailability` runs after normal room bootstrap and exposes only `checking`, `available`, or `unavailable` to React room surfaces.

The public receiver application id is `VITE_CAST_RECEIVER_APP_ID`. Missing or invalid configuration is local Cast unavailability, not a room configuration failure. It must not block room snapshot loading, chat WebSocket bootstrap, SFU media bootstrap, host controls, expanded view, or normal playback.

The receiver is a Custom Web Receiver registered in the Cast SDK Developer Console. It is launched by the configured app id, served from a public HTTPS receiver URL, and configures custom namespace `urn:x-cast:com.riffsync.presentation` in receiver options before `context.start(options)`.

The receiver remains sender-proxied only. It must not call RiffSync room HTTP APIs, open room WebSockets, request SFU tokens, create presence rows, publish chat, subscribe to room media services, mutate `share_state`, or change durable room fields. A future direct-joining receiver would require a separate integration and authorization review.

The receiver route is `/cast/receiver`, rendered by `apps/web/src/pages/cast/CastReceiverPage.tsx`. Receiver bootstrap lives in `apps/web/src/pages/cast/castReceiverSession.ts`: it loads the Cast receiver framework, registers `urn:x-cast:com.riffsync.presentation` as a JSON custom namespace, installs the namespace message listener, and only then calls `context.start(options)`. Receiver presentation lives in `apps/web/src/pages/cast/CastReceiverPresentation.tsx` and renders a chrome-free TV shell with stage-primary media plus a bottom-right chat overlay. The TV shell fills the viewport, keeps the stage primary contained at common 16:9 TV sizes, anchors the overlay inside safe insets, caps the overlay to no more than 40% of stage width and 45% of stage height, and scrolls chat internally.

The receiver's first-load placeholder copy is `Waiting for party presentation...`. If the stage primary is not available yet, the stage placeholder is `Waiting for room video...`. If provider or autoplay policy blocks receiver playback, the stage placeholder is `Playback needs attention on the sender.` Provider error codes, receiver device names, participant identifiers, and room-authority language stay out of receiver copy and logs.

Runtime shape stays outside `ChatSession`, `SfuMediaSession`, `TheaterPlayback`, and `RoomRealtimeSdk.getDiagnostics()`. Test-only hooks may inspect local Cast controller state or fake sender/receiver channels, but those hooks must not become room diagnostics, room messages, HTTP fields, SFU claims, active error codes, or persisted state.

The receiver render-confirmation gate (#304) starts after `CastContext.requestSession()` resolves and the sender enters `session_pending_render`. The receiver confirms readiness over `urn:x-cast:com.riffsync.presentation` with a JSON acknowledgement shaped as `type: "receiver_rendered"`, `schemaVersion: 1`, `snapshotId` matching the latest sender presentation snapshot, `stagePrimaryRendered: true`, and `chatOverlayRendered: true`. The acknowledgement is valid only when both the stage-primary presentation and required bottom-right chat overlay have rendered. Receiver page load, Cast session resolution, receiver launch, native media-only Cast, tab mirroring, YouTube-only receiver paths, stale `snapshotId` values, or partial flags must not activate Cast.

The sender owns a **30-second** receiver render-confirmation timer that starts when `requestSession()` resolves. Timeout, negative or partial acknowledgement, stale acknowledgement, Cast channel close, or receiver route failure before active Cast returns the controller to `idle`, shows `CAST_START_REJECTED` copy at the local Cast surface, keeps normal in-page playback visible, and leaves **Cast to TV** retryable when sender availability remains `available`. Only a valid positive acknowledgement transitions `session_pending_render` to `casting`, replaces the sender stage with **Now Casting** and Stop Cast, suppresses expanded view, and preserves chat, sidebar, room snapshot, SFU, and other participant state.

Relevant repository versions from package metadata: `@riffsync/web` uses React `^19.2.5`, React Router `^7.14.2`, TypeScript `~6.0.2`, Vite `^8.0.10`, and Vitest `^3.0.2`.

## Testing Strategy

Unit and component tests prove sender SDK bootstrap order, support gating, `CastContext.setOptions`, `requestSession()` use, local status mapping, focus behavior, `Now Casting` gating on receiver render confirmation, stop restoration, failed stop behavior, and idempotent cleanup.

The sender availability slice specifically verifies that the SDK callback is installed before script append, duplicate SDK scripts are not appended, script load failure or callback timeout resolves to unavailable, missing `VITE_CAST_RECEIVER_APP_ID` resolves to unavailable, `CastContext.setOptions` receives the configured receiver app id and `ORIGIN_SCOPED` auto-join policy, `Cast to TV` is hidden while checking or unavailable, unavailable copy stays at the normal-view Cast surface, expanded view exposes no Cast start action, and availability probing does not call room HTTP APIs, room WebSocket send paths, SFU token paths, or room mutation callbacks.

The launch slice (#302) specifically verifies that **Cast to TV** click invokes `CastContext.requestSession()` only when availability is `available`, launch shows `CAST_STARTING` copy at the Room sidebar Cast surface, chooser cancel and SDK reject map to `CAST_START_REJECTED` and restore **Cast to TV**, unresolved `requestSession()` aborts after **45 seconds** with `CAST_START_REJECTED`, successful session resolve enters `session_pending_render` without showing `Now Casting` or replacing the stage, launch does not call room HTTP mutation APIs or room WebSocket send paths, and tests stub the Cast Framework to prove the configured receiver app id is used instead of a native media Cast path.

The receiver render-confirmation slice (#304) specifically verifies that successful `requestSession()` without a matching `receiver_rendered` acknowledgement leaves **RoomPlaybackPanel** and normal room controls visible; no **Now Casting** panel, Stop Cast control, expanded-view suppression, room WebSocket message, room HTTP mutation, SFU token request, drawer diagnostic, or active error code appears. Tests cover the positive acknowledgement payload, stale `snapshotId`, missing `stagePrimaryRendered`, missing `chatOverlayRendered`, malformed or unknown acknowledgement type, Cast channel close before active Cast, and **30-second** render-confirmation timeout. Positive acknowledgement coverage asserts transition to active Cast and focus transfer to Stop Cast only when focus remains on the initiating **Cast to TV** action.

Receiver tests or stubs prove the custom namespace is configured before receiver context start, the receiver renders the stage-primary plus chat-overlay shell, and sender-proxied updates do not introduce direct room API, room WebSocket, SFU token, presence, or chat publishing behavior.

The receiver slice (#303) specifically verifies that `/cast/receiver` renders through `CastReceiverPage`, `castReceiverSession.test.ts` records namespace listener and `customNamespaces` setup before `context.start(options)`, `CastReceiverPresentation` renders stage-primary content plus a required chat overlay without sidebar tabs or compose controls, and component or screenshot fixtures cover 1280x720, 1920x1080, and 3840x2160 receiver viewports. Regression coverage must fail native media-only, tab-mirroring-only, and YouTube-only receiver paths that lack the RiffSync chat overlay or send render confirmation before both stage primary and overlay are present.

Integration and regression coverage prove every Cast lifecycle path leaves room authority untouched: no room HTTP mutations, no room WebSocket fan-out, no `share_state` variants, no SFU token claim changes, no drawer diagnostics, no active realtime error codes, and no presentation changes for other participants.

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
