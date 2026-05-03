import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'
import { Link } from 'react-router-dom'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import { catalogStillImageUrl } from '../../catalog/mockCatalog'

function tagForIndex(i: number): string {
  if (i === 0) return 'New Release'
  return 'Spotlight'
}

export function HomeSpotlightBanner({ episodes }: { episodes: CatalogEpisode[] }) {
  const slides = episodes.slice(0, 3)
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
                                  <li>#{ep.experimentNumber}</li>
                                  <li>
                                    <img src="/design/images/asset-2.png" alt="" />
                                    <span>★</span>
                                  </li>
                                  <li>—</li>
                                  <li>
                                    <Link to={`/watch/${ep.id}`}>
                                      <span>{ep.era}</span>
                                    </Link>
                                  </li>
                                </ul>
                                <p>
                                  {ep.tagline?.trim() ||
                                    'Watch this experiment solo with the official YouTube player, or join a room from the lobby when friends are online.'}
                                </p>
                              </div>
                              <div className="gen-movie-action">
                                <div className="gen-btn-container button-1">
                                  <Link to={`/watch/${ep.id}`} className="gen-button">
                                    <i aria-hidden className="ion ion-play" />
                                    <span className="text">Watch solo</span>
                                  </Link>
                                </div>
                                <div className="gen-btn-container button-2">
                                  <Link to="/room/demo-room" className="gen-button gen-button-link">
                                    <span className="text">Room (demo)</span>
                                  </Link>
                                </div>
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
