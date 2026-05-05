import { Link } from 'react-router-dom'
import { useCatalogCarouselQuery, useCatalogEntriesQuery } from '../catalog/useCatalogQuery'
import {
  buildHeroSlides,
  cycleSlice,
  firstEpisodesWithYoutubeForEra,
} from '../catalog/mockCatalog'
import { HomeHeroBanner } from './home/HomeHeroBanner'
import { HomeMovieRowSection } from './home/HomeMovieRowSection'
import { HomeSpotlightBanner } from './home/HomeSpotlightBanner'

/**
 * Catalog landing (/) — full list from **`GET /v1/catalog`**; hero + spotlight from
 * **`GET /v1/catalog?carousel=true`** when **`VITE_PUBLIC_API_BASE_URL`** is set.
 * In **`vite dev`** without that var, both load from **`data/catalog/episodes.json`** (carousel rows filtered client-side).
 * Era strips (Joel / Mike / Jonah) take the first **10** entries per era that include a **YouTube** id from the full catalog response.
 */
export function HomePage() {
  const { data, isPending, isError, error } = useCatalogEntriesQuery()
  const carouselQ = useCatalogCarouselQuery()

  if (isPending) {
    return (
      <div className="riffsync-home">
        <p className="container">Loading catalog…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="riffsync-home" role="alert">
        <div className="container">
          <h1>Catalog unavailable</h1>
          <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
          <p>
            For production builds, set <code>VITE_PUBLIC_API_BASE_URL</code> to your HTTP API origin.
            For local dev against the API, add it to <code>.env.development</code> (see{' '}
            <code>.env.development.example</code>).</p>
          <p>
            <Link to="/catalog">Catalog page</Link>
          </p>
        </div>
      </div>
    )
  }

  const entries = data ?? []
  const carouselEntries =
    carouselQ.isSuccess ? (carouselQ.data ?? []) : carouselQ.isError ? [] : []

  if (entries.length === 0) {
    return (
      <div className="riffsync-home">
        <p className="container">The catalog is empty.</p>
      </div>
    )
  }

  const heroSlides = buildHeroSlides(carouselEntries)

  const joelYoutubeRow = firstEpisodesWithYoutubeForEra(entries, 'joel', 10)
  const mikeYoutubeRow = firstEpisodesWithYoutubeForEra(entries, 'mike', 10)
  const jonahYoutubeRow = firstEpisodesWithYoutubeForEra(entries, 'jonah', 10)

  return (
    <div className="riffsync-home">
      {heroSlides.length > 0 ? <HomeHeroBanner slides={heroSlides} /> : null}
      <HomeMovieRowSection
        sectionId="home-most-popular"
        title="Most Popular"
        episodes={cycleSlice(entries, 0, 12)}
      />
      <HomeMovieRowSection
        sectionId="home-most-viewed"
        title="Most Viewed"
        episodes={cycleSlice(entries, 12, 12)}
      />
      <HomeSpotlightBanner episodes={carouselEntries} />
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
