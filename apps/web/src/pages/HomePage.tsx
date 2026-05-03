import {
  buildHeroSlides,
  mockCatalogEntries,
  mockRowMostPopular,
  mockRowMostViewed,
  mockRowThrillerStrip,
} from '../catalog/mockCatalog'
import { HomeHeroBanner } from './home/HomeHeroBanner'
import { HomeMovieRowSection } from './home/HomeMovieRowSection'
import { HomeSpotlightBanner } from './home/HomeSpotlightBanner'

/**
 * Catalog landing (/) — M3 visual parity with movies-home.html using mock catalog data only.
 * TODO(M4): hydrate sections from GET /v1/catalog; keep component seams stable.
 */
export function HomePage() {
  const heroSlides = buildHeroSlides(mockCatalogEntries)

  return (
    <div className="riffsync-home">
      <HomeHeroBanner slides={heroSlides} />
      <HomeMovieRowSection
        sectionId="home-most-popular"
        title="Most Popular"
        episodes={mockRowMostPopular}
      />
      <HomeMovieRowSection
        sectionId="home-most-viewed"
        title="Most Viewed"
        episodes={mockRowMostViewed}
      />
      <HomeSpotlightBanner episodes={mockCatalogEntries} />
      <HomeMovieRowSection
        sectionId="home-joel-era"
        title="Joel-era experiments"
        episodes={mockRowThrillerStrip}
      />
    </div>
  )
}
