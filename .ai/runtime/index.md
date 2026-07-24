# Index — runtime

Scopes **Lambda/API execution**, **EC2 mediasoup SFU**, **browser SPA** bootstrap, **configuration**, and **shutdown** across control plane (API Gateway WebSocket) and media plane (direct SFU WebSocket). Client room runtime uses jurisdictional modules **`ChatSession`**, **`SfuMediaSession`**, **`TheaterPlayback`** with drawer-independent lifecycles (**`execution_model.md`**). **Friends / 1:1 DM** stay in the same serverless envelope: friends-list **online** is derived from existing **RoomPresence** (any room), not a platform-wide presence plane or SFU signal; friends/DM lifecycle must not tear down healthy chat or media drawers.

- Child contracts: **`execution_model.md`** (includes **AWS CDK** + TypeScript Lambda standard and **EC2 SFU** process), **`configuration.md`**, **`startup_bootstrap.md`**, **`lifecycle_shutdown.md`**.
- See **`docs/architecture.server.md`** and **`docs/architecture.frontend.md`** for component diagrams.

## Scope

- Record durable constraints and boundaries for this domain.
- Keep this file aligned with mapped child contracts.

## Primary code pointers (optional)

- Add stable code directories or modules here when known.
- Keep entries concise and remove stale pointers.
