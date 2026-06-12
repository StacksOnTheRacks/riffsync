import { describe, expect, it } from 'vitest'
import {
  CHAT_DEGRADED_AFTER_FAILED_CYCLES,
  CHAT_RECONNECT_BACKOFF_CAP_MS,
  CHAT_RECONNECT_BACKOFF_INITIAL_MS,
  CHAT_RECONNECT_BACKOFF_MULTIPLIER,
  SFU_DEGRADED_AFTER_FAILED_CYCLES,
  SFU_JWT_REMINT_LEAD_SECONDS,
  chatLifecycleAfterFailedCycle,
  nextChatReconnectBackoffMs,
  sfuLifecycleAfterFailedCycle,
} from './drawerReconnectPolicy'

describe('drawerReconnectPolicy', () => {
  it('exposes chat backoff constants', () => {
    expect(CHAT_RECONNECT_BACKOFF_INITIAL_MS).toBe(1000)
    expect(CHAT_RECONNECT_BACKOFF_MULTIPLIER).toBe(2)
    expect(CHAT_RECONNECT_BACKOFF_CAP_MS).toBe(60_000)
    expect(CHAT_DEGRADED_AFTER_FAILED_CYCLES).toBe(3)
  })

  it('exposes SFU degraded threshold and JWT remint lead', () => {
    expect(SFU_DEGRADED_AFTER_FAILED_CYCLES).toBe(5)
    expect(SFU_JWT_REMINT_LEAD_SECONDS).toBe(60)
  })

  it('doubles chat backoff until cap', () => {
    expect(nextChatReconnectBackoffMs(1000)).toEqual({ delayMs: 1000, nextBackoffMs: 2000 })
    expect(nextChatReconnectBackoffMs(32_000)).toEqual({ delayMs: 32_000, nextBackoffMs: 60_000 })
    expect(nextChatReconnectBackoffMs(60_000)).toEqual({ delayMs: 60_000, nextBackoffMs: 60_000 })
  })

  it('promotes chat lifecycle to degraded after threshold failed cycles', () => {
    expect(chatLifecycleAfterFailedCycle(2)).toBe('reconnecting')
    expect(chatLifecycleAfterFailedCycle(3)).toBe('degraded')
    expect(chatLifecycleAfterFailedCycle(4)).toBe('degraded')
  })

  it('promotes SFU lifecycle to degraded after threshold failed cycles', () => {
    expect(sfuLifecycleAfterFailedCycle(4)).toBe('reconnecting')
    expect(sfuLifecycleAfterFailedCycle(5)).toBe('degraded')
    expect(sfuLifecycleAfterFailedCycle(6)).toBe('degraded')
  })
})
