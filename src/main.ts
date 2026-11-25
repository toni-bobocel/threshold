import './styles/page.css'
import './styles/tour.css'
import { drawer, film, masthead, rail } from './page'

masthead()
film()
drawer()
rail()

// three.js is most of the weight of the site: only fetch it when the walk-through is close.
const tour = document.querySelector('.tour')!
const near = new IntersectionObserver(async ([entry]) => {
  if (!entry?.isIntersecting) return
  near.disconnect()
  const [{ mountTour }, { tokyo }] = await Promise.all([import('./tour/tour'), import('./suites/tokyo')])
  mountTour(tokyo)
}, { rootMargin: '150% 0px' })
near.observe(tour)
