# WebSocket message contracts (M5)

Fan clients connect to **`RiffSyncApi-{env}`** **`WebSocketUrl`** (**`wss://…`**).

## `$connect`

| Input | Requirement |
| --- | --- |
| **Query** `roomId` | Target room (**must exist**). |
| **Query** `sessionId` | Opaque anonymous session (**`authorization.md`**). |
| **Header** `Authorization` | **`Bearer <Cognito access token>`** only when claiming **publisher** (**`JWT.sub`** must equal **`room.hostSub`**). |

Malformed or mismatched JWT → **`403`**; missing room/session → **`400`**.

## Route selection (`$request.body.action`)

Each routed message SHOULD be JSON with **`"action"`** matching the [**API Gateway**](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-develop-routes.html) route (`ping`, `chat`, `signaling`). **`$default`** maps **`body.action`** when the route selector misses.

| **`action`** | Purpose | Auth |
| --- | --- | --- |
| **`ping`** | Heartbeat — bumps **`lastActivityAt`** (and **`lobbySk`** when room is **`public`**). | **Guest OK** once connected. |
| **`chat`** | Fan-out text to sockets in **`roomId`**. | Guests + host. Body: **`text`** (**required**, ≤ 2000 chars). |
| **`signaling`** | WebRTC relay to peers. Body: **`envelope`** (opaque JSON). | **Publisher only** (**`$connect`** proved **`JWT.sub === room.hostSub`**). |

## Server → client fan-out (`PostToConnection`)

### Chat

```json
{ "type": "chat", "roomId": "<id>", "sessionId": "<sender>", "text": "…", "ts": 0 }
```

### Signaling

```json
{ "type": "signaling", "roomId": "<id>", "envelope": {} }
```

**`ts`** is server **`Date.now()`** (**epoch ms**). **`envelope`** is forwarded without validation (SDP / ICE blobs per SPA agreement).
