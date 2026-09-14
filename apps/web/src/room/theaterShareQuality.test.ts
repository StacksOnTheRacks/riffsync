import { describe, expect, it } from 'vitest'
import { theaterShareVideoConstraints } from './theaterShareQuality'

describe('theaterShareVideoConstraints', () => {
  it('uses smooth preset constraints', () => {
    expect(theaterShareVideoConstraints('smooth')).toEqual({
      frameRate: { ideal: 30, max: 30 },
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
    })
  })

  it('uses balanced preset constraints', () => {
    expect(theaterShareVideoConstraints('balanced')).toEqual({
      frameRate: { ideal: 24, max: 30 },
      width: { ideal: 1280, max: 1600 },
      height: { ideal: 720, max: 900 },
    })
  })

  it('uses sharp preset constraints', () => {
    expect(theaterShareVideoConstraints('sharp')).toEqual({
      frameRate: { ideal: 30, max: 30 },
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
    })
  })
})
