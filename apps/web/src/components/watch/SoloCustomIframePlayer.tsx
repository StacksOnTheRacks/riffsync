import { useEffect, useRef, useState } from 'react'

export function SoloCustomIframePlayer({
  customPlaybackUrl,
  title,
}: {
  customPlaybackUrl: string
  title: string
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const onLoad = () => setStatus('ready')
    const onError = () => setStatus('error')
    iframe.addEventListener('load', onLoad)
    iframe.addEventListener('error', onError)
    return () => {
      iframe.removeEventListener('load', onLoad)
      iframe.removeEventListener('error', onError)
    }
  }, [customPlaybackUrl])

  return (
    <div className="riffsync-solo-player">
      {status === 'error' ? (
        <div className="riffsync-solo-player__chrome" aria-live="polite">
          <p role="alert">
            This page could not be embedded in RiffSync.{' '}
            <a href={customPlaybackUrl} rel="noreferrer" target="_blank">
              Open the movie page in a new tab.
            </a>
          </p>
        </div>
      ) : null}
      {status === 'loading' ? <span className="sr-only">Loading playback.</span> : null}
      {status !== 'error' ? (
        <div className="riffsync-solo-player__frame">
          <iframe
            ref={iframeRef}
            src={customPlaybackUrl}
            title={title}
            allow="autoplay; fullscreen; encrypted-media"
          />
        </div>
      ) : null}
    </div>
  )
}
