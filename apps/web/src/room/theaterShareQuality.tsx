export type TheaterShareQualityPreset = 'smooth' | 'balanced' | 'sharp'

export const THEATER_SHARE_QUALITY_LABELS: Record<TheaterShareQualityPreset, string> = {
  smooth: 'Smooth (30 fps)',
  balanced: 'Balanced (24 fps)',
  sharp: 'Sharp (higher detail)',
}

export function theaterShareVideoConstraints(
  preset: TheaterShareQualityPreset,
): MediaTrackConstraints {
  if (preset === 'smooth') {
    return {
      frameRate: { ideal: 30, max: 30 },
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
    }
  }
  if (preset === 'sharp') {
    return {
      frameRate: { ideal: 30, max: 30 },
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
    }
  }
  return {
    frameRate: { ideal: 24, max: 30 },
    width: { ideal: 1280, max: 1600 },
    height: { ideal: 720, max: 900 },
  }
}

type TheaterShareQualityControlsProps = {
  value: TheaterShareQualityPreset
  onChange: (preset: TheaterShareQualityPreset) => void
}

export function TheaterShareQualityControls({
  value,
  onChange,
}: TheaterShareQualityControlsProps) {
  return (
    <div className="riffsync-theater-quality" data-testid="theater-share-quality">
      <label className="riffsync-theater-quality__label" htmlFor="riffsync-theater-quality">
        Share quality
      </label>
      <select
        id="riffsync-theater-quality"
        className="riffsync-theater-quality__select"
        value={value}
        onChange={(e) => onChange(e.target.value as TheaterShareQualityPreset)}
      >
        {(Object.keys(THEATER_SHARE_QUALITY_LABELS) as TheaterShareQualityPreset[]).map((key) => (
          <option key={key} value={key}>
            {THEATER_SHARE_QUALITY_LABELS[key]}
          </option>
        ))}
      </select>
      <p className="riffsync-muted riffsync-theater-quality__hint">
        Applies the next time you start Share Source Tab. Higher quality needs more uplink.
      </p>
    </div>
  )
}
