# Index — interface

Scopes **inputs**, **presentation** states, **navigation/flow**, and **accessibility**—not backend contracts.

- Child contracts: **`input_handling.md`**, **`presentation.md`**, **`interaction_flow.md`**, **`accessibility.md`**.
- Implementation detail: **`docs/architecture.frontend.md`** (indexed under **`.ai/knowledge_map.json`** → **repository_architecture**).

## Scope

- Record durable constraints and boundaries for this domain.
- Keep this file aligned with mapped child contracts.
- **`/room/:roomId`** participant AV (camera/microphone), host **room mode** (**Theater** | **Video Chat**), and host **AV kill switch** are in scope; child docs define layout, flow, input, and accessibility boundaries.
- **Realtime hardening:** **SFU-only** media path (no mesh UI), **drawer-independent** chat vs video-relay status surfaces (**#150** M19 ship gate), **guest host-screen SFU FSM copy** (**#151** M19 ship gate), **`producerClosed`** tile lifecycle (no frozen last frames), and thin **`RoomPage`** shell over **`ChatSession`** / **`SfuMediaSession`** / **`TheaterPlayback`** (**`runtime/execution_model.md`**).
- **Public catalog, home, and marketing surfaces** (**`/`**, **`/catalog`**, **`/catalog/mst3k`**, **`/catalog/community`**, **`/catalog/riff-material`**, **`/catalog/movie-night`**, **`/download`**, **`/watch/:catalogEpisodeId`**, **`/how-to-host-a-watchparty`**, **`/terms`**, **`/privacy`**) are in scope for document-level head tags, heading semantics, image alt text, Catalog hub/dropdown navigation, subcategory page shell (header + subtitle + grid), and Get App promotion - see **`presentation.md`** -> *Public site head tags and heading semantics* / *Catalog hub and subcategory presentation*, **`interaction_flow.md`** -> *Catalog browse navigation*, and **`business_logic/domain_model.md`** -> *Public discoverable surface* for the indexable route boundary.

## Primary code pointers (optional)

- Add stable code directories or modules here when known.
- Keep entries concise and remove stale pointers.
