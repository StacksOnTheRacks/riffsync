/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_ORIGIN?: string
  /** HTTPS origin of the public HTTP API (e.g. `https://abc.execute-api.us-east-1.amazonaws.com`). */
  readonly VITE_PUBLIC_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'swiper/css'
declare module 'swiper/css/navigation'
declare module 'swiper/css/pagination'
