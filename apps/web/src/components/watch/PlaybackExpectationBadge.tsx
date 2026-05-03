import type { PlaybackExpectation } from '../../catalog/catalogTypes'

const badgeLabel = (exp: PlaybackExpectation): string => {
  switch (exp) {
    case 'premium':
      return 'Often fewer interruptions with YouTube Premium (not verified here).'
    case 'ad_supported':
      return 'Expect ad breaks during playback (honor-system / non-verified).'
    case 'unknown':
      return 'Ad experience may vary (honor-system / non-verified).'
    default:
      return ''
  }
}

/**
 * US-P0-07 — advisory copy only; we do not detect Premium vs ads server-side.
 */
export function PlaybackExpectationBadge({ expectation }: { expectation?: PlaybackExpectation }) {
  if (!expectation || expectation === 'unknown') {
    return (
      <span className="riffsync-advisory riffsync-advisory--muted" title="Honor-system expectation only">
        Ads may appear · not verified
      </span>
    )
  }
  return (
    <span className="riffsync-advisory" title={badgeLabel(expectation)}>
      {expectation === 'premium' ? 'Premium-friendly (not verified)' : 'Likely ad-supported'}
    </span>
  )
}
