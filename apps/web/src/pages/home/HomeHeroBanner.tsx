import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, Navigation } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/navigation'
import { Link } from 'react-router-dom'
import type { HeroSlide } from '../../catalog/mockCatalog'
import { formatCatalogEraLabel } from '../../catalog/catalogTypes'
import { EpisodeTileActions } from '../../components/catalog/EpisodeTileActions'

export function HomeHeroBanner({ slides }: { slides: HeroSlide[] }) {
  return (
    <section className="pt-0 pb-0" aria-label="Featured episodes">
      <div className="container-fluid px-0">
        <div className="row no-gutters">
          <div className="col-12">
            <div className="gen-banner-movies">
              <Swiper
                modules={[Navigation, Autoplay]}
                navigation
                loop
                autoplay={{ delay: 6500, disableOnInteraction: false }}
                className="riffsync-home-hero-swiper"
              >
                {slides.map((s, idx) => (
                  <SwiperSlide key={`${s.title}-${idx}`}>
                    <div
                      className="item"
                      style={{ background: `url('${s.backgroundUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                    >
                      <div className="gen-movie-contain h-100">
                        <div className="container h-100">
                          <div className="row align-items-center h-100">
                            <div className="col-xl-6">
                              <div className="gen-tag-line">
                                <span>
                                  Experiment {s.experimentNumber} · {formatCatalogEraLabel(s.episode.era)}
                                </span>
                              </div>
                              <div className="gen-movie-info">
                                <h3>{s.title}</h3>
                              </div>
                              <div className="gen-movie-meta-holder">
                                <ul>
                                  <li className="gen-sen-rating">
                                    <span>MST</span>
                                  </li>
                                  <li>RiffSync Catalog</li>
                                  <li>
                                    <Link to={`/watch/${s.episodeId}`}>
                                      <span>{formatCatalogEraLabel(s.episode.era)}</span>
                                    </Link>
                                  </li>
                                </ul>
                                <p>{s.taglineHtml}</p>
                              </div>
                              <div className="gen-movie-action">
                                <EpisodeTileActions episode={s.episode} layout="inline" />
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
