import './styles/page.css'
import './styles/tour.css'
import { drawer, film, masthead, rail } from './page'
import { tokyo } from './suites/tokyo'
import { mountTour } from './tour/tour'

masthead()
film()
drawer()
rail()
mountTour({ tokyo })
