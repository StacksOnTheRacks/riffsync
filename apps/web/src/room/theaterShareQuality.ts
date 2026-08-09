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
