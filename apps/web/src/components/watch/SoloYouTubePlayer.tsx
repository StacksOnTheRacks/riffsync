import { useCallback, useEffect, useId, useRef, useState } from 'react'

const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api'

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

export function SoloYouTubePlayer({
  videoId,
  titleHint,
  /** Rooms default autoplay so guests join in-motion; solo watch disables it so viewers use native YouTube play. */
  autoPlay = true,
}: {
  videoId: string
  titleHint: string
  autoPlay?: boolean
}) {
  const domId = useId().replace(/:/g, '')
  const playerRef = useRef<YtPlayerInstance | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  const destroyPlayer = useCallback(() => {
    playerRef.current?.destroy()
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
          setErrorDetail(err instanceof Error ? err.message : 'Could not start playback.')
        }
        return
      }

      if (cancelled) return

      if (!window.YT?.Player) {
        setStatus('error')
        setErrorDetail('YouTube API unavailable')
        return
      }

      destroyPlayer()

      playerRef.current = new window.YT.Player(domId, {
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
              e.target.playVideo()
            }
          },
          onError: (e) => {
            if (!cancelled) {
              setStatus('error')
              setErrorDetail(`Playback error (${e.data}). This video may be unavailable to embed.`)
            }
          },
        },
      })
    }

    void boot()

    return () => {
      cancelled = true
      destroyPlayer()
    }
  }, [autoPlay, videoId, domId, destroyPlayer])

  return (
    <div className="riffsync-solo-player">
      {status === 'error' && errorDetail ? (
        <div className="riffsync-solo-player__chrome" aria-live="polite">
          <p role="alert">{errorDetail}</p>
        </div>
      ) : null}
      {status === 'loading' ? <span className="sr-only">Loading video player.</span> : null}
      <div className="riffsync-solo-player__frame" id={domId} title={titleHint} />
    </div>
  )
}
