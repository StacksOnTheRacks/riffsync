import {
  THEATER_SHARE_QUALITY_LABELS,
  type TheaterShareQualityPreset,
} from './theaterShareQuality'

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
