# Mediasoup SFU deploy checklist

Manual verification after deploys that touch **`RiffSyncSfu`**, **`RiffSyncApi-prod`** (`sfu-token`), or fan SPA env (**`VITE_PUBLIC_SFU_WS_URL`**, **`VITE_WEBRTC_USE_MEDIASOU_SFU`**).

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
