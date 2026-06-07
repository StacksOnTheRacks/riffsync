# Mediasoup SFU deploy checklist

Manual verification after deploys that touch **`RiffSyncTurn`** (mediasoup SFU + coturn), **`RiffSyncApi-prod`** (`sfu-token`), or fan SPA env (**`VITE_PUBLIC_SFU_WS_URL`**, **`VITE_WEBRTC_USE_MEDIASOU_SFU`**).

1. **Happy path**  
   Host opens `/room/:id`, starts tab share. Two guests join and see video within a few seconds. Chat and presence update.

2. **Mid-join**  
   With host already sharing, open a fresh guest (third window) mid-stream. Guest should attach to the existing producer without host restarting share.

3. **Fan WebSocket drop**  
   Simulate offline (throttle to offline in devtools) for ~5s on a guest while chat reconnects. After online, SFU session should re-establish (may require a short wait); video returns or a visible relay error appears after backoff.

4. **SFU signaling drop**  
   With host sharing, on a guest open devtools → Network → WS and close only the **SFU** socket (not the fan API WebSocket). Guest should recover via token refetch + reconnect policy.

5. **Host stop share**  
   Host stops capture; guests’ theater clears (and mesh/SFU share_state path stays consistent).

6. **Server health**  
   `curl -sSf "${SFU_HTTP}/healthz"` returns JSON with **`ok`**, **`workerAlive`**, **`routerRoomCount`**, **`signalingConnections`** (`riffsync-sfu` listens on port **3000** by default; use the same host as **`wss://`** without TLS for local probes only).

7. **Misconfiguration**  
   Temporarily unset **`VITE_PUBLIC_SFU_WS_URL`** and omit **`wsUrl`** from token wiring; production build should show a **visible** room error (not only a console message) about missing relay URL.

## Multi-publisher participant AV (#106)

Prerequisites: M14 sub-issues through #102–#105 landed; room has **`avDisabled: false`**; at least one signed-in host and **three** signed-in fans for cap smoke.

8. **N fans publish camera+mic**  
   Three signed-in fans enable camera and microphone. SFU **`listProducers`** (or signaling logs) shows distinct **`participant_av`** rows per **`sessionId`**. Remote tiles appear in Theater strip (desktop) or horizontal scroll row (narrow).

9. **Theater mixed audio**  
   Host shares tab; two fans mic-on (one camera-off). Movie audio and both mic streams audible at equal gain (**#118** mixer). Mic-only fan not in strip but listed in **People** tab.

10. **Video Chat grid**  
    Host switches **`roomMode: videoChat`**. Grid shows video-on fans; mic-only remain audible, not in grid. Empty grid shows contract copy when no cameras on.

11. **Host AV kill switch**  
    Host **`PATCH { "avDisabled": true }`**. All fans' participant producers tear down on SFU; toggles disabled with **"The host turned room A/V off."**; new participant token mint returns **`403`** **`av_disabled`**.

12. **Mid-party join with publishers**  
    With two fans already publishing, open a third signed-in fan window. New fan consumes existing **`participant_av`** producers without requiring incumbents to toggle off/on.

13. **Publisher cap hard-fail**  
    With **8** fans publishing (or mint estimate at cap), ninth fan enabling camera receives inline **`publisher_cap_exceeded`** copy; toggle returns off.

14. **SFU signaling drop with multiple producers**  
    On one guest, close only the **SFU** WebSocket while two remote **`participant_av`** streams are active. Guest recovers via token refetch + reconnect; remote video returns or visible **`sfu_signaling_failed`** copy after backoff.

15. **Post-deploy health**  
    After media deploy: **`curl -sSf "${SFU_HTTP}/healthz"`** → **`ok`**, **`workerAlive: true`**. Optional: check CloudWatch **`RiffSync/Media`** gauges if wired.
