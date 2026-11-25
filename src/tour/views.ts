import * as THREE from 'three'
import type { Suite } from './plan'

// What you see through the glass, painted once per suite onto the inside of
// a cylinder. Cheap, and from inside a room nobody can tell it is flat.

const W = 4096
const H = 1024
// the cylinder runs from 60 m below the floor to 40 m above it: eye level lands here
const HORIZON = H * 0.384

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

function sky(g: CanvasRenderingContext2D, suite: Suite) {
  const { top, horizon, glow } = suite.sky
  const grd = g.createLinearGradient(0, 0, 0, HORIZON)
  grd.addColorStop(0, top)
  grd.addColorStop(0.55, glow)
  grd.addColorStop(1, horizon)
  g.fillStyle = grd
  g.fillRect(0, 0, W, H)

  const [sx, , sz] = suite.sun
  const u = (((Math.atan2(sx, sz) / (Math.PI * 2)) % 1) + 1) % 1
  for (const off of [-1, 0, 1]) {
    const x = (u + off) * W
    const halo = g.createRadialGradient(x, HORIZON - 40, 0, x, HORIZON - 40, 900)
    halo.addColorStop(0, 'rgba(255,236,205,0.85)')
    halo.addColorStop(0.25, 'rgba(255,200,160,0.35)')
    halo.addColorStop(1, 'rgba(255,190,160,0)')
    g.fillStyle = halo
    g.fillRect(x - 900, 0, 1800, H)
  }

  const r = rng(11)
  g.globalAlpha = 0.5
  for (let i = 0; i < 60; i++) {
    const y = HORIZON * (0.12 + r() * 0.6)
    const x = r() * W
    const w = 200 + r() * 700
    const cl = g.createLinearGradient(0, y - 18, 0, y + 18)
    cl.addColorStop(0, 'rgba(255,255,255,0)')
    cl.addColorStop(0.5, r() > 0.5 ? 'rgba(255,214,200,0.55)' : 'rgba(205,190,215,0.5)')
    cl.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = cl
    g.beginPath()
    g.ellipse(x, y, w, 8 + r() * 16, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
}

function haze(g: CanvasRenderingContext2D, color: string, from: number, to: number) {
  const grd = g.createLinearGradient(0, from, 0, to)
  grd.addColorStop(0, color)
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, from, W, to - from)
}

function city(g: CanvasRenderingContext2D, suite: Suite) {
  const r = rng(5)
  // Fuji, faint, to the west
  g.fillStyle = 'rgba(150,140,170,0.55)'
  g.beginPath()
  g.moveTo(2500, HORIZON)
  g.lineTo(2700, HORIZON - 110)
  g.lineTo(2760, HORIZON - 118)
  g.lineTo(2980, HORIZON)
  g.fill()
  g.fillStyle = 'rgba(250,245,250,0.7)'
  g.beginPath()
  g.moveTo(2665, HORIZON - 90)
  g.lineTo(2700, HORIZON - 110)
  g.lineTo(2760, HORIZON - 118)
  g.lineTo(2800, HORIZON - 92)
  g.fill()

  // Rows of roofs, far to near. Near rows are taller and wider, the way a
  // city looks from forty floors up.
  for (let y = HORIZON + 2; y < H + 40; ) {
    const d = (y - HORIZON) / (H - HORIZON)
    const row = 3 + d * d * 46
    const tone = 128 - d * 55
    for (let x = -20; x < W; ) {
      const w = (6 + d * 110) * (0.5 + r())
      const front = (1 + d * 26) * (0.4 + r() * 1.3)
      const lit = r() > 0.35
      g.fillStyle = `rgb(${tone + 30},${tone + 24},${tone + 34})`
      g.fillRect(x, y - front - row * 0.6, w, row * 0.6)
      g.fillStyle = `rgb(${tone - 6},${tone - 10},${tone + 4})`
      g.fillRect(x, y - front, w, front + 2)
      if (lit && d > 0.12) {
        g.fillStyle = 'rgba(255,210,150,0.7)'
        for (let k = 0; k < (w * front) / 90; k++) g.fillRect(x + r() * w, y - front + r() * front, 1 + d * 2, 1 + d)
      }
      x += w + r() * (1 + d * 8)
    }
    y += row
  }
  haze(g, suite.sky.haze, HORIZON - 30, HORIZON + 140)
  haze(g, suite.sky.haze, HORIZON - 10, HORIZON + 50)
  // the palace gardens: a dark green field with the moat around it
  g.fillStyle = 'rgba(52,72,55,0.9)'
  g.beginPath()
  g.ellipse(2540, HORIZON + 230, 620, 110, 0, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = 'rgba(160,175,190,0.7)'
  g.lineWidth = 6
  g.stroke()
}

function desert(g: CanvasRenderingContext2D, suite: Suite) {
  const r = rng(9)
  const ranges = [
    { y: HORIZON - 4, h: 90, c: '#c99a86' },
    { y: HORIZON + 8, h: 130, c: '#b8775a' },
    { y: HORIZON + 40, h: 170, c: '#a65f3e' },
  ]
  for (const band of ranges) {
    g.fillStyle = band.c
    g.beginPath()
    g.moveTo(0, H)
    let x = 0
    while (x < W) {
      const flat = 120 + r() * 520
      const top = band.y - band.h * (0.3 + r() * 0.7)
      g.lineTo(x + 30, band.y)
      g.lineTo(x + 70, top)
      g.lineTo(x + 70 + flat, top + (r() - 0.5) * 6)
      g.lineTo(x + 110 + flat, band.y)
      x += 110 + flat + r() * 260
    }
    g.lineTo(W, H)
    g.fill()
    haze(g, suite.sky.haze, band.y - band.h, band.y + 20)
  }
  const floor = g.createLinearGradient(0, HORIZON + 40, 0, H)
  floor.addColorStop(0, '#c48c68')
  floor.addColorStop(1, '#d9b08a')
  g.fillStyle = floor
  g.fillRect(0, HORIZON + 60, W, H)
  for (let i = 0; i < 1800; i++) {
    const y = HORIZON + 60 + r() ** 0.7 * (H - HORIZON - 60)
    g.fillStyle = `rgba(${r() > 0.5 ? '120,125,95' : '150,110,80'},0.5)`
    g.beginPath()
    g.ellipse(r() * W, y, 2 + (y - HORIZON) * 0.03, 1 + (y - HORIZON) * 0.012, 0, 0, Math.PI * 2)
    g.fill()
  }
}

function sea(g: CanvasRenderingContext2D, suite: Suite) {
  const r = rng(3)
  for (const [x, w, h] of [[600, 700, 50], [1900, 420, 34], [3300, 900, 70]] as const) {
    g.fillStyle = 'rgba(110,120,135,0.6)'
    g.beginPath()
    g.ellipse(x, HORIZON, w, h, 0, Math.PI, 0)
    g.fill()
  }
  const water = g.createLinearGradient(0, HORIZON, 0, H)
  water.addColorStop(0, '#b9b4c2')
  water.addColorStop(0.3, '#6f94a0')
  water.addColorStop(1, '#2f6470')
  g.fillStyle = water
  g.fillRect(0, HORIZON, W, H - HORIZON)
  for (let i = 0; i < 2200; i++) {
    const y = HORIZON + r() ** 1.6 * (H - HORIZON)
    g.fillStyle = `rgba(255,236,215,${0.15 + r() * 0.3})`
    g.fillRect(r() * W, y, 6 + (y - HORIZON) * 0.15, 1)
  }
  haze(g, suite.sky.haze, HORIZON - 30, HORIZON + 30)
  // the headland the pavilions sit on, at the bottom of the frame
  g.fillStyle = '#2f4430'
  g.beginPath()
  g.moveTo(0, H)
  for (let x = 0; x <= W; x += 40) g.lineTo(x, H - 70 - Math.sin(x * 0.004) * 40 - r() * 30)
  g.lineTo(W, H)
  g.fill()
}

export function panorama(suite: Suite) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  sky(g, suite)
  ;({ city, desert, sea })[suite.view](g, suite)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}
