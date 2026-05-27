import { describe, expect, it } from 'vitest'
import { avatarInitialFromDisplayName, isHttpsAvatarUrl } from './fanAvatarDisplay'

describe('fanAvatarDisplay', () => {
  it('avatarInitialFromDisplayName uses first grapheme uppercased', () => {
    expect(avatarInitialFromDisplayName('  ada ')).toBe('A')
    expect(avatarInitialFromDisplayName('')).toBe('?')
  })

  it('isHttpsAvatarUrl accepts https only', () => {
    expect(isHttpsAvatarUrl('https://cdn.example/a.png')).toBe(true)
    expect(isHttpsAvatarUrl('http://cdn.example/a.png')).toBe(false)
    expect(isHttpsAvatarUrl('')).toBe(false)
    expect(isHttpsAvatarUrl(undefined)).toBe(false)
  })
})
