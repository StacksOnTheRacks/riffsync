# Index — interface

Scopes **inputs**, **presentation** states, **navigation/flow**, and **accessibility**—not backend contracts.

- Child contracts: **`input_handling.md`**, **`presentation.md`**, **`interaction_flow.md`**, **`accessibility.md`**.
- Implementation detail: **`docs/architecture.frontend.md`** (indexed under **`.ai/knowledge_map.json`** → **repository_architecture**).

## Scope

- Record durable constraints and boundaries for this domain.
- Keep this file aligned with mapped child contracts.
- **`/room/:roomId`** participant AV (camera/microphone), host **room mode** (**Theater** | **Video Chat**), and host **AV kill switch** are in scope; child docs define layout, flow, input, and accessibility boundaries.
- **Realtime hardening:** **SFU-only** media path (no mesh UI), **drawer-independent** chat vs video-relay status surfaces (**#150** M19 ship gate), **guest host-screen SFU FSM copy** (**#151** M19 ship gate), **`producerClosed`** tile lifecycle (no frozen last frames), and thin **`RoomPage`** shell over **`ChatSession`** / **`SfuMediaSession`** / **`TheaterPlayback`** (**`runtime/execution_model.md`**).
- **Public catalog, home, marketing, and official Live surfaces** (**`/`**, **`/catalog`**, **`/catalog/mst3k`**, **`/catalog/community`**, **`/catalog/riff-material`**, **`/catalog/movie-night`**, **`/download`**, **`/watch/:catalogEpisodeId`**, **`/live/:slug`**, **`/how-to-host-a-watchparty`**, **`/terms`**, **`/privacy`**) are in scope for document-level head tags, heading semantics, image alt text, Catalog hub/dropdown navigation, subcategory page shell, Lobby Live discovery, hostless Live party shell, and Get App promotion - see **`presentation.md`** -> *Public site head tags and heading semantics* / *Catalog hub and subcategory presentation* / *Official Live*, **`interaction_flow.md`** -> *Catalog browse navigation* / *Official Live*, and **`business_logic/domain_model.md`** -> *Public discoverable surface* for the indexable route boundary.
- **Friends and 1:1 direct messaging** (signed-in fans only): main-site person-icon friends dropdown, watch-party right-column **Friends** surface (additive beside **People**), invite/accept pending chrome, room-presence-derived friends **online** indicator (distinct from People **active**), durable DM history/compose aligned to room-chat interaction language, unread clear-on-view, and post-remove closed/hidden thread UX — see **`presentation.md`** → *Friends and direct messaging*, **`interaction_flow.md`** → *Friends and direct messaging*, plus sibling **`input_handling.md`** / **`accessibility.md`**.

## Primary code pointers (optional)

- Add stable code directories or modules here when known.
- Keep entries concise and remove stale pointers.
