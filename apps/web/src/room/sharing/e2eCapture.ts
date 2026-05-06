/** Deterministic video `MediaStream` for **`?riffsyncE2e=1`** in dev (Playwright / local). */
export function createSyntheticDisplayStream(fps = 15): MediaStream {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 480
  const g = canvas.getContext('2d')
  if (!g) throw new Error('2d context required for e2e synthetic capture')
  let frame = 0
  const draw = () => {
    frame += 1
    g.fillStyle = frame % 120 < 60 ? '#14213d' : '#fca311'
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.fillStyle = '#ffffff'
    g.font = '24px sans-serif'
    g.fillText(`riffsync-e2e ${frame}`, 24, 240)
  }
  draw()
  const id = window.setInterval(draw, 1000 / fps)
  const stream = canvas.captureStream(fps)
  const [vTrack] = stream.getVideoTracks()
  if (vTrack) {
    vTrack.addEventListener('ended', () => window.clearInterval(id))
  }
  return stream
}
