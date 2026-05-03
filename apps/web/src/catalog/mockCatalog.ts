import type { CatalogEpisode } from './catalogTypes'
import catalogJson from '../../../../data/catalog/episodes.json'

// TODO(M4): replace static import with GET /v1/catalog + client cache.
const bundle = catalogJson as { version: 1; entries: CatalogEpisode[] }

export const mockCatalogEntries: CatalogEpisode[] = bundle.entries

/** YouTube poster fallback when `posterImageUrl` / `backdropImageUrl` are null (dev/catalog seed). */
export function catalogStillImageUrl(ep: CatalogEpisode): string {
  if (ep.backdropImageUrl) return ep.backdropImageUrl
  if (ep.posterImageUrl) return ep.posterImageUrl
  if (ep.youtubeVideoId) {
    return `https://img.youtube.com/vi/${ep.youtubeVideoId}/hqdefault.jpg`
  }
  return '/design/images/background/asset-53.jpg'
}

export function catalogCardImageUrl(ep: CatalogEpisode): string {
  if (ep.posterImageUrl) return ep.posterImageUrl
  if (ep.youtubeVideoId) {
    return `https://img.youtube.com/vi/${ep.youtubeVideoId}/hqdefault.jpg`
  }
  return '/design/images/background/asset-53.jpg'
}

const HERO_BACKGROUNDS = [
  '/design/images/background/asset-9.jpeg',
  '/design/images/background/asset-52.jpg',
  '/design/images/background/asset-24.jpeg',
] as const

export interface HeroSlide {
  backgroundUrl: string
  title: string
  taglineHtml: string
  experimentNumber: number
  era: string
}

export function buildHeroSlides(entries: CatalogEpisode[]): HeroSlide[] {
  const slice = entries.slice(0, HERO_BACKGROUNDS.length)
  return HERO_BACKGROUNDS.map((backgroundUrl, i) => {
    const ep = slice[i] ?? entries[i % entries.length]
    const blurb =
      ep.tagline?.trim() ||
      `Experiment #${ep.experimentNumber}: Joel, Mike, Jonah, and friends riff on the film—in the not-too-distant future, this copy comes from the catalog API.`
    return {
      backgroundUrl,
      title: ep.title,
      taglineHtml: blurb,
      experimentNumber: ep.experimentNumber,
      era: ep.era,
    }
  })
}

function cycleSlice(entries: CatalogEpisode[], start: number, count: number): CatalogEpisode[] {
  if (entries.length === 0) return []
  const out: CatalogEpisode[] = []
  for (let i = 0; i < count; i++) {
    out.push(entries[(start + i) % entries.length]!)
  }
  return out
}

export const mockRowMostPopular = cycleSlice(mockCatalogEntries, 0, 12)
export const mockRowMostViewed = cycleSlice(mockCatalogEntries, 12, 12)
export const mockRowThrillerStrip = cycleSlice(mockCatalogEntries, 24, 12)
