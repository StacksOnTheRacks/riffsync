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
}: {
  videoId: string
  titleHint: string
}) {
  const domId = useId().replace(/:/g, '')
  const playerRef = useRef<YtPlayerInstance | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  const destroyPlayer = useCallback(() => {
    playerRef.current?.destroy()
    playerRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      destroyPlayer()
    }
  }, [destroyPlayer])

  const startPlayback = useCallback(async () => {
    setErrorDetail(null)
    setStatus('loading')
    try {
      await loadYoutubeIframeApi()
      if (!window.YT?.Player) {
        throw new Error('YouTube API unavailable')
      }
      destroyPlayer()
      playerRef.current = new window.YT.Player(domId, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          fs: 0,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: (e) => {
            setStatus('ready')
            e.target.playVideo()
          },
          onError: (e) => {
            setStatus('error')
            setErrorDetail(`Playback error (${e.data}). This video may be unavailable to embed.`)
          },
        },
      })
    } catch (err) {
      setStatus('error')
      setErrorDetail(err instanceof Error ? err.message : 'Could not start playback.')
    }
  }, [domId, destroyPlayer, videoId])

  return (
    <div className="riffsync-solo-player">
      <div className="riffsync-solo-player__chrome" aria-live="polite">
        <p className="riffsync-solo-player__title">{titleHint}</p>
        {status === 'idle' && (
          <button type="button" className="gen-button" onClick={startPlayback}>
            <span className="text">Play episode</span>
          </button>
        )}
        {status === 'loading' && <p>Loading player…</p>}
        {status === 'error' && errorDetail && <p role="alert">{errorDetail}</p>}
      </div>
      <div className="riffsync-solo-player__frame" id={domId} title={titleHint} />
    </div>
  )
}
