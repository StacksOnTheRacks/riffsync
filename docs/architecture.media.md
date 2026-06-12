# Watch-party media architecture

RiffSync watch-party media uses a **self-hosted mediasoup SFU** plus **coturn** TURN. There is no mesh fallback and no paid third-party RTC provider.

## Planes

| Plane | Transport | Purpose |
| --- | --- | --- |
| **Control** | Room WebSocket (API Gateway) | Chat, presence, share_state, room_mode, av_disabled |
| **Signaling** | SFU WebSocket (EC2 / local Docker) | mediasoup transport/produce/consume only |
| **Media** | RTP UDP/TCP to SFU; ICE via STUN/TURN | Encoded A/V between browser and SFU |

## Browser session model

One **RoomMediaEngine** instance per `roomId` tab. The engine owns:

- **ChatSession** - room WebSocket
- **SfuMediaSession** - SFU reconnect loop, token mint, produce/consume
- **TheaterPlayback** - guest host-screen video and Web Audio mix
- **ParticipantAvController** - getUserMedia and participant_av publish

React reads engine state through **useSyncExternalStore**. Snapshot polls and unrelated room field changes must **not** tear down media sessions.

## Producer classes

| Class | Source | Typical tracks |
| --- | --- | --- |
| `host_screen` | `getDisplayMedia` tab capture | video (+ optional tab audio) |
| `participant_av` | `getUserMedia` | camera video, microphone audio |

One browser tab may publish **both** classes on a single SFU WebSocket send transport. The SFU join JWT carries **`producerClasses`** (array), not a single class.

## Token grants

| Caller | JWT `role` | `producerClasses` |
| --- | --- | --- |
| Host (fan JWT, `sub === hostSub`) | `producer` | `['host_screen', 'participant_av']` when A/V enabled; `['host_screen']` when `avDisabled` |
| Signed-in fan (non-host) | `producer` | `['participant_av']` when A/V enabled |
| Guest or subscribe-only | `consumer` | omitted |

Legacy tokens with a single `producerClass` claim are accepted as a one-element set during rollout.

## Capacity

Default **4 producers per SFU session** covers host screen video + tab audio + camera + mic. Per-room and per-session limits remain env-configurable on the SFU.

## Connection state machine

```
idle -> wsConnecting -> wsReady -> tokenMint -> sfuConnecting -> ready
ready -> degraded | reconnecting -> ready | torn-down
```

Producer-class changes do not require remint when the JWT already includes the needed class set. Remint runs only for JWT `exp` refresh.

## ICE / TURN

Browsers fetch ICE servers from `GET /v1/webrtc/ice`. Production returns STUN plus time-limited coturn credentials (`turn:`, `turns:` on 443). The SFU does not embed TURN in server-side transports.

## Code pointers

| Concern | Path |
| --- | --- |
| Room media engine | `apps/web/src/room/engine/RoomMediaEngine.ts` |
| React hook | `apps/web/src/room/useRoomMediaEngine.ts` |
| mediasoup client | `apps/web/src/room/sfu/mediasoupSharing.ts` |
| SFU service | `services/riffsync-sfu/src/index.ts` |
| Token mint | `infra/cdk/lambda/webrtc-sfu-token.ts` |
| Authorization contract | `.ai/integration/authorization.md` |
