import { describe, expect, it } from 'vitest'

import { viewerRequestRedirectToCanonicalSource } from './cloudfront-canonical-redirect'

describe('viewerRequestRedirectToCanonicalSource', () => {
  it('returns 301 Moved Permanently for non-canonical hosts', () => {
    const source = viewerRequestRedirectToCanonicalSource('riffsync.tv')
    expect(source).toContain('statusCode: 301')
    expect(source).toContain("statusDescription: 'Moved Permanently'")
    expect(source).not.toContain('statusCode: 302')
  })
})
