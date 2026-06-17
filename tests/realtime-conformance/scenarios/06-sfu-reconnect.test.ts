/**
 * Harness step 6: SFU signaling reconnect with chat WS up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomRealtimeSdk } from '@web/room/sessions/RoomRealtimeSdk'
import { assertSiblingDrawerStaysConnected } from '@web/room/sessions/roomRealtimeSdkTestHelpers'
import {
  closeLatestSfuWebSocket,
  harnessJoinOptions,
  installSfuWebSocketTracker,
  mockHarnessSfuTokenFetch,
} from '../lib/harness-sdk-test-setup.js'
import { startRoomWsStub, type RoomWsStubHandle } from '../lib/room-ws-stub.js'

describe('harness step 6: SFU WS reconnect', () => {
  let stub: RoomWsStubHandle | undefined

  beforeEach(async () => {
    vi.clearAllMocks()
    mockHarnessSfuTokenFetch()
    installSfuWebSocketTracker()
    stub = await startRoomWsStub()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (stub) await stub.close()
  })

  it('sfuSignaling reconnects while chat stays connected', async () => {
    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', harnessJoinOptions(stub!.url, 'sess-harness-sfu-reconnect'))

    await vi.waitFor(
      () => {
        const diag = sdk.getDiagnostics()
        expect(diag.drawers.chat.state).toBe('connected')
        expect(diag.drawers.sfuSignaling.state).toBe('connected')
      },
      { timeout: 60_000 },
    )

    closeLatestSfuWebSocket()

    await vi.waitFor(
      () => {
        expect(sdk.getDiagnostics().drawers.sfuSignaling.state).toBe('reconnecting')
      },
      { timeout: 15_000 },
    )

    const duringOutage = sdk.getDiagnostics()
    assertSiblingDrawerStaysConnected(duringOutage, 'chat')
    expect(sdk.getChatStatus()).toBe('open')

    await vi.waitFor(
      () => {
        expect(sdk.getDiagnostics().drawers.sfuSignaling.state).toBe('connected')
      },
      { timeout: 30_000 },
    )

    const afterRecovery = sdk.getDiagnostics()
    expect(afterRecovery.drawers.sfuSignaling.state).toBe('connected')
    assertSiblingDrawerStaysConnected(afterRecovery, 'chat')

    sdk.leave()
  })
})
