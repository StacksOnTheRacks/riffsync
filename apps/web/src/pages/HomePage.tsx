import { useNavigate } from 'react-router-dom'
import {
  useCatalogCarouselQuery,
  useCatalogListQuery,
  useCatalogSpotlightQuery,
} from '../catalog/catalogQueries'
import { CatalogLoadErrorPanel } from '../components/catalog/CatalogLoadErrorPanel'
import { useResumePendingPartyRoom } from '../catalog/useResumePendingPartyRoom'
import {
  buildHeroSlides,
  catalogEntriesWithYoutubeLink,
  firstEpisodesWithYoutubeForEra,
  topEpisodesForHomeMostPopular,
} from '../catalog/mockCatalog'
import { HomeHeroBanner } from './home/HomeHeroBanner'
import { HomeMovieRowSection } from './home/HomeMovieRowSection'
import { HomeSpotlightBanner } from './home/HomeSpotlightBanner'

/**
 * Catalog landing (/) — full list from **`GET /v1/catalog`**; hero from
 * **`GET /v1/catalog?carousel=true`**; spotlight from **`GET /v1/catalog?spotlight=true`**
 * when **`VITE_PUBLIC_API_BASE_URL`** is set.
 * In **`vite dev`** without that var, all load from **`data/catalog/episodes.json`** (filtered client-side).
 * Rows use only episodes that include a **YouTube** id (same filter as **`/catalog`**).
 * **Most Popular** ranks playable episodes by reconciled **`tmdbPopularity`** (unreconciled rows trail in experiment order); **`other`** era rows are excluded.
 * Era strips take the first **10** per Joel / Mike / Jonah from that playable set.
 */
export function HomePage() {
  const navigate = useNavigate()
  const { data, isPending, isError, error, refetch } = useCatalogListQuery()
  const carouselQ = useCatalogCarouselQuery()
  const spotlightQ = useCatalogSpotlightQuery()

  useResumePendingPartyRoom(data, navigate)

  if (isPending && !data) {
    return (
      <div className="riffsync-home">
        <p className="container">Loading catalog…</p>
      </div>
    )
  }

  if (isError && !data) {
    return (
      <div className="riffsync-home">
        <div className="container">
          <CatalogLoadErrorPanel
            error={error}
            onRetry={() => {
              void refetch()
            }}
            catalogLink
          />
        </div>
      </div>
    )
  }

  const entries = data ?? []
  const carouselEntries = carouselQ.data ?? []
  const spotlightEntries = spotlightQ.data ?? []
  const playableEntries = catalogEntriesWithYoutubeLink(entries)
  const carouselWithYoutube = catalogEntriesWithYoutubeLink(carouselEntries)
  const spotlightWithYoutube = catalogEntriesWithYoutubeLink(spotlightEntries)

  if (entries.length === 0) {
    return (
      <div className="riffsync-home">
        <p className="container">The catalog is empty.</p>
      </div>
    )
  }

  if (playableEntries.length === 0) {
    return (
      <div className="riffsync-home">
        <p className="container">No episodes with a YouTube link are available yet.</p>
      </div>
    )
  }

  const heroSlides = buildHeroSlides(carouselWithYoutube)

  const joelYoutubeRow = firstEpisodesWithYoutubeForEra(playableEntries, 'joel', 10)
  const mikeYoutubeRow = firstEpisodesWithYoutubeForEra(playableEntries, 'mike', 10)
  const jonahYoutubeRow = firstEpisodesWithYoutubeForEra(playableEntries, 'jonah', 10)

  return (
    <div className="riffsync-home">
      {heroSlides.length > 0 ? <HomeHeroBanner slides={heroSlides} /> : null}
      <HomeMovieRowSection
        sectionId="home-most-popular"
        title="Most Popular"
        episodes={topEpisodesForHomeMostPopular(playableEntries, 12)}
      />
      <HomeSpotlightBanner episodes={spotlightWithYoutube} />
      {joelYoutubeRow.length > 0 ? (
        <HomeMovieRowSection
          sectionId="home-joel-era"
          title="Joel-era experiments"
          episodes={joelYoutubeRow}
        />
      ) : null}
      {mikeYoutubeRow.length > 0 ? (
        <HomeMovieRowSection
          sectionId="home-mike-era"
          title="Mike-era experiments"
          episodes={mikeYoutubeRow}
        />
      ) : null}
      {jonahYoutubeRow.length > 0 ? (
        <HomeMovieRowSection
          sectionId="home-jonah-era"
          title="Jonah-era experiments"
          episodes={jonahYoutubeRow}
        />
      ) : null}
    </div>
  )
}
