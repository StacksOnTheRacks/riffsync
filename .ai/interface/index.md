# Index — interface

Scopes **inputs**, **presentation** states, **navigation/flow**, and **accessibility**—not backend contracts.

- Child contracts: **`input_handling.md`**, **`presentation.md`**, **`interaction_flow.md`**, **`accessibility.md`**.
- Implementation detail: **`docs/architecture.frontend.md`** (indexed under **`.ai/knowledge_map.json`** → **repository_architecture**).

## Scope

- Record durable constraints and boundaries for this domain.
- Keep this file aligned with mapped child contracts.
- **`/room/:roomId`** participant AV (camera/microphone), host **room mode** (**Theater** | **Video Chat**), and host **AV kill switch** are in scope; child docs define layout, flow, input, and accessibility boundaries.
- **Realtime hardening:** **SFU-only** media path (no mesh UI), **drawer-independent** chat vs video-relay status surfaces (**#150** M19 ship gate in **`presentation.md`**), **`producerClosed`** tile lifecycle (no frozen last frames), and thin **`RoomPage`** shell over **`ChatSession`** / **`SfuMediaSession`** / **`TheaterPlayback`** (**`runtime/execution_model.md`**).

## Primary code pointers (optional)

- Add stable code directories or modules here when known.
- Keep entries concise and remove stale pointers.
