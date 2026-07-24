/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_ORIGIN?: string
  /** HTTPS origin of the public HTTP API (e.g. `https://abc.execute-api.us-east-1.amazonaws.com`). */
  readonly VITE_PUBLIC_API_BASE_URL?: string
  /** API Gateway WebSocket **`wss://…`** (`WebSocketUrl` CDK output; include stage path if present). */
  readonly VITE_PUBLIC_WS_URL?: string
  /** Fan DM push WebSocket (`FanDmWebSocketUrl` CDK output). Separate from room chat WS. */
  readonly VITE_PUBLIC_FAN_DM_WS_URL?: string
  /** Cognito Hosted UI domain only (no `https://`; e.g. `your-domain.auth.region.amazoncognito.com`). */
  readonly VITE_COGNITO_HOSTED_UI_DOMAIN?: string
  /** Fan app client id (SPA / public client) for Hosted UI PKCE + token exchange. */
  readonly VITE_COGNITO_CLIENT_ID?: string
  /**
   * Optional JSON array passed to **`RTCPeerConnection`** **`iceServers`** (STUN/TURN).
   * Default: `[{ urls: 'stun:stun.l.google.com:19302' }]`.
   */
  readonly VITE_WEBRTC_ICE_SERVERS_JSON?: string
  /**
   * Mediasoup signaling **`ws://`** / **`wss://`** base (no path, no query). Baked in at **`npm run build`** only.
   * When set, takes precedence over token-embedded **`wsUrl`** from **`POST /v1/webrtc/sfu-token`** (local disposable SFU).
   */
  readonly VITE_PUBLIC_SFU_WS_URL?: string
  /** Google Cast custom receiver application id for sender launch (#273). */
  readonly VITE_CAST_RECEIVER_APP_ID?: string
  /** GA4 measurement id (public). Injected into index.html at build time when set. */
  readonly VITE_GA_MEASUREMENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

declare module 'swiper/css'
declare module 'swiper/css/navigation'
declare module 'swiper/css/pagination'
