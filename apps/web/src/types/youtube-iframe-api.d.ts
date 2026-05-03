/** YouTube IFrame API (loaded at runtime from https://www.youtube.com/iframe_api). */
export {}

declare global {
  interface Window {
    YT?: {
      Player: new (elementId: string, options: YtPlayerOptions) => YtPlayer
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

type YtPlayer = {
  playVideo(): void
  destroy(): void
}

type YtPlayerOptions = {
  videoId?: string
  height?: string
  width?: string
  playerVars?: Record<string, string | number | undefined>
  events?: {
    onReady?: (e: { target: YtPlayer }) => void
    onError?: (e: { data: number }) => void
  }
}
