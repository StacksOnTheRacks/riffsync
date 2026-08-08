import { Component, type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'

const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api'

/** Production-facing copy when the embed cannot play. */
export const YOUTUBE_EMBED_BROKEN_MESSAGE = 'This video link is broken.'

type YtPlayerInstance = {
  playVideo(): void
  destroy(): void
}

function loadYoutubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('No window'))
  }
  if (window.YT?.Player) {
    return Promise.resolve()
  }
  const existing = document.querySelector(`script[src="${IFRAME_API_SRC}"]`)
  if (existing) {
    return new Promise((resolve, reject) => {
      let attempts = 0
      const t = window.setInterval(() => {
        if (window.YT?.Player) {
          window.clearInterval(t)
          resolve()
        } else if (++attempts > 200) {
          window.clearInterval(t)
          reject(new Error('YouTube API load timeout'))
        }
      }, 50)
    })
  }
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script')
    tag.src = IFRAME_API_SRC
    tag.async = true
    tag.onerror = () => reject(new Error('Failed to load YouTube IFrame API'))
    const first = document.getElementsByTagName('script')[0]
    first?.parentNode?.insertBefore(tag, first)

    const prior = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prior?.()
      resolve()
    }
  })
}

function formatEmbedBrokenMessage(devHint?: string | number | null): string {
  if (import.meta.env.DEV && devHint != null && String(devHint).trim() !== '') {
    return `${YOUTUBE_EMBED_BROKEN_MESSAGE} (code: ${devHint})`
  }
  return YOUTUBE_EMBED_BROKEN_MESSAGE
}

function safeDestroyPlayer(player: YtPlayerInstance | null): void {
  if (!player) return
  try {
    player.destroy()
  } catch {
    // YT may throw if the host node was already replaced or detached.
  }
}

function OpenOnYouTubeLink({ watchUrl }: { watchUrl: string }) {
  return (
    <a href={watchUrl} rel="noreferrer" target="_blank">
      Open on YouTube
    </a>
  )
}

function EmbedBrokenChrome({
  message,
  watchUrl,
}: {
  message: string
  watchUrl?: string | null
}) {
  const trimmedWatchUrl = watchUrl?.trim() || null
  return (
    <div className="riffsync-solo-player__chrome" aria-live="polite">
      <p role="alert">
        {message}
        {trimmedWatchUrl ? (
          <>
            {' '}
            <OpenOnYouTubeLink watchUrl={trimmedWatchUrl} />
          </>
        ) : null}
      </p>
    </div>
  )
}

type SoloYouTubePlayerProps = {
  videoId: string
  titleHint: string
  /** Rooms default autoplay so guests join in-motion; solo watch disables it so viewers use native YouTube play. */
  autoPlay?: boolean
  /** Optional watch URL for the Open on YouTube escape hatch when the embed fails. */
  watchUrl?: string | null
}

function SoloYouTubePlayerInner({
  videoId,
  titleHint,
  autoPlay = true,
  watchUrl,
}: SoloYouTubePlayerProps) {
  const domId = useId().replace(/:/g, '')
  const hostRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YtPlayerInstance | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  const destroyPlayer = useCallback(() => {
    safeDestroyPlayer(playerRef.current)
    playerRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      setErrorDetail(null)
      setStatus('loading')
      try {
        await loadYoutubeIframeApi()
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          const hint = err instanceof Error ? err.message : 'bootstrap'
          setErrorDetail(formatEmbedBrokenMessage(hint))
        }
        return
      }

      if (cancelled) return

      if (!window.YT?.Player) {
        setStatus('error')
        setErrorDetail(formatEmbedBrokenMessage('YouTube API unavailable'))
        return
      }

      const host = hostRef.current
      if (!host) {
        setStatus('error')
        setErrorDetail(formatEmbedBrokenMessage('player host missing'))
        return
      }

      destroyPlayer()

      try {
        playerRef.current = new window.YT.Player(host, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            fs: 1,
            playsinline: 1,
            rel: 0,
            autoplay: autoPlay ? 1 : 0,
            modestbranding: 1,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return
              setStatus('ready')
              if (autoPlay) {
                try {
                  e.target.playVideo()
                } catch {
                  // Autoplay may be blocked; native controls remain available when ready.
                }
              }
            },
            onError: (e) => {
              if (cancelled) return
              destroyPlayer()
              setStatus('error')
              setErrorDetail(formatEmbedBrokenMessage(e.data))
            },
          },
        })
      } catch (err) {
        if (!cancelled) {
          destroyPlayer()
          setStatus('error')
          const hint = err instanceof Error ? err.message : 'construct'
          setErrorDetail(formatEmbedBrokenMessage(hint))
        }
      }
    }

    void boot()

    return () => {
      cancelled = true
      destroyPlayer()
    }
  }, [autoPlay, videoId, destroyPlayer])

  return (
    <div className="riffsync-solo-player">
      {status === 'error' && errorDetail ? (
        <EmbedBrokenChrome message={errorDetail} watchUrl={watchUrl} />
      ) : null}
      {status === 'loading' ? <span className="sr-only">Loading video player.</span> : null}
      {status !== 'error' ? (
        <div className="riffsync-solo-player__frame" title={titleHint}>
          {/*
            Outer frame is React-owned. YT.Player may replace the inner host node with an iframe;
            keeping the replaceable node as a child avoids removeChild crashes on unmount/update.
          */}
          <div id={domId} ref={hostRef} />
        </div>
      ) : null}
    </div>
  )
}

type BoundaryState = { hasError: boolean }

/**
 * Narrow boundary so a render-time player failure stays in the stage and does not blank Live/Solo shells.
 */
class SoloYouTubePlayerBoundary extends Component<
  SoloYouTubePlayerProps & { children: ReactNode },
  BoundaryState
> {
  state: BoundaryState = { hasError: false }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true }
  }

  componentDidUpdate(prevProps: SoloYouTubePlayerProps): void {
    if (
      this.state.hasError &&
      (prevProps.videoId !== this.props.videoId || prevProps.watchUrl !== this.props.watchUrl)
    ) {
      this.setState({ hasError: false })
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="riffsync-solo-player">
          <EmbedBrokenChrome
            message={formatEmbedBrokenMessage('render')}
            watchUrl={this.props.watchUrl}
          />
        </div>
      )
    }
    return this.props.children
  }
}

export function SoloYouTubePlayer(props: SoloYouTubePlayerProps) {
  return (
    <SoloYouTubePlayerBoundary {...props}>
      {/* Remount on videoId so a prior error state cannot leave the YT host unmounted. */}
      <SoloYouTubePlayerInner key={props.videoId} {...props} />
    </SoloYouTubePlayerBoundary>
  )
}
