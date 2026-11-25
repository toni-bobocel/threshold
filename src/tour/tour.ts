import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import * as THREE from 'three'
import { N8AOPass } from 'n8ao'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { type Built, buildSuite } from './build'
import { clay } from './materials'
import { buildOutside, type Outside } from './outside'
import { bounds, type Suite } from './plan'
import { beats, legs, length } from './script'

gsap.registerPlugin(ScrollTrigger)

// one scroll unit, as a share of the viewport height
const UNIT = 0.62

const $ = <T extends Element>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!

type State = {
  fly: number
  flash: number
  swap: number
  spin: number
  inside: number
  t: number
  arrive: number
  plate: number
  card: number
  cardIn: number
}

const fresh = (): State => ({ fly: 0, flash: 0, swap: 0, spin: 0, inside: 0, t: 0, arrive: 1, plate: 0, card: 0, cardIn: 0 })

export function mountTour(suites: Record<string, Suite>) {
  const section = $<HTMLElement>('.tour')
  const track = $<HTMLElement>('.tour__track', section)
  const stage = $<HTMLElement>('.stage', section)
  const canvas = $<HTMLCanvasElement>('.stage__gl', stage)
  const flash = $<HTMLElement>('.stage__flash', stage)

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  } catch {
    $<HTMLElement>('.stage__fallback', stage).hidden = false
    return
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 9000)
  const inside = new THREE.Scene()
  inside.environment = room
  inside.environmentIntensity = 0.55

  // Contact shadows under furniture and in corners do more for realism than
  // any texture; only the rooms get them, the flight outside does not need it.
  const composer = new EffectComposer(renderer)
  const ao = new N8AOPass(inside, camera, 1, 1)
  Object.assign(ao.configuration, { aoRadius: 0.7, distanceFalloff: 0.8, intensity: 2.6, halfRes: true, gammaCorrection: false, color: new THREE.Color('#2a211b') })
  ao.setQualityMode('Medium')
  composer.addPass(ao)
  composer.addPass(new OutputPass())

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
  let built: Built | undefined
  let outside: Outside | undefined
  let outsideEnv: THREE.WebGLRenderTarget | undefined
  let tl: gsap.core.Timeline | undefined
  let s = fresh()
  let shownCard = -1
  let pos!: THREE.CatmullRomCurve3
  let look!: THREE.CatmullRomCurve3
  let flyPos!: THREE.CatmullRomCurve3
  let flyLook!: THREE.CatmullRomCurve3
  let dot!: SVGGElement
  const pointer = new THREE.Vector2()
  const lag = new THREE.Vector2()

  const list = (dl: Element, rows: [string, string][]) => {
    dl.replaceChildren(...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt')
      const dd = document.createElement('dd')
      dt.textContent = k
      dd.textContent = v
      return [dt, dd]
    }))
  }

  function dispose(obj: THREE.Object3D) {
    obj.traverse(o => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      for (const m of mats) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
        m.dispose()
      }
    })
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
    const titled = suite.stops.filter(st => st.title)
    const stop = titled[i]
    const last = !stop
    ui.noteRoom.textContent = last ? suite.gauge.name : stop.room ?? ''
    ui.noteTitle.textContent = last ? suite.outro.title : stop.title ?? ''
    ui.noteBody.textContent = last ? suite.outro.body : stop.body ?? ''
    list(ui.noteFacts, last ? suite.outro.facts : stop.facts ?? [])
    ui.reserve.hidden = !last
    ui.note.classList.toggle('is-outro', last)
  }

  function choreograph() {
    tl?.scrollTrigger?.kill()
    tl?.kill()
    s = fresh()
    shownCard = -1
    track.style.height = `${(length(suite.stops) * UNIT + 1) * 100}vh`

    const n = suite.stops.length
    const steps = legs(suite.stops)
    tl = gsap.timeline({ defaults: { ease: 'none' } })
    tl.to(s, { arrive: 1, duration: beats.arrive })
      .addLabel('fly')
      .to(s, { fly: 1, duration: beats.fly, ease: 'power2.in' }, 'fly')
      .to(s, { arrive: 0, duration: beats.fly * 0.25 }, 'fly')
      .to(s, { flash: 1, duration: beats.flash * 0.35, ease: 'power2.in' }, `fly+=${beats.fly - beats.flash * 0.35}`)
      .set(s, { swap: 1 })
      .to(s, { flash: 0, duration: beats.flash * 0.65, ease: 'power2.out' })
      .to(s, { plate: 1, duration: 0.3 }, '<')
      .addLabel('model')
      .to(s, { spin: 1, duration: beats.model + beats.colour + beats.descend * 0.4 }, 'model')
      .fromTo(clay, { value: 1 }, { value: 0, duration: beats.colour, ease: 'power1.inOut' }, `model+=${beats.model}`)
      .to(s, { plate: 0, duration: 0.4 }, `model+=${beats.model + beats.colour - 0.3}`)
      .to(s, { inside: 1, duration: beats.descend, ease: 'power2.inOut' }, `model+=${beats.model + beats.colour}`)

    let k = 0
    suite.stops.forEach((stop, i) => {
      if (i > 0) tl!.to(s, { t: i / (n - 1), duration: steps[i - 1], ease: stop.title ? 'power1.inOut' : 'none' })
      if (!stop.title) return
      tl!.set(s, { card: k })
        .to(s, { cardIn: 1, duration: 0.25 }, '-=0.15')
        .to(s, { cardIn: 1, duration: beats.read - 0.5 })
        .to(s, { cardIn: 0, duration: 0.25 })
      k++
    })
    tl.addLabel('leave')
      .to(s, { inside: 0, duration: beats.leave, ease: 'power2.inOut' }, 'leave')
      .set(s, { card: k }, `leave+=${beats.leave * 0.6}`)
      .to(s, { cardIn: 1, duration: 0.3 }, `leave+=${beats.leave * 0.6}`)
      .to(s, { spin: 1.6, duration: beats.leave + beats.linger }, 'leave')
      .to(s, { cardIn: 1, duration: beats.linger })

    ScrollTrigger.create({
      trigger: track,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.1,
      animation: tl,
      invalidateOnRefresh: true,
    })
    ScrollTrigger.refresh()
  }

  function load(id: string) {
    suite = suites[id]!
    if (built) {
      inside.remove(built.root)
      dispose(built.root)
    }
    if (outside) dispose(outside.scene)
    outsideEnv?.dispose()

    built = buildSuite(suite)
    inside.add(built.root)
    inside.background = new THREE.Color('#efebe5')
    inside.fog = null

    outside = buildOutside(suite)
    const sky = new THREE.Scene()
    sky.add(outside.scene.getObjectByName('sky')!.clone())
    outsideEnv = pmrem.fromScene(sky, 0, 1, 9000)
    outside.scene.environment = outsideEnv.texture

    const v = (p: [number, number, number]) => new THREE.Vector3(...p)
    pos = new THREE.CatmullRomCurve3(suite.stops.map(st => v(st.pos)), false, 'centripetal')
    look = new THREE.CatmullRomCurve3(suite.stops.map(st => v(st.look)), false, 'centripetal')
    flyPos = new THREE.CatmullRomCurve3(outside.path.pos.map(v), false, 'centripetal')
    flyLook = new THREE.CatmullRomCurve3(outside.path.look.map(v), false, 'centripetal')

    renderer.shadowMap.needsUpdate = true
    fillText()
    drawPlan()
    choreograph()
  }

  const tmpA = new THREE.Vector3()
  const tmpB = new THREE.Vector3()
  const iso = new THREE.Vector3()
  const isoLook = new THREE.Vector3()
  const sway = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1

  function frame(time: number) {
    if (!built || !outside) return
    const sec = time / 1000
    lag.lerp(pointer, 0.05)

    const indoors = s.swap > 0.5
    const scene = indoors ? inside : outside.scene

    if (!indoors) {
      const u = THREE.MathUtils.clamp(s.fly, 0, 1)
      flyPos.getPoint(u, camera.position)
      flyLook.getPoint(u, tmpA)
      tmpA.x += lag.x * 14 * (1 - u)
      tmpA.y += lag.y * 8 * (1 - u)
      camera.fov = 38 - u * 6
      camera.lookAt(tmpA)
      outside.tick(sec)
    } else {
      const k = s.inside * s.inside * (3 - 2 * s.inside)
      const R = built.span * 1.18
      const a = suite.iso - 0.3 + s.spin * 0.55 + Math.sin(sec * 0.2) * 0.01 * sway
      iso.set(built.centre.x + Math.sin(a) * R, R * 0.92, built.centre.z + Math.cos(a) * R)
      isoLook.copy(built.centre).setY(-0.4)

      pos.getPoint(s.t, tmpA)
      look.getPoint(s.t, tmpB)
      tmpA.y += Math.sin(sec * 1.3) * 0.008 * sway
      tmpB.x += lag.x * 0.35
      tmpB.y += lag.y * 0.2
      camera.position.lerpVectors(iso, tmpA, k)
      tmpB.lerpVectors(isoLook, tmpB, k)
      camera.fov = 30 + k * 32
      camera.lookAt(tmpB)

      const lid = THREE.MathUtils.smoothstep(k, 0.72, 0.97)
      for (const m of built.ceilings) {
        m.opacity = lid
        m.visible = lid > 0.01
        m.depthWrite = lid > 0.99
      }
      const view = (1 - clay.value) * THREE.MathUtils.smoothstep(k, 0.25, 0.8)
      ;(built.backdrop.material as THREE.MeshBasicMaterial).opacity = view
      for (const tex of built.water) tex.offset.set(sec * 0.012, sec * 0.007)
      for (const f of built.flames) f.scale.y = 0.8 + Math.sin(sec * 9 + f.position.x * 20) * 0.2
      inside.environmentIntensity = 0.35 + (1 - clay.value) * 0.35

      dot.setAttribute('transform', `translate(${camera.position.x} ${camera.position.z}) rotate(${THREE.MathUtils.radToDeg(Math.atan2(tmpB.z - camera.position.z, tmpB.x - camera.position.x))})`)
      ui.plan.style.opacity = String(THREE.MathUtils.smoothstep(k, 0.6, 0.95))
      ui.steps.querySelectorAll('li').forEach((li, i) => {
        li.classList.toggle('is-on', k > 0.5 && i === s.card)
      })
    }
    camera.updateProjectionMatrix()

    if (s.card !== shownCard) showCard(s.card)
    ui.note.style.opacity = String(s.cardIn)
    ui.note.style.transform = `translateY(${(1 - s.cardIn) * 14}px)`
    ui.note.style.visibility = s.cardIn > 0.01 ? 'visible' : 'hidden'

    ui.arrival.style.opacity = String(s.arrive)
    ui.arrival.style.transform = `translateY(${(1 - s.arrive) * -30}px)`
    ui.figures.style.opacity = String(s.arrive)
    const g = indoors ? 0 : THREE.MathUtils.clamp(1 - (s.fly - 0.8) * 5, 0, 1)
    ui.gauge.style.opacity = String(g)
    ui.gauge.style.visibility = g > 0.01 ? 'visible' : 'hidden'
    const value = Math.round(suite.gauge.from + (suite.gauge.to - suite.gauge.from) * Math.min(1, s.fly * 1.15) ** 1.6)
    // a floor reads as "07"; a height in metres does not
    ui.gaugeValue.textContent = suite.gauge.unit ? String(value) : String(value).padStart(2, '0')
    ui.plate.style.opacity = String(s.plate)
    flash.style.opacity = String(s.flash)

    renderer.shadowMap.autoUpdate = indoors
    renderer.shadowMap.enabled = indoors
    camera.far = indoors ? 300 : 9000
    camera.updateProjectionMatrix()
    if (indoors) composer.render()
    else renderer.render(scene, camera)
  }

  function resize() {
    const w = stage.clientWidth
    const h = stage.clientHeight
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(stage)
  resize()

  addEventListener('pointermove', e => {
    pointer.set(e.clientX / innerWidth - 0.5, 0.5 - e.clientY / innerHeight)
  }, { passive: true })

  new IntersectionObserver(([entry]) => {
    renderer.setAnimationLoop(entry?.isIntersecting ? frame : null)
  }, { rootMargin: '20% 0px' }).observe(stage)

  const tabs = section.querySelectorAll<HTMLButtonElement>('.tour__picker [data-hotel]')
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      for (const t of tabs) t.setAttribute('aria-selected', String(t === tab))
      load(tab.dataset.hotel!)
      scrollTo({ top: track.getBoundingClientRect().top + scrollY, behavior: 'smooth' })
    })
  })

  load('tokyo')
}
