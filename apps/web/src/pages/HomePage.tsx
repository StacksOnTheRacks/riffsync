import { Link } from 'react-router-dom'
import { useCatalogEntriesQuery } from '../catalog/useCatalogQuery'
import {
  buildHeroSlides,
  cycleSlice,
} from '../catalog/mockCatalog'
import { HomeHeroBanner } from './home/HomeHeroBanner'
import { HomeMovieRowSection } from './home/HomeMovieRowSection'
import { HomeSpotlightBanner } from './home/HomeSpotlightBanner'

/**
 * Catalog landing (/) — rows hydrate from **`GET /v1/catalog`** when **`VITE_PUBLIC_API_BASE_URL`**
 * is set; in **`vite dev`** without that var, the dev seed JSON loads (**`data/catalog/episodes.json`**).
 */
export function HomePage() {
  const { data, isPending, isError, error } = useCatalogEntriesQuery()

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
  if (entries.length === 0) {
    return (
      <div className="riffsync-home">
        <p className="container">The catalog is empty.</p>
      </div>
    )
  }

  const heroSlides = buildHeroSlides(entries)

  return (
    <div className="riffsync-home">
      <HomeHeroBanner slides={heroSlides} />
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
      <HomeSpotlightBanner episodes={entries} />
      <HomeMovieRowSection
        sectionId="home-joel-era"
        title="Joel-era experiments"
        episodes={cycleSlice(entries, 24, 12)}
      />
    </div>
  )
}
