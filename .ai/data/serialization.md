# Serialization

## Wire formats

| Channel | Format | Rules |
| --- | --- | --- |
| **HTTP REST** | **JSON** | **`application/json`**; UTF-8; dates **ISO 8601** (**`date-time`** / **`date`** per field). |
| **WebSocket** | **JSON** text frames | One JSON object per message; **`type`** or **`schemaVersion`** mandatory for app routes. Existing **`presence`** roster envelope unchanged; new host-admin AV/layout envelopes use distinct **`type`** values (exact strings tier-TW). |

## Room snapshot (HTTP)

**`GET /v1/rooms/{roomId}`** and host **`PATCH`** responses carry **`room`** object fields including **`version`**, **`roomMode`** (**`theater` \| `videoChat`**), **`avDisabled`** (boolean), and **`broadcastCaptureActive`** (boolean, nullable clear via **`null`** on PATCH per existing host-capture pattern). Enum strings are lowercase camelCase on the wire unless OpenAPI standardizes otherwise.

## SFU join token (HTTP → SFU WebSocket)

HMAC JWT payload today: **`env`**, **`roomId`**, **`sessionId`**, **`role`** (**`producer` \| `consumer`**), **`iat`**, **`exp`**. Participant A/V extends mint logic and may add claims (e.g. producer class, **`fanSub`**) — exact claim set tier-TW in integration; payload remains JSON inside base64url segments.

## Schema authority

| Artifact | Role |
| --- | --- |
| **`data/catalog/catalog.schema.json`** | **Git bundle** episodes — CI validation target. |
| **API responses** | **Superset** of seed fields allowed (**Dynamo** columns); breaking removals require **`/v2`** or deprecation window. |

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

## Open implementation decisions

- WebSocket **`type`** string values and payload shapes for **`roomMode`** / **`avDisabled`** fan-out — **`integration/api_contracts.md`** (#103).
- SFU **`listProducerSummaries`** JSON field names for participant identity — **#102** / layout runtime (#104/#105).

## Primary code pointers (optional)

- Shared **`types/catalog.ts`** (or codegen from OpenAPI/schema) when app exists.
