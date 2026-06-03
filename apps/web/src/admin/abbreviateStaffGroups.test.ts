import { describe, expect, it } from 'vitest'
import { abbreviateStaffGroups } from './abbreviateStaffGroups'

describe('abbreviateStaffGroups', () => {
  it('returns (none) for empty groups', () => {
    expect(abbreviateStaffGroups([])).toBe('(none)')
  })

  it('joins up to two groups without abbreviation', () => {
    expect(abbreviateStaffGroups(['admin'])).toBe('admin')
    expect(abbreviateStaffGroups(['admin', 'curator'])).toBe('admin, curator')
  })

  it('abbreviates when more than two groups', () => {
    expect(abbreviateStaffGroups(['admin', 'curator', 'editor'])).toBe('admin, curator (+1)')
  })
})
