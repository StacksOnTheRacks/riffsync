# Realtime conformance harness

PR-blocking **`realtime-conformance`** CI job exercises disposable SFU + coturn on **`ubuntu-latest`** without touching **`RiffSyncTurn`** or prod Secrets Manager.

## Prerequisites

- Docker (for bootstrap)
- Node 20+
- **`tests/realtime-conformance/bootstrap-media.sh`** (**#154**) or equivalent compose profile

## Local invocation

From repo root:

```bash
chmod +x tests/realtime-conformance/bootstrap-media.sh
chmod +x tests/realtime-conformance/run.sh
tests/realtime-conformance/bootstrap-media.sh up
tests/realtime-conformance/bootstrap-media.sh wait

npm ci --prefix tests/realtime-conformance
tests/realtime-conformance/run.sh

tests/realtime-conformance/bootstrap-media.sh down
```

Run a single scenario while developing:

```bash
npm run scenario:join --prefix tests/realtime-conformance
npm run scenario:partial-unpublish --prefix tests/realtime-conformance
npm run test:reconnect --prefix tests/realtime-conformance
```

## Environment variables

| Variable | Source | Purpose |
| --- | --- | --- |
| **`SFU_JWT_SECRET`** | **`infra/local-media/.env`** (bootstrap copies **`.env.example`**) | In-process **`signSfuJoinToken`** mint; must match disposable SFU container. |
| **`HARNESS_SFU_WS_URL`** | Optional override | Default **`ws://127.0.0.1:3000`**. |
| **`VITE_PUBLIC_SFU_WS_URL`** | Set in **`vitest.config.ts`** for steps 5–6 | SPA SFU base URL for live reconnect suite. |

ICE/TURN credentials are derived from **`infra/local-media/coturn/turnserver.conf`** static-auth secret (coturn time-limited username).

## Ordered scenarios (`run.sh`)

| Step | Script | Assertion |
| --- | --- | --- |
| **1 Join** | **`scenarios/01-join.mts`** | Publisher + consumer obtain SFU signaling WebSocket sessions with HMAC join JWT. |
| **2 Publish** | **`scenarios/02-publish.mts`** | Publisher produces **`participant_av`** video + audio. |
| **3 Consume** | **`scenarios/03-consume.mts`** | Consumer attaches mediasoup consumers; at least one remote track flows. |
| **4 Partial unpublish** | **`scenarios/04-partial-unpublish.mts`** | Video producer closes; video consumer count **0** within **2s**; audio remains; signaling stays open. |
| **5 Chat WS reconnect** | **`scenarios/05-chat-reconnect.test.ts`** | Room WS stub drop; **`getDiagnostics().drawers.chat`** reconnects; **`sfuSignaling`** stays **`connected`**. |
| **6 SFU WS reconnect** | **`scenarios/06-sfu-reconnect.test.ts`** | SFU signaling drop; **`drawers.sfuSignaling`** recovers; **`chat`** stays **`connected`**. |
| **7 Typing fan-out** | **`scenarios/07-typing.test.ts`** | **`typing_start`** fans out; **`typing_stop`** or disconnect clears typing for **`sessionId`**. |
| **8 Presence active** | **`scenarios/08-presence-active.test.ts`** | Qualifying **`ping`** then **`presence_request`** returns **`lastActiveAt`** and **`active`**. |
| **9 `host_screen` survival** | **`scenarios/09-host-screen-survival.mts`** | **`host_screen`** + **`participant_av`** publish; **`participant_av`** video close leaves **`host_screen`** consumer within **2s**. |

Each step has a **90s** wall-clock budget. Failures print **`[drawer=…] code=… step=…`** to stderr and write repo-root **`harness-summary.json`** (see **`.ai/operations/observability.md`**).

## CI contract (**#153**)

**[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)** job **`realtime-conformance`**:

1. SFU compile gate (**`services/riffsync-sfu`**: **`npm ci && npm run build`**).
2. **`bootstrap-media.sh up`** then **`wait`**.
3. **`run.sh`** (this package).
4. **`bootstrap-media.sh down`** in **`if: always()`** teardown.

On failure, CI uploads **`harness-summary.json`**, **`sfu-compose.log`**, and **`harness-stderr.log`**.

## Bootstrap (`bootstrap-media.sh`)

Disposable media stack for CI and local harness development. Reuses committed **`infra/local-media/compose.yml`**.

| Subcommand | Behavior |
| --- | --- |
| **`up`** | Copy fixture env; narrow TURN relay port range for CI; **`docker compose up -d --build`**. |
| **`wait`** | Poll **`http://127.0.0.1:3000/healthz`** every **2s** for up to **60s**. |
| **`down`** | **`docker compose down`**. Optional **`capture`** writes **`sfu-compose.log`**. |

## Package layout

| Path | Role |
| --- | --- |
| **`run.sh`** | Bash entry invoked by CI after bootstrap. |
| **`lib/sign-join-token.ts`** | Imports **`signSfuJoinToken`** from **`infra/cdk/lambda/sfu-join-token-sign.ts`**. |
| **`lib/room-ws-stub.ts`** | Minimal in-process room WebSocket server for steps 5–8. |
| **`lib/sfu-peer.ts`** | Node dual-peer **`mediasoup-client`** + **`@koush/wrtc`** for steps 1–4 and **9**. |
| **`scenarios/`** | Ordered scenario scripts and vitest reconnect suite. |
