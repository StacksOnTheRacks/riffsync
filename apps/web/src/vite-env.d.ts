/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_ORIGIN?: string
  /** HTTPS origin of the public HTTP API (e.g. `https://abc.execute-api.us-east-1.amazonaws.com`). */
  readonly VITE_PUBLIC_API_BASE_URL?: string
  /** API Gateway WebSocket **`wss://…`** (`WebSocketUrl` CDK output; include stage path if present). */
  readonly VITE_PUBLIC_WS_URL?: string
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
   * When **`true`**, `/room` sharing uses shared-account mediasoup SFU (**`POST /v1/webrtc/sfu-token`** + **`VITE_PUBLIC_SFU_WS_URL`**).
   */
  readonly VITE_WEBRTC_USE_MEDIASOU_SFU?: string
  /** Mediasoup signaling WebSocket origin (`wss://…` in production). */
  readonly VITE_PUBLIC_SFU_WS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'swiper/css'
declare module 'swiper/css/navigation'
declare module 'swiper/css/pagination'
