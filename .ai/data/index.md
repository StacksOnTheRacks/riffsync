# Index — data

Scopes **logical entities**, **Dynamo/access patterns**, **JSON serialization**, **consistency** guarantees.

- Child contracts: **`data_model.md`**, **`persistence_abstractions.md`**, **`serialization.md`**, **`consistency.md`**.
- Repo anchors: **`data/catalog/catalog.schema.json`**, **`docs/architecture.catalog-images.md`**, **`docs/contracts.tmdb.md`** (full **`docs/`** map: **`.ai/knowledge_map.json`** → **repository_architecture**).

## Scope

- Record durable constraints and boundaries for this domain.
- Watch-party **participant A/V** adds host-admin fields on **Rooms** (`roomMode`, `avDisabled`, existing **`broadcastCaptureActive`** precedent), **RoomPresence** roster rows for SFU token gates, and **SFU runtime** producer state (not Dynamo).
- Keep this file aligned with mapped child contracts.

## Primary code pointers (optional)

- Add stable code directories or modules here when known.
- Keep entries concise and remove stale pointers.
