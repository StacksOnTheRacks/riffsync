/** @deprecated Import from `./catalogQueries` instead. */
export {
  catalogListCarouselQueryKey,
  catalogListSpotlightQueryKey,
  catalogListFullQueryKey,
  catalogEpisodeQueryKey,
  invalidatePublicCatalogQueries,
  useCatalogCarouselQuery,
  useCatalogSpotlightQuery,
  useCatalogEpisodeQuery,
  useCatalogListQuery,
} from './catalogQueries'

/** @deprecated Use `useCatalogListQuery`. */
export { useCatalogListQuery as useCatalogEntriesQuery } from './catalogQueries'
