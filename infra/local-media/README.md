# Local watch-party media (disposable SFU + coturn)

Workstation profile that runs **`services/riffsync-sfu`** and **coturn** with the same signaling and producer semantics as **`RiffSyncTurn`**, without touching hosted prod media.

## Prerequisites

- Docker Desktop or Docker Engine with Compose v2
- Copy **`.env.example`** to **`.env`** and set secrets (fixture values are fine for smoke tests)
- Copy **`coturn/turnserver.conf.example`** to **`coturn/turnserver.conf`** and set **`static-auth-secret`**

## Port map

| Service | Host bind | Purpose |
| --- | --- | --- |
| **sfu** | **`127.0.0.1:3000`** (TCP) | HTTP **`/healthz`**, WebSocket mediasoup signaling |
| **sfu** | **`40000-40199`** (UDP + TCP) | mediasoup RTC (matches **`MEDIASOUP_RTC_*`** in **`.env`**) |
| **turn** | **`3478`** (UDP + TCP) | STUN/TURN |
| **turn** | **`49152-65535`** (UDP + TCP) | TURN relay allocation range |

## Bootstrap

From the repository root:

```bash
npm run media:local
curl -sSf http://127.0.0.1:3000/healthz
npm run media:local:down
```

Or directly:

```bash
docker compose -f infra/local-media/compose.yml up -d --build
docker compose -f infra/local-media/compose.yml ps
docker compose -f infra/local-media/compose.yml down
```

**Expected:** **`/healthz`** returns JSON with **`ok: true`**; both **`sfu`** and **`turn`** reach running state.

## Prod API coupling (operator step)

When **`apps/web`** still targets prod **`RiffSyncApi-prod`** for room WebSocket and HTTP:

1. Copy the real value of **`riffsync/sfu-join-hmac-secret`** from AWS Secrets Manager into **`SFU_JWT_SECRET`** in **`.env`**. Tokens from **`POST /v1/webrtc/sfu-token`** must verify against this secret.
2. Set **`VITE_PUBLIC_SFU_WS_URL=ws://127.0.0.1:3000`** in **`apps/web/.env.local`** so the SPA overrides token-embedded **`wsUrl`**.
3. Optional: point **`VITE_WEBRTC_ICE_SERVERS_JSON`** at local coturn when prod **`GET /v1/webrtc/ice`** TURN credentials are unsuitable.

Never commit prod secret values.

## Cross-device testing

Default **`MEDIASOUP_ANNOUNCED_IP=127.0.0.1`** and **`external-ip=127.0.0.1`** in coturn work for same-machine tabs. For phones or other machines on your LAN:

1. Set **`MEDIASOUP_ANNOUNCED_IP`** in **`.env`** to your workstation LAN IP.
2. Set **`external-ip`** in **`coturn/turnserver.conf`** to the same LAN IP.
3. Point **`VITE_PUBLIC_SFU_WS_URL`** at **`ws://<LAN-IP>:3000`** (signaling is bound to localhost only today — use SSH tunnel or adjust compose bind if you need remote signaling).

## Health probe

```bash
curl -sSf http://127.0.0.1:3000/healthz
```

Success body includes **`ok`**, **`workerAlive`**, **`routerRoomCount`**, and **`signalingConnections`**.

## Idempotency

**`docker compose up -d`** and **`down`** only publish the ports above. No host paths outside this directory are modified at runtime (config is read-only mounts + gitignored **`.env`**).
