/**
 * **Production** builds default to mediasoup SFU unless **`VITE_WEBRTC_USE_MEDIASOU_SFU=false`**
 * explicitly disables it. **Development** defaults to mesh unless **`VITE_WEBRTC_USE_MEDIASOU_SFU=true`**.
 */
export function isMediasoupSfuEnabled(): boolean {
  const v = import.meta.env.VITE_WEBRTC_USE_MEDIASOU_SFU?.trim()
  if (v === 'false') return false
  if (v === 'true') return true
  return import.meta.env.PROD
}

/** True when this build uses mesh for watch-party media (non-SFU). Unsupported in prod deployments. */
export function isMeshWatchPartyMediaEnabled(): boolean {
  return !isMediasoupSfuEnabled()
}
