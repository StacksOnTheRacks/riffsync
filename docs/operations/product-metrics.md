# Product metrics instrumentation contract

Canonical contract for **primary product funnel** telemetry in RiffSync. Downstream implementation tickets ([#438](https://github.com/StacksOnTheRacks/riffsync/issues/438) GA4 custom events, [#439](https://github.com/StacksOnTheRacks/riffsync/issues/439) CloudWatch `RiffSync/Product` counters) **must use the event names, parameter keys, Route strings, and Outcome enum values defined here verbatim**. No ad-hoc renames.

**Related docs:** `.ai/operations/observability.md` (ops drawer telemetry and namespace boundaries), `apps/web/src/config/googleAnalytics.ts` (GA4 bootstrap), `infra/cdk/lambda/riffsync-observability.ts` (stdout EMF helpers).

---

## Primary metric to signal mapping

| Primary metric | Product intent | GA4 event | CloudWatch `Route` | Server trigger (CloudWatch) | Client trigger (GA4) |
| --- | --- | --- | --- | --- | --- |
| **Guest room join** | A guest successfully connects to an active hosted room (lobby or share URL) | `room_join` | `GuestRoomJoin` | WebSocket `$connect` handler returns **200** for a **guest** (no fan JWT) joining a valid room | After room WebSocket opens and the guest session is accepted |
| **Host broadcast start** | A hosted room starts shared video (screen/tab capture) at least once | `host_broadcast_start` | `BroadcastStarted` | WebSocket `share_state` route returns **200** with `state: started` | After host `share_state` `started` is acknowledged (client may fire on successful send or inbound fan-out) |
| **Signed-in room create from catalog** | A signed-in host creates a watch-party room from catalog flow | `host_room_create` | `RoomCreate` | `POST /v1/rooms` returns **201** with authenticated host JWT | After successful room create response when origin is catalog browse |
| **Solo watch start** | A signed-in or guest user starts solo catalog playback (no room) | `solo_watch_start` | *(none in v1)* | **Deferred** — solo watch has no normative server counter in v1; GA4 only | When solo watch playback surface becomes active (YouTube or custom host) |
| **Live channel entry** | A visitor loads an official Live channel page | `live_channel_view` | `LiveChannelView` | `GET /v1/live/{slug}` returns **200** | When Live channel page renders with a resolved channel payload |

Every GA4 event and CloudWatch `Route` in this table appears exactly once. Supporting metrics (Cast, friends/DM, stale-room sweep) are **out of scope** for v1 and may be added in a future contract revision.

---

## GA4 custom events

### Bootstrap and no-op behavior

- Measurement id comes from build-time **`VITE_GA_MEASUREMENT_ID`** (`getGaMeasurementId()` in `apps/web/src/config/googleAnalytics.ts`).
- When **`VITE_GA_MEASUREMENT_ID`** is unset or empty, **`trackGaEvent` (to be added in #438) and all custom funnel events no-op** — same posture as existing page views (`initGoogleAnalytics`, `trackGaPageView`).
- Custom events use **`gtag('event', …)`** after bootstrap completes. Page views remain on the existing `trackGaPageView` path.

### Event catalog

| Event name | When to fire | Required params | Optional params |
| --- | --- | --- | --- |
| `room_join` | Guest room WebSocket connect succeeds | `entry_surface`, `is_authenticated` | `source` |
| `host_broadcast_start` | Host starts screen/tab share (`share_state` `started`) | `is_authenticated` | `entry_surface`, `source` |
| `host_room_create` | Signed-in host creates a room (**201**) | `catalog_category`, `playback_host`, `is_authenticated` | `entry_surface`, `source` |
| `solo_watch_start` | Solo watch playback starts | `catalog_category`, `playback_host`, `is_authenticated` | `entry_surface`, `source` |
| `live_channel_view` | Live channel page loads with channel data | `is_authenticated` | `entry_surface`, `source` |

### Allowed parameter keys (low cardinality only)

| Parameter | Type | Allowed values | Notes |
| --- | --- | --- | --- |
| `entry_surface` | string | `lobby`, `share_link`, `catalog`, `live`, `solo`, `home`, `unknown` | Where the user entered the funnel step |
| `source` | string | `catalog_episode`, `lobby_card`, `share_url`, `live_index`, `direct`, `unknown` | Finer-grained UI origin within the surface; omit when unknown |
| `playback_host` | string | `youtube`, `custom` | Catalog episode playback host (`CatalogEpisode.playbackHost`) |
| `catalog_category` | string | `mst3k`, `rifftrax`, `community`, `riff_material`, `movie_night`, `other`, `live` | Matches `CatalogCategory` in `apps/web/src/catalog/catalogTypes.ts` |
| `is_authenticated` | boolean | `true`, `false` | Whether a fan JWT/session is present at fire time |

### Forbidden parameters and properties

Implementations **must not** send the following as GA4 event parameters or user properties:

- `roomId`, `sessionId`, `hostSub`, `fanSub`
- Email addresses, display names, chat text, DM bodies
- YouTube video ids, episode ids, Live slugs, or other stable content identifiers
- Raw URLs containing query tokens or share secrets

If a desired slice is not representable with the allowed enums above, **omit the parameter** or use `unknown` — never substitute a high-cardinality identifier.

---

## CloudWatch product counters (`RiffSync/Product`)

### Namespace and dimensions

| Field | Value |
| --- | --- |
| **Namespace** | `RiffSync/Product` |
| **Metric name** | `Requests` |
| **Dimensions** | `Environment`, `Route`, `Outcome` **only** |
| **Environment source** | `process.env.RIFFSYNC_ENVIRONMENT` via `riffsyncEnvironment()` |
| **Emit path** | Lambda **stdout EMF** (same pattern as `emitWsRealtimeEmf` / `emitApiEmf` in `infra/cdk/lambda/riffsync-observability.ts`) — **no** `PutMetricData` IAM expansion in v1 |

### Route catalog

| `Route` | Increment when | Handler / code pointer |
| --- | --- | --- |
| `GuestRoomJoin` | Guest `$connect` succeeds (**200**) | `infra/cdk/lambda/ws-connect.ts` |
| `BroadcastStarted` | `share_state` with `state: started` succeeds (**200**) | `infra/cdk/lambda/ws-route.ts` (`routeKey === 'share_state'`) |
| `RoomCreate` | Authenticated `POST /v1/rooms` succeeds (**201**) | Room create Lambda (see `infra/cdk/lib/api-catalog-stack.ts`) |
| `LiveChannelView` | `GET /v1/live/{slug}` succeeds (**200**) | Live get Lambda |

**v1 deferral:** `solo_watch_start` has **no** CloudWatch `Route`. Solo playback is client-only GA4 in v1 because there is no dedicated server endpoint that marks "playback started" without introducing high-cardinality or redundant HTTP noise. Revisit in a future contract if a low-cardinality server boundary is added.

### Outcome enum

Every product counter **must** use exactly one of these **`Outcome`** dimension values:

| `Outcome` | When to use |
| --- | --- |
| `success` | Handler completed the happy path (2xx as listed above) |
| `validation_error` | **400** — malformed input, missing required fields |
| `auth_forbidden` | **401** or **403** — missing/invalid JWT or publisher-only route denied |
| `not_found` | **404** — room, slug, or resource not found |
| `server_error` | **5xx** or unhandled exception path |

Map HTTP status codes to outcomes consistently within each handler. Do not invent alternate outcome strings for product counters.

### Example EMF shape

```json
{
  "_aws": {
    "Timestamp": 1710000000000,
    "CloudWatchMetrics": [
      {
        "Namespace": "RiffSync/Product",
        "Dimensions": [["Environment", "Route", "Outcome"]],
        "Metrics": [{ "Name": "Requests", "Unit": "Count" }]
      }
    ]
  },
  "Environment": "prod",
  "Route": "GuestRoomJoin",
  "Outcome": "success",
  "Requests": 1
}
```

---

## Privacy alignment

RiffSync's published Privacy Policy (`apps/web/src/pages/PrivacyPolicyPage.tsx`, section **2. Information we collect — Website analytics**) already discloses:

- Use of **Google Analytics 4 (GA4)** on the public site
- Collection of **aggregate traffic, page views, and general usage patterns**
- That GA4 may receive page URLs, referrer, device/browser type, and language
- That GA4 is **not** used to collect chat content, room passwords, or watch-party session payloads

The v1 custom funnel events (`room_join`, `host_broadcast_start`, `host_room_create`, `solo_watch_start`, `live_channel_view`) are **aggregate usage signals** with **low-cardinality enums only** — consistent with the existing GA4 disclosure. They do **not** expand collection to chat bodies, room content, or participant identity.

**Policy update for v1:** **Not required.** No Privacy Policy rewrite is needed unless a future ticket adds vendors, parameters, or collection scope beyond this contract.

---

## Ops-only namespace boundary

Primary product funnel counters live under **`RiffSync/Product`**. The following namespaces remain **drawer/ops telemetry** — they are **not** substitutes for product funnel KPIs and must **not** be repurposed as primary funnel metrics in dashboards or product reviews:

| Namespace | Purpose | Examples |
| --- | --- | --- |
| **`RiffSync/Realtime`** | Room WebSocket chat/control-plane health | `chat`, `typing_start`, `presence_request`, `ping` routes |
| **`RiffSync/Media`** | SFU / participant AV aggregate health | `SignalingConnections`, `TransportLimitRejected`, `SfuTokenDenied` |
| **`RiffSync/Api`** | HTTP API ops routes | `GiphySearch`, `FanAvatarUpload`, admin catalog mutations |

Product funnel dashboards ([#440](https://github.com/StacksOnTheRacks/riffsync/issues/440)) chart **`RiffSync/Product`** `Requests` by `Route` and `Outcome`. Ops dashboards continue to use the drawer namespaces above.

---

## Implementation checklist (for #438 / #439)

- [ ] GA4 helper reads measurement id from `getGaMeasurementId()`; custom events no-op when unset
- [ ] All five GA4 event names and parameter keys match this doc
- [ ] All four CloudWatch `Route` strings and five `Outcome` values match this doc
- [ ] EMF emitters added alongside existing helpers in `riffsync-observability.ts` (or sibling module imported there)
- [ ] Unit tests assert EMF JSON shape and forbidden dimensions/parameters
- [ ] No high-cardinality fields in GA4 params or CloudWatch dimensions

---

## Future metrics (not in v1)

The following supporting product signals from product planning may receive contract entries later:

- Cast start/stop/failure (local controller only today)
- Friends invite accept and DM send success
- Stale-room sweep effectiveness
- SFU/chat reconnect recovery without full session teardown

Do not implement these under `RiffSync/Product` or ad-hoc GA4 names until a contract revision lands.
