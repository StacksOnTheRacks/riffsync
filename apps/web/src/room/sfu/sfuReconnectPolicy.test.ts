import { describe, expect, it } from 'vitest'
import { nextSfuReconnectDelayMs } from './sfuReconnectPolicy'

describe('nextSfuReconnectDelayMs', () => {
  it('starts at base delay and doubles', () => {
    expect(nextSfuReconnectDelayMs(0)).toBe(600)
    expect(nextSfuReconnectDelayMs(1)).toBe(1200)
    expect(nextSfuReconnectDelayMs(2)).toBe(2400)
  })

  it('respects cap', () => {
    expect(nextSfuReconnectDelayMs(100)).toBe(45_000)
  })

  it('clamps negative index', () => {
    expect(nextSfuReconnectDelayMs(-3)).toBe(600)
  })
})
