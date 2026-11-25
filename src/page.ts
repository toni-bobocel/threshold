import { gsap } from 'gsap'
import { Draggable } from 'gsap/Draggable'
import { InertiaPlugin } from 'gsap/InertiaPlugin'

gsap.registerPlugin(Draggable, InertiaPlugin)

export function masthead() {
  const head = document.querySelector<HTMLElement>('.masthead')!
  const tuck = () => head.classList.toggle('is-tucked', scrollY > 40)
  addEventListener('scroll', tuck, { passive: true })
  tuck()
}

// Stands in for the hero film: a drift slow enough to read as footage, not as an effect.
export function film() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  gsap.fromTo('.intro__film img', { scale: 1.02, xPercent: -0.6 }, { scale: 1.09, xPercent: 0.6, duration: 26, ease: 'sine.inOut', repeat: -1, yoyo: true })
}

export function drawer() {
  const nav = document.querySelector<HTMLElement>('#drawer')!
  const burger = document.querySelector<HTMLButtonElement>('.burger')!
  const panel = nav.querySelector('.drawer__panel')!
  const featured = nav.querySelector('.drawer__featured')!
  const veil = nav.querySelector('.drawer__veil')!

  const open = () => {
    nav.hidden = false
    burger.setAttribute('aria-expanded', 'true')
    document.body.style.overflow = 'hidden'
    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .fromTo(veil, { opacity: 0 }, { opacity: 1, duration: 0.5 })
      .fromTo([panel, featured], { xPercent: -100 }, { xPercent: 0, duration: 0.7, stagger: 0.08 }, 0)
      .fromTo(panel.querySelectorAll('li'), { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.025 }, 0.25)
  }
  const close = () => {
    burger.setAttribute('aria-expanded', 'false')
    gsap.timeline({ defaults: { ease: 'power2.in' }, onComplete: () => {
      nav.hidden = true
      document.body.style.overflow = ''
    } })
      .to([featured, panel], { xPercent: -100, duration: 0.45, stagger: 0.05 })
      .to(veil, { opacity: 0, duration: 0.4 }, 0.1)
  }

  burger.addEventListener('click', open)
  nav.addEventListener('click', e => {
    const t = e.target as HTMLElement
    if (t.closest('.drawer__close, [data-close], a')) close()
  })
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && !nav.hidden) close()
  })
}

export function rail() {
  const box = document.querySelector<HTMLElement>('.rail')!
  const track = box.querySelector<HTMLElement>('.rail__track')!
  const thumb = box.querySelector<HTMLElement>('.rail__bar i')!
  const cards = [...track.children] as HTMLElement[]

  const shade = () => {
    const edge = box.getBoundingClientRect().right
    for (const c of cards) c.classList.toggle('is-out', c.getBoundingClientRect().right > edge + 4)
    const min = Math.min(0, box.clientWidth - track.scrollWidth)
    const p = min ? (gsap.getProperty(track, 'x') as number) / min : 0
    gsap.set(thumb, { left: `${p * 86}%` })
  }

  const [drag] = Draggable.create(track, {
    type: 'x',
    inertia: true,
    edgeResistance: 0.85,
    bounds: box,
    zIndexBoost: false,
    onPress() { track.classList.add('is-dragging') },
    onRelease() { track.classList.remove('is-dragging') },
    onDrag: shade,
    onThrowUpdate: shade,
  })

  // Links inside the cards must still work after a tap that did not move.
  track.addEventListener('click', e => {
    if (drag && Math.abs(drag.x - drag.startX) > 4) e.preventDefault()
  }, true)

  addEventListener('resize', () => {
    drag?.applyBounds(box)
    shade()
  })
  shade()
}
