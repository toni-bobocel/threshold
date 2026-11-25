import './styles/page.css'
import './styles/tour.css'
import { drawer, film, masthead, rail } from './page'

masthead()
film()
drawer()
rail()

// the walk-through starts streaming frames as soon as it mounts: wait until it is close.
const tour = document.querySelector('.tour')!
const near = new IntersectionObserver(async ([entry]) => {
  if (!entry?.isIntersecting) return
  near.disconnect()
  const [{ mountTour }, { tokyo }] = await Promise.all([import('./tour/tour'), import('./suites/tokyo')])
  mountTour(tokyo)
}, { rootMargin: '150% 0px' })
near.observe(tour)
