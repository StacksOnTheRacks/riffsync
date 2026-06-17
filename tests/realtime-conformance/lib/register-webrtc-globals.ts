import wrtc from '@koush/wrtc'

type WrtcGlobals = {
  RTCPeerConnection: typeof wrtc.RTCPeerConnection
  RTCSessionDescription: typeof wrtc.RTCSessionDescription
  RTCIceCandidate: typeof wrtc.RTCIceCandidate
  MediaStream: typeof wrtc.MediaStream
  MediaStreamTrack: typeof wrtc.MediaStreamTrack
}

let registered = false

export function registerWebrtcGlobals(): void {
  if (registered) return
  const g = globalThis as typeof globalThis & WrtcGlobals
  g.RTCPeerConnection = wrtc.RTCPeerConnection
  g.RTCSessionDescription = wrtc.RTCSessionDescription
  g.RTCIceCandidate = wrtc.RTCIceCandidate
  g.MediaStream = wrtc.MediaStream
  g.MediaStreamTrack = wrtc.MediaStreamTrack
  registered = true
}

export function createSyntheticAvStream(): MediaStream {
  const videoSource = new wrtc.nonstandard.RTCVideoSource()
  const audioSource = new wrtc.nonstandard.RTCAudioSource()
  const stream = new wrtc.MediaStream()
  stream.addTrack(videoSource.createTrack())
  stream.addTrack(audioSource.createTrack())
  return stream
}

export function createSyntheticVideoStream(): MediaStream {
  const videoSource = new wrtc.nonstandard.RTCVideoSource()
  const stream = new wrtc.MediaStream()
  stream.addTrack(videoSource.createTrack())
  return stream
}
