# Serialization

## Wire formats

| Channel | Format | Rules |
| --- | --- | --- |
| **HTTP REST** | **JSON** | **`application/json`**; UTF-8; dates **ISO 8601** (**`date-time`** / **`date`** per field). |
| **WebSocket** | **JSON** text frames | One JSON object per message; **`type`** or **`schemaVersion`** mandatory for app routes. |

## Schema authority

| Artifact | Role |
| --- | --- |
| **`data/catalog/catalog.schema.json`** | **Git bundle** episodes — CI validation target. |
| **API responses** | **Superset** of seed fields allowed (**Dynamo** columns); breaking removals require **`/v2`** or deprecation window. |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Protobuf for WS? | **No** MVP — JSON simplicity for browsers. |

## Primary code pointers (optional)

- Shared **`types/catalog.ts`** (or codegen from OpenAPI/schema) when app exists.
