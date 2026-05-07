# WebSocket message contracts (M5)

Fan clients connect to **`RiffSyncApi-{env}`** **`WebSocketUrl`** (**`wss://…`**).

## `$connect`

| Input | Requirement |
| --- | --- |
| **Query** `roomId` | Target room (**must exist**). |
| **Query** `sessionId` | Opaque anonymous session (**`authorization.md`**). |
| **Query** `displayName` | Optional nickname for **`People`** in the SPA (**≤ 48** chars after trim server-side); blank → generic **`Guest (…)`** in roster payloads. |
| **Header** `Authorization` OR **Query** `accessToken` | **`Bearer <Cognito access token>`** (**header**) or bare/minimal raw token (**query**) only when claiming **publisher** (**`JWT.sub`** must equal **`room.hostSub`**). Browsers normally **cannot** set WebSocket **`Authorization`**; the SPA MUST pass **`accessToken`** (**URL-encoded JWT**) — avoid logging query strings containing tokens. |

Malformed or mismatched JWT → **`403`**; missing room/session → **`400`**.

## Route selection (`$request.body.action`)

Each routed message SHOULD be JSON with **`"action"`** matching the [**API Gateway**](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-develop-routes.html) route (`ping`, `presence_request`, `chat`, `signaling`). **`$default`** maps **`body.action`** when the route selector misses.

| **`action`** | Purpose | Auth |
| --- | --- | --- |
| **`ping`** | Heartbeat — bumps **`lastActivityAt`** (and **`lobbySk`** when room is **`public`**). | **Guest OK** once connected. |
| **`presence_request`** | Ask the server to fan out a fresh **`presence`** roster snapshot to **all** connections in this room (no body). Use after connect/reconnect or when the UI suspects a stale roster; idempotent. | **Guest OK** once connected. |
| **`chat`** | Fan-out text to sockets in **`roomId`**. | Guests + host. Body: **`text`** (**required**, ≤ 2000 chars). |
| **`signaling`** | WebRTC relay to peers (`**envelope`** JSON). | **Host:** publisher **`JWT`** on **`$connect`**. **Guest:** only **`guestSignaling`** with **`kind`** **`ready`**, **`answer`**, or **`ice`** (see below). |

## Server → client fan-out (`PostToConnection`)

### Chat

```json
{
  "type": "chat",
  "roomId": "<id>",
  "sessionId": "<sender>",
  "displayName": "…",
  "text": "…",
  "ts": 0
}
```

**`displayName`** matches the sender’s connections-row label (same rules as roster: optional nickname from **`$connect`**, else **`Guest (sessionId-prefix…)`**).

### Presence (roster snapshot)

Broadcast to **every** connection in **`roomId`** whenever the connection roster changes (**`$connect`** / **`$disconnect`**) or when any client sends **`presence_request`**. Clients should **replace** local roster UI with **`members`**.

Optional **`displayName`** on **`$connect`** exists only on the WebSocket connections row until disconnect.

```json
{
  "type": "presence",
  "roomId": "<id>",
  "members": [{ "sessionId": "<opaque>", "displayName": "…", "isHost": false }]
}
```

- **`isHost`**: **`true`** when **`$connect`** verified **`accessToken`** and **`JWT.sub`** matched **`rooms.hostSub`** for that publisher socket.

### Signaling

Outbound fan-out payloads share a common envelope (**`Publishers`** and **`guest`** relay):

```json
{
  "type": "signaling",
  "roomId": "<id>",
  "fromSessionId": "<sender session opaque id>",
  "role": "host" | "guest",
  "envelope": {}
}
```

### Guest → relay (**`guestSignaling`**)

Guests may **`POST`** messages on the **`signaling`** route only when **`envelope`** is **`{ guestSignaling: true, kind: … }`**:

| **`kind`** | Purpose |
| --- | --- |
| **`ready`** | Guest announces WebRTC handshake readiness (prompts host to **`createOffer`** for that **`fromSessionId`**). |
| **`answer`** | WebRTC SDP answer (`**sdp`** object: **`type`** + **`sdp`** string). |
| **`ice`** | ICE candidate (**`candidate`** ICE payload). |

**`offer`** and arbitrary publisher envelopes **must not** arrive on the guest path (**`403`** otherwise).

Hosts send **`signaling`** without **`guestSignaling`** (publisher path). Typical host **`envelope`** fields: **`kind`**: **`offer`** | **`ice`**, **`sdp`** / **`candidate`**, **`targetSessionId`** (which guest applies the payload).

SDP and ICE blobs are forwarded without semantic validation (**SPA-owned** contract).

#### Signaling protocol version 1 (optional)

Clients MAY include on **`envelope`**:

| Field | Type | Meaning |
| ----- | ---- | ------- |
| **`protocolVersion`** | `1` | Enables generation guards below. |
| **`shareGeneration`** | positive integer | Monotonic **host capture session** id; host increments when a new share starts; guest echoes it on **`answer`** / **`ice`**. |

**`ready`** MAY include these fields so the host can correlate (optional).

When **`protocolVersion`** is absent or **`shareGeneration`** is missing / `0`, peers treat the message as **legacy** and apply only pre-v1 behavior.

**`chat`** payloads are unchanged (**`Date.now()`** server timestamp).
