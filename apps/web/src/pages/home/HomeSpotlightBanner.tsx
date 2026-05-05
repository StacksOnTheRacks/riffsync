import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'
import { Link } from 'react-router-dom'
import { catalogStillImageUrl } from '../../catalog/mockCatalog'
import { formatCatalogEraLabel, type CatalogEpisode } from '../../catalog/catalogTypes'
import { EpisodeTileActions } from '../../components/catalog/EpisodeTileActions'

function tagForIndex(i: number): string {
  if (i === 0) return 'New Release'
  return 'Spotlight'
}

/** `episodes` should be the carousel list from **`GET /v1/catalog?carousel=true`**. */
export function HomeSpotlightBanner({ episodes }: { episodes: CatalogEpisode[] }) {
  const slides = episodes.slice(0, 3)
  if (slides.length === 0) return null
  return (
    <section
      className="pt-0 pb-0 gen-section-padding-2 home-singal-silder"
      aria-label="Spotlight strip"
    >
      <div className="container">
        <div className="row">
          <div className="col-12">
            <div className="gen-banner-movies">
              <Swiper
                modules={[Pagination, Autoplay]}
                pagination={{ clickable: true }}
                loop
                autoplay={{ delay: 7000, disableOnInteraction: false }}
                className="riffsync-home-spotlight-swiper"
              >
                {slides.map((ep, idx) => (
                  <SwiperSlide key={ep.id}>
                    <div
                      className="item"
                      style={{
                        background: `url('${catalogStillImageUrl(ep)}')`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <div className="gen-movie-contain h-100">
                        <div className="container h-100">
                          <div className="row align-items-center h-100">
                            <div className="col-xl-6">
                              <div className="gen-tag-line">
                                <span>{tagForIndex(idx)}</span>
                              </div>
                              <div className="gen-movie-info">
                                <h3>{ep.title}</h3>
                              </div>
                              <div className="gen-movie-meta-holder">
                                <ul>
                                  <li className="gen-sen-rating">
                                    <span>MST</span>
                                  </li>
                                  <li>RiffSync Catalog</li>
                                  <li>
                                    <Link to={`/watch/${ep.id}`}>
                                      <span>{formatCatalogEraLabel(ep.era)}</span>
                                    </Link>
                                  </li>
                                </ul>
                                <p>
                                  {ep.tagline?.trim() ||
                                    'Watch this experiment solo with the official YouTube player, or start a party when you’re signed in.'}
                                </p>
                              </div>
                              <div className="gen-movie-action">
                                <EpisodeTileActions episode={ep} layout="inline" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </SwiperSlide>
                ))}
              </Swiper>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
