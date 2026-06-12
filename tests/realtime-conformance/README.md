# Realtime conformance harness

PR-blocking **`realtime-conformance`** CI job exercises disposable SFU + coturn on **`ubuntu-latest`** without touching **`RiffSyncTurn`** or prod Secrets Manager.

## Bootstrap (`bootstrap-media.sh`)

Disposable media stack for CI and local harness development. Reuses committed **`infra/local-media/compose.yml`** (see **`infra/local-media/README.md`**).

| Subcommand | Behavior |
| --- | --- |
| **`up`** | Copy **`.env.example`** / **`coturn/turnserver.conf.example`** when missing; apply a **narrow TURN relay port range** (50000-50100) via gitignored **`compose.bootstrap.override.yml`** so CI runners avoid conflicts with the full prod 49152-65535 map; **`docker compose up -d --build`** from repo root. |
| **`wait`** | Poll **`http://127.0.0.1:3000/healthz`** every **2s** for up to **60s**; timeout exits **1** with **`[drawer=connectivity] code=SFU_HEALTH_TIMEOUT step=bootstrap`** on stderr and prints **`docker compose ps`**. |
| **`down`** | **`docker compose down`**. Optional **`capture`** (or **`--capture-log`**, or env **`BOOTSTRAP_CAPTURE_COMPOSE_LOG=1`**) writes **`docker compose ps`** + logs to repo-root **`sfu-compose.log`** before teardown. |

No AWS OIDC, Secrets Manager reads, or prod media mutation in any bootstrap path.

### Local smoke

From repo root:

```bash
chmod +x tests/realtime-conformance/bootstrap-media.sh
tests/realtime-conformance/bootstrap-media.sh up
tests/realtime-conformance/bootstrap-media.sh wait
curl -sSf http://127.0.0.1:3000/healthz
tests/realtime-conformance/bootstrap-media.sh down
```

Compare with **`npm run media:local`** / **`npm run media:local:down`** when iterating on **`infra/local-media/`** fixtures.

## CI contract (**#153** integrators)

**[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)** job **`realtime-conformance`**:

1. SFU compile gate (**`services/riffsync-sfu`**: **`npm ci && npm run build`**).
2. **`bootstrap-media.sh up`** then **`wait`** when the bootstrap script exists.
3. **`run.sh`** when present (**#155**); job passes after compile only until then.
4. **`bootstrap-media.sh down`** in **`if: always()`** teardown.

On harness or bootstrap failure, invoke **`bootstrap-media.sh down capture`** (or set **`BOOTSTRAP_CAPTURE_COMPOSE_LOG=1`**) so **`sfu-compose.log`** is available for the **`realtime-conformance-failure`** artifact upload (**`.ai/operations/observability.md`**).

Path filters include **`tests/realtime-conformance/**`**, **`services/riffsync-sfu/**`**, and **`infra/local-media/**`**.

## Harness runner (**#155**)

**`run.sh`** and scenario packages land in **#155**. This directory holds bootstrap only until the runner ships.
