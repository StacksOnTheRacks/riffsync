# Mediasoup SFU deploy checklist

Manual verification after deploys that touch **`RiffSyncTurn`** (mediasoup SFU + coturn), **`RiffSyncApi-prod`** (`sfu-token`), or fan SPA env (**`VITE_PUBLIC_SFU_WS_URL`**).

PR CI runs **`realtime-conformance`** on isolated loopback SFU + TURN when **`apps/web/**`** or **`services/riffsync-sfu/**`** change. That harness **complements** this checklist — it never mutates prod **`RiffSyncTurn`**. Post-deploy verification here always targets **production** media. When the **merged PR** had a green **`realtime-conformance`** run, rows tagged **`Abbreviated`** need only a short prod smoke (minutes) instead of a full multi-window soak. Rows tagged **`Manual only`** always require full prod verification. See **`.ai/operations/build_packaging.md`** CI vs prod table and Decisions (#156).

## Harness coverage summary

| Harness step | Checklist rows |
| --- | --- |
| **1 Join** | **1**, **13** (**Abbreviated**) |
| **2 Publish** | **1** (**Abbreviated**) |
| **3 Consume** | **1**, **2**, **13** (**Abbreviated**) |
| **4 Partial unpublish** | **H1** (**Hardening verification**) |
| **5 Chat WS reconnect** | **3**, **H2** |
| **6 SFU WS reconnect** | **4**, **15**, **H2** |
| **7 Typing fan-out** | **H3** |
| **8 Presence active rehydrate** | **H3** |
| **9 `host_screen` survival** | **H4** |

## Legend

| Tag | Meaning |
| --- | --- |
| **`PR: step N`** | Scenario **N** in the six-step harness (**#155** **`run.sh`**) exercises the same drawer/produce contract on **isolated loopback** SFU + TURN. |
| **`Abbreviated`** | When the **merged PR** had a green **`realtime-conformance`** run, operator runs a **short prod smoke** (minutes) instead of a full multi-window soak for that row. |
| **`Manual only`** | Always requires **full prod** verification — harness does not cover prod UX, API Gateway room WS, Cognito-signed flows, or operator drills. |

1. **Happy path** — **`[Abbreviated · PR: steps 1–3]`**  
   Host opens `/room/:id`, starts tab share. Two guests join and see video within a few seconds. Chat and presence update.

2. **Mid-join** — **`[Abbreviated · PR: step 3]`**  
   With host already sharing, open a fresh guest (third window) mid-stream. Guest should attach to the existing producer without host restarting share.

3. **Fan WebSocket drop** — **`[PR: step 5 · Abbreviated]`**  
   Simulate offline (throttle to offline in devtools) for ~5s on a guest while chat reconnects. After online, SFU session should re-establish (may require a short wait); video returns or a visible relay error appears after backoff.

4. **SFU signaling drop** — **`[PR: step 6 · Abbreviated]`**  
   With host sharing, on a guest open devtools → Network → WS and close only the **SFU** socket (not the fan API WebSocket). Guest should recover via token refetch + reconnect policy.

5. **Host stop share** — **`[Manual only]`**  
   Host stops capture; guests' theater clears via **`share_state: stopped`** fan-out.

6. **Server health** — **`[Manual only]`**  
   `curl -sSf "${SFU_HTTP}/healthz"` returns JSON with **`ok`**, **`workerAlive`**, **`routerRoomCount`**, **`signalingConnections`** (`riffsync-sfu` listens on port **3000** by default; use the same host as **`wss://`** without TLS for local probes only).

7. **Misconfiguration** — **`[Manual only]`**  
   Temporarily unset **`VITE_PUBLIC_SFU_WS_URL`** and omit **`wsUrl`** from token wiring; production build should show a **visible** room error (not only a console message) about missing relay URL.

8. **Local disposable SFU down (`LOCAL_SFU_UNREACHABLE`)** — **`[Manual only]`**  
   With **`VITE_PUBLIC_SFU_WS_URL=ws://127.0.0.1:3000`** (or **`ws://localhost:3000`**) and **`npm run media:local`** / compose **stopped**, open a room page. Within two signaling open attempts (or on the first failure when **`curl -sSf http://127.0.0.1:3000/healthz`** fails), the page **`role="alert"`** and guest/host **video-relay status** show **`LOCAL_SFU_UNREACHABLE`** copy from **`.ai/business_logic/error_state.md`** — not console-only and not a cleared "Connecting to video relay…" banner.

## Hardening verification

**H1. Partial unpublish** — **`[PR: step 4]`**  
Fan disables camera with mic on; remote video tile clears within **2s**; mic remains audible. SFU signaling session stays open — no full session rebuild.

**H2. Drawer-independent reconnect** — **`[PR: steps 5–6]`**  
Cross-ref checklist steps **3** (chat WS drop with SFU up) and **4** (SFU WS drop with chat up). Harness asserts normative drawer independence; prod still runs abbreviated ~5s offline throttle smoke when PR green.

**H3. Typing / active rehydrate** — **`[PR: steps 7–8]`**  
Harness peer sends **`typing_start`**; stub asserts **`typing`** fan-out and clear on **`typing_stop`** or disconnect. Qualifying **`ping`** then **`presence_request`** returns roster **`lastActiveAt`** and **`active`** per M22 contract.

**H4. `host_screen` survival** — **`[PR: step 9]`**  
Dual-peer mediasoup scenario with **`host_screen`** + **`participant_av`**; close **`participant_av`** video producer only; **`host_screen`** video consumer remains within **2s**; signaling stays **`open`** (M23 #247).

## Multi-publisher participant AV (#106)

Prerequisites: M14 sub-issues through #102–#105 landed; room has **`avDisabled: false`**; at least one signed-in host and **three** signed-in fans for cap smoke.

9. **N fans publish camera+mic** — **`[Manual only]`**  
   Three signed-in fans enable camera and microphone. SFU **`listProducers`** (or signaling logs) shows distinct **`participant_av`** rows per **`sessionId`**. Remote tiles appear in Theater strip (desktop) or horizontal scroll row (narrow).

10. **Theater mixed audio** — **`[Manual only]`**  
    Host shares tab; two fans mic-on (one camera-off). Movie audio and both mic streams audible at equal gain (**#118** mixer). Mic-only fan not in strip but listed in **People** tab.

11. **Video Chat grid** — **`[Manual only]`**  
    Host switches **`roomMode: videoChat`**. Grid shows video-on fans; mic-only remain audible, not in grid. Empty grid shows contract copy when no cameras on.

12. **Host AV kill switch** — **`[Manual only]`**  
    Host **`PATCH { "avDisabled": true }`**. Confirm SFU admin teardown: **`curl -sS -X POST "${SFU_HTTP}/admin/teardown-producers" -H "content-type: application/json" -H "x-sfu-admin-secret: ${SFU_ADMIN_SECRET}" -d '{"env":"prod","roomId":"<roomId>"}'`** returns **`closedCount`** (repeat is idempotent). All fans' participant producers tear down on SFU; **`host_screen`** remains if active; toggles disabled with **"The host turned room A/V off."**; new participant token mint returns **`403`** **`av_disabled`**.

13. **Mid-party join with publishers** — **`[Abbreviated · PR: steps 1–3]`**  
    With two fans already publishing, open a third signed-in fan window. New fan consumes existing **`participant_av`** producers without requiring incumbents to toggle off/on.

14. **Publisher cap hard-fail** — **`[Manual only]`**  
    With **8** fans publishing (or mint estimate at cap), ninth fan enabling camera receives inline **`publisher_cap_exceeded`** copy; toggle returns off.

15. **SFU signaling drop with multiple producers** — **`[PR: step 6 · Abbreviated]`**  
    On one guest, close only the **SFU** WebSocket while two remote **`participant_av`** streams are active. Guest recovers via token refetch + reconnect; remote video returns or visible **`sfu_signaling_failed`** copy after backoff.

16. **Post-deploy health** — **`[Manual only]`**  
    After media deploy: **`curl -sSf "${SFU_HTTP}/healthz"`** → **`ok`**, **`workerAlive: true`**. Optional: check CloudWatch **`RiffSync/Media`** gauges if wired.

17. **Worker failure drill (optional)** — **`[Manual only]`**  
    If **`/healthz`** reports **`workerAlive: false`**, use SSM + **`journalctl -u riffsync-sfu`** for the **`worker died`** JSON line, then **`sudo systemctl restart riffsync-sfu`** and re-probe. See **`infra/cdk/README.md`** SFU worker runbook for reboot escalation.
