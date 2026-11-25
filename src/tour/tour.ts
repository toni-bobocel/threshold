import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Frames } from './frames'
import { bounds, type Suite } from './plan'

gsap.registerPlugin(ScrollTrigger)

// one scroll unit, as a share of the viewport height
const UNIT = 0.62
// frames the camera covers per scroll unit while walking
const PACE = 30

const beats = { arrive: 0.7, fly: 3.2, flash: 0.6, model: 1.1, colour: 1.5, descend: 1.8, read: 1.3, leave: 1.8, linger: 0.9 }

type Meta = {
  segments: Record<'fly' | 'model' | 'descend' | 'walk' | 'leave', [number, number]>
  titled: number[]
  // x, z on the plan, heading in degrees, how far inside (0 = maquette, 1 = walking)
  frames: [number, number, number, number][]
}

type State = { frame: number; colour: number; flash: number; arrive: number; plate: number; card: number; cardIn: number }

const fresh = (): State => ({ frame: 0, colour: 0, flash: 0, arrive: 1, plate: 0, card: 0, cardIn: 0 })

const $ = <T extends Element>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!

export function mountTour(suites: Record<string, Suite>) {
  const section = $<HTMLElement>('.tour')
  const track = $<HTMLElement>('.tour__track', section)
  const stage = $<HTMLElement>('.stage', section)
  const canvas = $<HTMLCanvasElement>('.stage__gl', stage)
  const ctx = canvas.getContext('2d', { alpha: false })!
  const flash = $<HTMLElement>('.stage__flash', stage)
  const small = matchMedia('(max-width: 900px)').matches
  const fallback = $<HTMLElement>('.stage__fallback', stage)

  const ui = {
    place: $('.arrival__place', stage),
    title: $('.arrival__title', stage),
    lede: $('.arrival__lede', stage),
    arrival: $<HTMLElement>('.arrival', stage),
    gauge: $<HTMLElement>('.gauge', stage),
    gaugeLabel: $('.gauge__label', stage),
    gaugeValue: $('.gauge__value span', stage),
    gaugeUnit: $('.gauge__value small', stage),
    gaugeName: $('.gauge__name', stage),
    gaugeNote: $('.gauge__note', stage),
    gaugeFacts: $('.gauge__facts', stage),
    figures: $<HTMLElement>('.figures', stage),
    plate: $<HTMLElement>('.plate', stage),
    note: $<HTMLElement>('.note', stage),
    noteRoom: $('.note__room', stage),
    noteTitle: $('.note__title', stage),
    noteBody: $('.note__body', stage),
    noteFacts: $('.note__facts', stage),
    reserve: $<HTMLAnchorElement>('.note__reserve', stage),
    steps: $<HTMLElement>('.steps', stage),
    plan: $<HTMLElement>('.plan', stage),
    planSvg: $<SVGSVGElement>('.plan__svg', stage),
    planCaption: $('.plan__caption', stage),
  }

  let suite: Suite
  let meta: Meta | undefined
  let frames: Frames | undefined
  let tl: gsap.core.Timeline | undefined
  let s = fresh()
  let shownCard = -1
  let dirty = true
  let dot!: SVGGElement
  let loading = 0

  const list = (dl: Element, rows: [string, string][]) => {
    dl.replaceChildren(...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt')
      const dd = document.createElement('dd')
      dt.textContent = k
      dd.textContent = v
      return [dt, dd]
    }))
  }

  function drawPlan() {
    const b = bounds(suite.rooms)
    const pad = 0.8
    const NS = 'http://www.w3.org/2000/svg'
    const svg = ui.planSvg
    svg.setAttribute('viewBox', `${b.x0 - pad} ${b.z0 - pad} ${b.w + pad * 2} ${b.d + pad * 2}`)
    const title = svg.querySelector('title')
    svg.replaceChildren(...(title ? [title] : []))
    for (const r of suite.rooms) {
      const rect = document.createElementNS(NS, 'rect')
      const [x0, z0, x1, z1] = r.rect
      for (const [k, v] of Object.entries({ x: x0, y: z0, width: x1 - x0, height: z1 - z0, class: r.ceiling === false ? 'plan__open' : 'plan__room' })) {
        rect.setAttribute(k, String(v))
      }
      svg.append(rect)
    }
    for (const w of suite.walls) {
      const line = document.createElementNS(NS, 'line')
      for (const [k, v] of Object.entries({ x1: w.a[0], y1: w.a[1], x2: w.b[0], y2: w.b[1], class: `plan__wall plan__wall--${w.kind ?? 'solid'}` })) {
        line.setAttribute(k, String(v))
      }
      svg.append(line)
    }
    dot = document.createElementNS(NS, 'g')
    dot.innerHTML = '<path class="plan__cone" d="M0 0 L3.2 -1.5 A3.5 3.5 0 0 1 3.2 1.5 Z"/><circle class="plan__dot" r="0.32"/>'
    svg.append(dot)
  }

  function fillText() {
    ui.place.textContent = suite.place
    ui.title.textContent = suite.title
    ui.lede.textContent = suite.lede
    ui.gaugeLabel.textContent = suite.gauge.label
    ui.gaugeUnit.textContent = suite.gauge.unit
    ui.gaugeName.textContent = suite.gauge.name
    ui.gaugeNote.textContent = suite.gauge.note
    list(ui.gaugeFacts, suite.gauge.facts)
    ui.figures.replaceChildren(...suite.figures.map(([v, k]) => {
      const li = document.createElement('li')
      li.innerHTML = '<strong></strong><span></span>'
      li.querySelector('strong')!.textContent = v
      li.querySelector('span')!.textContent = k
      return li
    }))
    ui.plate.textContent = suite.plate
    ui.planCaption.textContent = suite.gauge.name
    const titled = suite.stops.filter(st => st.title).length
    ui.steps.replaceChildren(...Array.from({ length: titled + 1 }, () => document.createElement('li')))
  }

  function showCard(i: number) {
    shownCard = i
    const stop = suite.stops.filter(st => st.title)[i]
    const last = !stop
    ui.noteRoom.textContent = last ? suite.gauge.name : stop.room ?? ''
    ui.noteTitle.textContent = last ? suite.outro.title : stop.title ?? ''
    ui.noteBody.textContent = last ? suite.outro.body : stop.body ?? ''
    list(ui.noteFacts, last ? suite.outro.facts : stop.facts ?? [])
    ui.reserve.hidden = !last
    ui.note.classList.toggle('is-outro', last)
  }

  function choreograph(m: Meta) {
    tl?.scrollTrigger?.kill()
    tl?.kill()
    s = fresh()
    shownCard = -1
    const { fly, model, descend, leave } = m.segments
    const end = (seg: [number, number]) => seg[0] + seg[1] - 1

    tl = gsap.timeline({ defaults: { ease: 'none' }, onUpdate: () => { dirty = true } })
    tl.to(s, { arrive: 1, duration: beats.arrive })
      .addLabel('fly')
      .to(s, { frame: end(fly), duration: beats.fly }, 'fly')
      .to(s, { arrive: 0, duration: beats.fly * 0.25 }, 'fly')
      .to(s, { flash: 1, duration: beats.flash * 0.35, ease: 'power2.in' }, `fly+=${beats.fly - beats.flash * 0.35}`)
      .set(s, { frame: model[0] })
      .to(s, { flash: 0, duration: beats.flash * 0.65, ease: 'power2.out' })
      .to(s, { plate: 1, duration: 0.3 }, '<')
      .addLabel('model')
      .to(s, { frame: end(model), duration: beats.model + beats.colour }, 'model')
      .to(s, { colour: 1, duration: beats.colour, ease: 'power1.inOut' }, `model+=${beats.model}`)
      .to(s, { plate: 0, duration: 0.4 }, `model+=${beats.model + beats.colour - 0.3}`)
      .set(s, { frame: descend[0] })
      .to(s, { frame: end(descend), duration: beats.descend })

    m.titled.forEach((at, k) => {
      if (k > 0) tl!.to(s, { frame: at, duration: (at - m.titled[k - 1]!) / PACE })
      tl!.set(s, { card: k })
        .to(s, { cardIn: 1, duration: 0.25 }, '-=0.15')
        .to(s, { cardIn: 1, duration: beats.read - 0.5 })
        .to(s, { cardIn: 0, duration: 0.25 })
    })
    tl.addLabel('leave')
      .to(s, { frame: end(leave), duration: beats.leave }, 'leave')
      .set(s, { card: m.titled.length }, `leave+=${beats.leave * 0.6}`)
      .to(s, { cardIn: 1, duration: 0.3 }, `leave+=${beats.leave * 0.6}`)
      .to(s, { cardIn: 1, duration: beats.linger })

    track.style.height = `${(tl.duration() * UNIT + 1) * 100}vh`
    ScrollTrigger.create({
      trigger: track,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      animation: tl,
      invalidateOnRefresh: true,
    })
    ScrollTrigger.refresh()
  }

  async function load(id: string) {
    const ticket = ++loading
    const base = `${import.meta.env.BASE_URL}frames/${id}/`
    const res = await fetch(`${base}meta.json`)
    // a second click while the first suite was still loading wins
    if (ticket !== loading) return
    // the dev server answers a missing file with index.html, so check what came back
    const missing = !res.ok || !res.headers.get('content-type')?.includes('json')
    fallback.hidden = !missing
    if (missing) {
      meta = undefined
      frames?.dispose()
      frames = undefined
      ctx.fillStyle = '#efebe5'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      return
    }
    const m: Meta = await res.json()
    suite = suites[id]!
    meta = m
    frames?.dispose()
    const size = small ? 'm' : 'd'
    frames = new Frames(key => `${base}${size}/${key[0]}${key.slice(1).padStart(4, '0')}.webp`, m.frames.length, m.segments.model)
    frames.onReady = () => { dirty = true }
    frames.preload()
    fillText()
    drawPlan()
    choreograph(m)
    dirty = true
  }

  function cover(img: ImageBitmap, alpha: number) {
    const cw = canvas.width
    const ch = canvas.height
    const k = Math.max(cw / img.width, ch / img.height)
    const w = img.width * k
    const h = img.height * k
    ctx.globalAlpha = alpha
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h)
  }

  // Draws only when the scroll or a newly decoded frame changed something.
  function paint() {
    requestAnimationFrame(paint)
    if (!dirty || !frames || !meta) return
    dirty = false

    const i = Math.min(meta.frames.length - 1, Math.max(0, Math.floor(s.frame)))
    const t = s.frame - i
    const [m0, mn] = meta.segments.model
    const inModel = i >= m0 && i < m0 + mn
    frames.focus(s.frame)
    if (inModel) frames.focus(s.frame, 'k')

    // the maquette frames have a transparent sky, so this is their background
    ctx.globalAlpha = 1
    ctx.fillStyle = '#efebe5'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const here = frames.nearest(i)
    if (here) cover(here, 1)
    // a crossfade between neighbours hides the steps between rendered frames
    const after = t > 0.02 ? frames.exact(i + 1) : undefined
    if (after) cover(after, t)
    if (inModel && s.colour < 1) {
      const clay = frames.nearest(i, 'k')
      if (clay) cover(clay, 1 - s.colour)
    }
    ctx.globalAlpha = 1

    const [x, z, yaw, inside] = meta.frames[i]!
    dot.setAttribute('transform', `translate(${x} ${z}) rotate(${yaw})`)
    ui.plan.style.opacity = String(Math.max(0, (inside - 0.6) / 0.35))
    ui.steps.querySelectorAll('li').forEach((li, k) => {
      li.classList.toggle('is-on', inside > 0.5 && k === s.card)
    })

    if (s.card !== shownCard) showCard(s.card)
    ui.note.style.opacity = String(s.cardIn)
    ui.note.style.transform = `translateY(${(1 - s.cardIn) * 14}px)`
    ui.note.style.visibility = s.cardIn > 0.01 ? 'visible' : 'hidden'

    ui.arrival.style.opacity = String(s.arrive)
    ui.arrival.style.transform = `translateY(${(1 - s.arrive) * -30}px)`
    ui.figures.style.opacity = String(s.arrive)
    const [f0, fn] = meta.segments.fly
    const fly = Math.min(1, Math.max(0, (s.frame - f0) / (fn - 1)))
    const g = i < f0 + fn ? Math.min(1, Math.max(0, 1 - (fly - 0.8) * 5)) : 0
    ui.gauge.style.opacity = String(g)
    ui.gauge.style.visibility = g > 0.01 ? 'visible' : 'hidden'
    const value = Math.round(suite.gauge.from + (suite.gauge.to - suite.gauge.from) * Math.min(1, fly * 1.15) ** 1.6)
    // a floor reads as "07"; a height in metres does not
    ui.gaugeValue.textContent = suite.gauge.unit ? String(value) : String(value).padStart(2, '0')
    ui.plate.style.opacity = String(s.plate)
    flash.style.opacity = String(s.flash)
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio, 2)
    canvas.width = Math.round(stage.clientWidth * dpr)
    canvas.height = Math.round(stage.clientHeight * dpr)
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#efebe5'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    dirty = true
  }
  new ResizeObserver(resize).observe(stage)
  resize()
  requestAnimationFrame(paint)

  const tabs = section.querySelectorAll<HTMLButtonElement>('.tour__picker [data-hotel]')
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      for (const t of tabs) t.setAttribute('aria-selected', String(t === tab))
      load(tab.dataset.hotel!)
      scrollTo({ top: track.getBoundingClientRect().top + scrollY, behavior: 'smooth' })
    })
  }

  load('tokyo')
}
