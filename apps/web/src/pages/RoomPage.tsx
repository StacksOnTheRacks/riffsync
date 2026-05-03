import { useParams } from 'react-router-dom'

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>()

  return (
    <>
      <h1>Room</h1>
      <p>
        M2 scaffold — room id: <code>{roomId ?? '—'}</code>
      </p>
      <p>WebSocket, WebRTC, and YouTube embed land in later milestones.</p>
    </>
  )
}
