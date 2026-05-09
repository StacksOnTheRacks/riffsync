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

On **`$connect`**, the server stores **`expiresAt`** on the connections row (**about 90 minutes** ahead, refreshed on every **`ping`**) so orphaned rows eventually disappear if **`$disconnect`** is not delivered.

## Route selection (`$request.body.action`)

Each routed message SHOULD be JSON with **`"action"`** matching the [**API Gateway**](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-develop-routes.html) route (`ping`, `presence_request`, `chat`, `signaling`, **`share_state`**, **`leave`**). **`$default`** maps **`body.action`** when the route selector misses.

| **`action`** | Purpose | Auth |
| --- | --- | --- |
| **`ping`** | Heartbeat — bumps **`lastActivityAt`** (and **`lobbySk`** when room is **`public`**); also refreshes this socket's connections-row **`lastSeenAt`** and **`expiresAt`** (**about 90 minutes**, sliding) so stale rows age out when **`$disconnect`** never runs. | **Guest OK** once connected. |
| **`presence_request`** | Ask the server to fan out a fresh **`presence`** roster snapshot to **all** connections in this room (no body). Use after connect/reconnect or when the UI suspects a stale roster; idempotent. | **Guest OK** once connected. |
| **`leave`** | Best-effort client goodbye — deletes this **`connectionId`** from the connections table and fan-outs **`presence`** (same pattern as **`$disconnect`**). Clients may send on **`pagehide`** when teardown is uncertain; safe if the row is already gone. | **Guest OK** once connected. |
| **`share_state`** | Host announces screen-share lifecycle so guests can reset the guest **video** surface without inferring teardown only from WebRTC. Body: **`state`**: **`started`** \| **`stopped`**; optional **`shareGeneration`** (non-negative int, matches v1 signaling generations). | **Host (publisher JWT)** only. Fan-out shape below. |
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
