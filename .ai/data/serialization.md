# Serialization

## Wire formats

| Channel | Format | Rules |
| --- | --- | --- |
| **HTTP REST** | **JSON** | **`application/json`**; UTF-8; dates **ISO 8601** (**`date-time`** / **`date`** per field). |
| **WebSocket** | **JSON** text frames | One JSON object per message; **`type`** or **`schemaVersion`** mandatory for app routes. Existing **`presence`** roster envelope unchanged; new host-admin AV/layout envelopes use distinct **`type`** values (exact strings tier-TW). |

## Room snapshot (HTTP)

**`GET /v1/rooms/{roomId}`**, **`POST /v1/rooms` `201`**, and host **`PATCH` `200`** carry **`room`** / top-level fields including **`version`**, **`roomMode`** (**`theater` \| `videoChat`**), **`avDisabled`** (boolean), **`broadcastCaptureActive`** (boolean, nullable clear via **`null`** on PATCH per existing host-capture pattern), and playback mirrors **`playbackHost`**, **`customPlaybackUrl`** (**`string | null`**), and optional **`youtubeVideoId`**. Enum strings are lowercase camelCase on the wire unless OpenAPI standardizes otherwise.

## SFU join token (HTTP → SFU WebSocket)

HMAC JWT payload today: **`env`**, **`roomId`**, **`sessionId`**, **`role`** (**`producer` \| `consumer`**), **`iat`**, **`exp`**. Participant A/V extends mint logic and may add claims (e.g. producer class, **`fanSub`**) — exact claim set tier-TW in integration; payload remains JSON inside base64url segments.

## Schema authority

| Artifact | Role |
| --- | --- |
| **`data/catalog/catalog.schema.json`** | **Git bundle** episodes — CI validation target. Includes **`playbackHost`** (**`youtube`** \| **`custom`**) and host-conditional **`customPlaybackUrl`** (required when host is **`custom`**). |
| **Public catalog JSON** | **`projectEpisode`** (**`catalog-shared.ts`**) always emits **`playbackHost`** (**`youtube`** \| **`custom`**; missing/invalid Dynamo → **`youtube`**) and **`customPlaybackUrl`** (**`string | null`**, same wire class as **`youtubeWatchUrl`**). Also includes existing curator/TMDB fields per allowlist. |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Protobuf for WS? | **No** MVP — JSON simplicity for browsers. |
| Room mode on wire? | **`theater`** \| **`videoChat`** string enum in JSON (HTTP + WS). |

## Decisions (answered — #101 HTTP PATCH)

| Question | Decision |
| --- | --- |
| **`roomMode`** / **`avDisabled`** PATCH semantics? | **Omit-only** — absent keys leave the field unchanged. **`null`** is **not** accepted ( **`400`** ). Contrast **`broadcastCaptureActive`**, which allows **`null`** to clear the Dynamo attribute. |
| **`roomMode`** validation? | **`theater`** \| **`videoChat`** string enum; invalid value → **`400`**. |
| **`avDisabled`** validation? | Boolean only; invalid type → **`400`**. |
| Shared TypeScript types (#109)? | Extend **`apps/web/src/api/roomsApi.ts`** **`RoomSnapshot`**, **`RoomPatchResult`**, and **`patchRoom()`** patch parameter inline with Lambda response shapes; no generated OpenAPI in MVP. |

## Friends and DM (wire posture)

Friends list, pending requests, DM history, and unread badges use **JSON** over the existing fan-gated HTTP (and optional WebSocket push) channels. Attribute and JSON field names follow camelCase precedent (**`fanSub`**, **`displayName`**, **`avatarUrl`**, **`messageId`**). Exact route envelopes and realtime **`type`** strings belong to **`integration/api_contracts.md`**; this domain only requires that serialized friend rows can carry online derivation and unread signals without implying durable last-seen fields.

## Open implementation decisions

- WebSocket **`type`** string values and payload shapes for **`roomMode`** / **`avDisabled`** fan-out — **`integration/api_contracts.md`** (#103).
- SFU **`listProducerSummaries`** JSON field names for participant identity — **#102** / layout runtime (#104/#105).
- Friends/DM HTTP and WS envelope field names (request id, thread id, unread watermark, online boolean) — settle with integration; keep camelCase and avoid inventing last-seen timestamps on the wire for friends online.

## Primary code pointers (optional)

- Shared **`types/catalog.ts`** (or codegen from OpenAPI/schema) when app exists.
