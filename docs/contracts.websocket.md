# WebSocket message contracts (M5)

Fan clients connect to **`RiffSyncApi-{env}`** **`WebSocketUrl`** (**`wss://…`**).

## `$connect`

| Input | Requirement |
| --- | --- |
| **Query** `roomId` | Target room (**must exist**). |
| **Query** `sessionId` | Opaque anonymous session (**`authorization.md`**). |
| **Query** `displayName` | Optional nickname for **`People`** in the SPA (**≤ 48** chars after trim server-side); blank → generic **`Guest (…)`** in roster payloads. |
| **Header** `Authorization` OR **Query** `accessToken` | **`Bearer <Cognito access token>`** (**header**) or bare/minimal raw token (**query**) when the client is signed in. Browsers normally **cannot** set WebSocket **`Authorization`**; the SPA MUST pass **`accessToken`** (**URL-encoded JWT**) for signed-in fans — avoid logging query strings containing tokens. A valid fan JWT stores **`fanSub`** on the connection row. When **`JWT.sub`** equals **`room.hostSub`**, the socket is also marked as the **publisher** (**`hostSub`** on the row, **`isHost`** in roster payloads). |

Invalid or unverifiable JWT is ignored (guest connect). Missing room/session → **`400`**.

On **`$connect`**, the server stores **`expiresAt`** on the connections row (**about 90 minutes** ahead, refreshed on every **`ping`**) so orphaned rows eventually disappear if **`$disconnect`** is not delivered.

## Route selection (`$request.body.action`)

Each routed message SHOULD be JSON with **`"action"`** matching the [**API Gateway**](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-develop-routes.html) route (`ping`, `presence_request`, `chat`, **`chat_gif`**, **`react`**, **`rename`**, **`share_state`**, **`leave`**). **`$default`** maps **`body.action`** when the route selector misses.

| **`action`** | Purpose | Auth |
| --- | --- | --- |
| **`ping`** | Heartbeat — bumps **`lastActivityAt`** (and **`lobbySk`** when room is **`public`**); also refreshes this socket's connections-row **`lastSeenAt`** and **`expiresAt`** (**about 90 minutes**, sliding) so stale rows age out when **`$disconnect`** never runs. | **Guest OK** once connected. |
| **`presence_request`** | Ask the server to fan out a fresh **`presence`** roster snapshot to **all** connections in this room (no body). Use after connect/reconnect or when the UI suspects a stale roster; idempotent. | **Guest OK** once connected. |
| **`leave`** | Best-effort client goodbye — deletes this **`connectionId`** from the connections table and fan-outs **`presence`** (same pattern as **`$disconnect`**). Clients may send on **`pagehide`** when teardown is uncertain; safe if the row is already gone. | **Guest OK** once connected. |
| **`share_state`** | Host announces screen-share lifecycle so guests can reset the guest **video** surface without inferring teardown only from SFU media. Body: **`state`**: **`started`** \| **`stopped`**; optional **`shareGeneration`** (non-negative int, monotonic host share session id). | **Host (publisher JWT)** only. Fan-out shape below. |
| **`chat`** | Fan-out text to sockets in **`roomId`**. | **Signed-in fan only** (**`fanSub`** on connection from **`$connect`**). **403** when absent. Body: **`text`** (**required**, ≤ 2000 chars), **`messageId`** (**required**, UUID RFC 4122 string). |
| **`chat_gif`** | Fan-out Giphy GIF post to sockets in **`roomId`**. | **Signed-in fan only** (**`fanSub`** on connection from **`$connect`**). **403** when absent. Body: **`messageId`** (**required**, UUID), **`giphyId`** (**required**, non-empty), **`renditionUrl`** (**required**, HTTPS URL on Giphy CDN, e.g. **`media*.giphy.com`**, **`i.giphy.com`**), optional **`title`** (≤ 200 chars), **`width`** / **`height`** (positive integers, ≤ 4096). Clients MUST NOT upload GIF bytes or supply arbitrary image URLs. |
| **`react`** | Fan-out ephemeral emoji reaction toggle on a chat line. | **Signed-in fan only** (**`fanSub`** on connection from **`$connect`**). **403** when absent. Body: **`messageId`** (**required**, non-empty, ≤ 64 chars), **`emoji`** (**required**, trimmed non-empty, ≤ 32 chars), **`reactionAction`**: **`add`** \| **`remove`** (not the route **`action`** field). No Dynamo persistence. |
| **`rename`** | Update this socket's presence display name **in place** (no reconnect) and fan out a fresh **`presence`** roster. The server writes the trimmed name to both the connections row (chat/gif/react author label) and the presence row (roster), then broadcasts. Media planes are untouched, so a rename never disrupts video/audio. | **Signed-in fan only** (**`fanSub`** on connection from **`$connect`**). **403** when absent. Body: **`displayName`** (**required**, trimmed non-empty, ≤ 48 chars). |

**WebRTC media** (SDP / ICE, mediasoup produce/consume) uses the **SFU signaling WebSocket** on **`RiffSyncTurn`**, not this API Gateway room WebSocket. See **`.ai/integration/api_contracts.md`** and **`.ai/integration/external_systems.md`**.

## Server → client fan-out (`PostToConnection`)

### Chat

```json
{
  "type": "chat",
  "roomId": "<id>",
  "sessionId": "<sender>",
  "displayName": "…",
  "text": "…",
  "messageId": "<client uuid>",
  "ts": 0,
  "avatarUrl": "https://…"
}
```

**`displayName`** matches the sender’s connections-row label (same rules as roster: optional nickname from **`$connect`**, else **`Guest (sessionId-prefix…)`**).

**`avatarUrl`** (optional): HTTPS URL read from **FanProfiles** for the sender’s **`fanSub`** when **`$connect`** stored one. Omitted when the fan has no avatar or connected as a guest. Inbound **`chat`** bodies MUST NOT supply **`avatarUrl`**; the server ignores client-supplied image URLs.

Inbound **`chat`** now requires a client-generated **`messageId`** UUID, and outbound **`chat`** / **`chat_gif`** fan-out includes the same stable **`messageId`** per line in **[#31](https://github.com/StacksOnTheRacks/riffsync/issues/31)**.

For compatibility during rollout, treat **`messageId`** as required for new clients. Older clients that do not send a UUID will receive **`400`** from the **`chat`** route.

### Chat GIF

```json
{
  "type": "chat_gif",
  "roomId": "<id>",
  "sessionId": "<sender>",
  "displayName": "…",
  "messageId": "<client uuid>",
  "giphyId": "<giphy id>",
  "renditionUrl": "https://…",
  "title": "…",
  "width": 480,
  "height": 270,
  "ts": 0,
  "avatarUrl": "https://…"
}
```

**`displayName`** / **`avatarUrl`** enrichment matches **`chat`** (**`presenceDisplayNameForSession`**, **`resolveChatOutboundAvatarUrl`**). Inbound bodies MUST NOT supply **`avatarUrl`**. **`title`**, **`width`**, and **`height`** are omitted when not sent or empty.

### Chat reaction (ephemeral fan-out)

Broadcast to **every** connection in **`roomId`** when a client sends **`react`**. Reactions are **not** stored in Dynamo.

```json
{
  "type": "chat_reaction",
  "roomId": "<id>",
  "messageId": "<client uuid>",
  "emoji": "👍",
  "action": "add",
  "sessionId": "<sender>",
  "displayName": "…",
  "ts": 0
}
```

**`displayName`** uses the same rules as **`chat`** (connections-row nickname from **`$connect`**, else **`Guest (…)`**). **`action`** is **`add`** or **`remove`** (from inbound **`reactionAction`**).

### Presence (roster snapshot)

Broadcast to **every** connection in **`roomId`** whenever the connection roster changes (**`$connect`** / **`$disconnect`**), when any client sends **`presence_request`**, or when a signed-in fan sends **`rename`**. Clients should **replace** local roster UI with **`members`**.

Optional **`displayName`** on **`$connect`** exists only on the WebSocket connections row until disconnect, and is updated in place by **`rename`**.

```json
{
  "type": "presence",
  "roomId": "<id>",
  "members": [{ "sessionId": "<opaque>", "displayName": "…", "isHost": false, "avatarUrl": "https://…" }]
}
```

- **`isHost`**: **`true`** when **`$connect`** verified **`accessToken`** and **`JWT.sub`** matched **`rooms.hostSub`** for that publisher socket.
- **`avatarUrl`** (optional per member): server-trusted **FanProfiles** HTTPS URL when that member’s session maps to a **`fanSub`** with an avatar; omitted otherwise.

### Share state (host fan-out)

Broadcast to **every** connection in **`roomId`** when the host sends **`share_state`**.

```json
{
  "type": "share_state",
  "roomId": "<id>",
  "sessionId": "<host session id>",
  "state": "started" | "stopped",
  "shareGeneration": 0
}
```

**`shareGeneration`** is omitted when the host did not include it (or it was not applicable). Guests should clear inbound share UI on **`state: stopped`** regardless of generation.

**`chat`** payloads include client-provided **`messageId`** plus server **`Date.now()`** timestamp.
