import './styles/page.css'
import './styles/tour.css'
import { drawer, film, masthead, rail } from './page'
import { amangiri } from './suites/amangiri'
import { amanpuri } from './suites/amanpuri'
import { tokyo } from './suites/tokyo'
import { mountTour } from './tour/tour'

masthead()
film()
drawer()
rail()
mountTour({ tokyo, amangiri, amanpuri })
