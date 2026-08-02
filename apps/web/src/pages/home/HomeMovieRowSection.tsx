import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/navigation'
import { Link } from 'react-router-dom'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import { HomeMovieCard } from './HomeMovieCard'

const rowBreakpoints = {
  0: { slidesPerView: 1, spaceBetween: 30 },
  576: { slidesPerView: 2, spaceBetween: 30 },
  768: { slidesPerView: 3, spaceBetween: 30 },
  1200: { slidesPerView: 4, spaceBetween: 30 },
} as const

export function HomeMovieCarousel({
  ariaLabel,
  episodes,
}: {
  ariaLabel: string
  episodes: CatalogEpisode[]
}) {
  return (
    <Swiper
      modules={[Navigation]}
      navigation
      watchOverflow
      slidesPerView={4}
      spaceBetween={30}
      breakpoints={rowBreakpoints}
      className="riffsync-home-row-swiper"
      aria-label={ariaLabel}
    >
      {episodes.map((ep) => (
        <SwiperSlide key={ep.id} className="item">
          <HomeMovieCard episode={ep} />
        </SwiperSlide>
      ))}
    </Swiper>
  )
}

export function HomeMovieRowSection({
  title,
  episodes,
  sectionId,
  moreVideosTo = '/catalog',
}: {
  title: string
  episodes: CatalogEpisode[]
  sectionId: string
  moreVideosTo?: string
}) {
  return (
    <section className="gen-section-padding-2" id={sectionId} aria-labelledby={`${sectionId}-heading`}>
      <div className="container">
        <div className="row">
          <div className="col-xl-6 col-lg-6 col-md-6">
            <h4 className="gen-heading-title" id={`${sectionId}-heading`}>
              {title}
            </h4>
          </div>
          <div className="col-xl-6 col-lg-6 col-md-6 d-none d-md-inline-block">
            <div className="gen-movie-action">
              <div className="gen-btn-container text-right">
                <Link to={moreVideosTo} className="gen-button gen-button-flat">
                  <span className="text">More Videos</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className="row mt-3">
          <div className="col-12">
            <div className="gen-style-2">
              <HomeMovieCarousel ariaLabel={`${title} carousel`} episodes={episodes} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
