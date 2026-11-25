import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Piece } from './plan'

export type Kit = (role: string) => THREE.Material

type Make = (p: Piece, m: Kit, g: THREE.Group) => void

function block(g: THREE.Group, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, r = 0.015) {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, y, z)
  mesh.castShadow = mesh.receiveShadow = true
  g.add(mesh)
  return mesh
}

function drum(g: THREE.Group, mat: THREE.Material, r: number, h: number, x: number, y: number, z: number, r2 = r, seg = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, seg), mat)
  mesh.position.set(x, y, z)
  mesh.castShadow = mesh.receiveShadow = true
  g.add(mesh)
  return mesh
}

function lamp(g: THREE.Group, m: Kit, x: number, y: number, z: number, lit?: boolean) {
  drum(g, m('ceramic'), 0.07, 0.3, x, y + 0.15, z, 0.09)
  const shade = drum(g, m('glow'), 0.15, 0.24, x, y + 0.42, z, 0.17)
  shade.castShadow = false
  if (lit) {
    const bulb = new THREE.PointLight('#ffc98a', 2.2, 5, 1.6)
    bulb.position.set(x, y + 0.42, z)
    g.add(bulb)
  }
}

const leafShape = (() => {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(0.09, 0.15, 0.08, 0.45, 0, 0.62)
  s.bezierCurveTo(-0.08, 0.45, -0.09, 0.15, 0, 0)
  return new THREE.ShapeGeometry(s, 6)
})()

function chair(m: Kit, g: THREE.Group) {
  block(g, m('fabric'), 0.48, 0.07, 0.46, 0, 0.46, 0, 0.03)
  block(g, m('wood'), 0.46, 0.4, 0.04, 0, 0.72, 0.21, 0.015).rotation.x = 0.08
  for (const [x, z] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]] as const) {
    block(g, m('wood'), 0.035, 0.44, 0.035, x, 0.22, z, 0)
  }
}

const make: Record<string, Make> = {
  chair(_p, m, g) {
    chair(m, g)
  },

  sofa(p, m, g) {
    const w = p.w ?? 2.4
    const d = p.d ?? 0.95
    block(g, m('fabric'), w, 0.36, d, 0, 0.2, 0, 0.06)
    block(g, m('fabric'), w, 0.42, 0.24, 0, 0.58, -d / 2 + 0.12, 0.08)
    for (const s of [-1, 1]) block(g, m('fabric'), 0.22, 0.5, d, s * (w / 2 - 0.11), 0.42, 0, 0.08)
    const seats = Math.max(1, Math.round((w - 0.44) / 0.9))
    const sw = (w - 0.44) / seats
    for (let i = 0; i < seats; i++) {
      block(g, m('fabric'), sw - 0.03, 0.14, d - 0.3, -w / 2 + 0.22 + sw * (i + 0.5), 0.44, 0.08, 0.06)
    }
    block(g, m('linen'), 0.42, 0.36, 0.13, -w / 2 + 0.55, 0.62, -d / 2 + 0.32, 0.07).rotation.z = 0.15
  },

  armchair(p, m, g) {
    const w = p.w ?? 0.85
    block(g, m('dark'), w, 0.08, 0.82, 0, 0.16, 0, 0.02)
    block(g, m('fabric'), w - 0.1, 0.16, 0.7, 0, 0.3, 0.03, 0.06)
    block(g, m('fabric'), w - 0.1, 0.5, 0.14, 0, 0.6, -0.34, 0.06).rotation.x = -0.12
    for (const s of [-1, 1]) block(g, m('dark'), 0.06, 0.42, 0.8, s * (w / 2 - 0.03), 0.38, 0, 0.02)
  },

  lowTable(p, m, g) {
    const w = p.w ?? 1.3
    const d = p.d ?? 0.8
    block(g, m('stone'), w, 0.07, d, 0, 0.36, 0, 0.02)
    block(g, m('dark'), w * 0.7, 0.32, d * 0.6, 0, 0.16, 0, 0.01)
    drum(g, m('ceramic'), 0.12, 0.05, w * 0.22, 0.42, 0, 0.08)
    block(g, m('linen'), 0.32, 0.05, 0.24, -w * 0.2, 0.42, 0.05, 0.005)
  },

  sideTable(_p, m, g) {
    drum(g, m('stone'), 0.26, 0.04, 0, 0.52, 0)
    drum(g, m('dark'), 0.05, 0.5, 0, 0.25, 0)
    drum(g, m('dark'), 0.18, 0.03, 0, 0.015, 0)
  },

  dining(p, m, g) {
    const w = p.w ?? 2.6
    const d = p.d ?? 1
    block(g, m('wood'), w, 0.06, d, 0, 0.74, 0, 0.02)
    for (const s of [-1, 1]) block(g, m('wood'), 0.08, 0.71, d * 0.7, s * (w / 2 - 0.3), 0.355, 0, 0.01)
    const n = Math.max(2, Math.floor(w / 0.75))
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5)
      for (const s of [-1, 1]) {
        const c = new THREE.Group()
        chair(m, c)
        c.position.set(x, 0, s * (d / 2 + 0.22))
        c.rotation.y = s > 0 ? 0 : Math.PI
        g.add(c)
      }
    }
    drum(g, m('ceramic'), 0.1, 0.3, 0.15, 0.92, 0, 0.07)
    for (let i = 0; i < 5; i++) {
      const stem = drum(g, m('dark'), 0.004, 0.6, 0.15 + Math.sin(i * 2.4) * 0.08, 1.3, Math.cos(i * 2.4) * 0.08, 0.004, 4)
      stem.rotation.z = Math.sin(i * 1.7) * 0.35
    }
  },

  bed(p, m, g) {
    const w = p.w ?? 2
    const l = p.d ?? 2.15
    block(g, m('dark'), w + 0.1, 0.26, l, 0, 0.16, 0, 0.02)
    block(g, m('linen'), w - 0.04, 0.26, l - 0.1, 0, 0.4, 0.02, 0.07)
    block(g, m('fabric'), w + 0.04, 0.08, l * 0.36, 0, 0.55, l * 0.3, 0.04)
    block(g, m('linen'), w - 0.1, 0.05, l * 0.42, 0, 0.53, 0.02, 0.03)
    for (const s of [-1, 1]) {
      block(g, m('linen'), w * 0.42, 0.18, 0.4, s * w * 0.23, 0.62, -l / 2 + 0.32, 0.08).rotation.x = -0.35
      block(g, m('linen'), w * 0.36, 0.14, 0.32, s * w * 0.2, 0.62, -l / 2 + 0.6, 0.07).rotation.x = -0.2
    }
    block(g, m('wood'), w + 0.9, 1.15, 0.08, 0, 0.575, -l / 2 - 0.04, 0.01)
    for (const s of [-1, 1]) {
      block(g, m('wood'), 0.5, 0.45, 0.42, s * (w / 2 + 0.42), 0.225, -l / 2 + 0.25, 0.015)
      lamp(g, m, s * (w / 2 + 0.42), 0.45, -l / 2 + 0.25, p.light && s > 0)
    }
  },

  desk(p, m, g) {
    const w = p.w ?? 1.4
    block(g, m('wood'), w, 0.04, 0.6, 0, 0.74, 0, 0.01)
    for (const s of [-1, 1]) block(g, m('wood'), 0.04, 0.72, 0.56, s * (w / 2 - 0.04), 0.36, 0, 0)
    const c = new THREE.Group()
    chair(m, c)
    c.position.set(0.1, 0, 0.55)
    c.rotation.y = 0.2
    g.add(c)
    lamp(g, m, -w / 2 + 0.2, 0.76, -0.1, p.light)
    block(g, m('linen'), 0.3, 0.03, 0.22, 0.15, 0.775, 0, 0.005)
  },

  tub(p, m, g) {
    const w = p.w ?? 1.7
    const d = p.d ?? 0.85
    const deep = p.variant === 'ofuro'
    const shell = deep ? m('basalt') : m('ceramic')
    const h = deep ? 0.68 : 0.56
    block(g, shell, w, h, 0.08, 0, h / 2, -d / 2 + 0.04, 0.02)
    block(g, shell, w, h, 0.08, 0, h / 2, d / 2 - 0.04, 0.02)
    block(g, shell, 0.08, h, d, -w / 2 + 0.04, h / 2, 0, 0.02)
    block(g, shell, 0.08, h, d, w / 2 - 0.04, h / 2, 0, 0.02)
    block(g, shell, w, 0.1, d, 0, 0.05, 0, 0.02)
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.16, d - 0.16), m('water'))
    water.rotation.x = -Math.PI / 2
    water.position.y = h - 0.1
    g.add(water)
    drum(g, m('metal'), 0.015, 0.9, w / 2 + 0.18, 0.45, 0)
    block(g, m('linen'), 0.4, 0.06, 0.3, -w / 2 - 0.35, 0.03, 0.2, 0.02)
  },

  vanity(p, m, g) {
    const w = p.w ?? 2
    block(g, m('wood'), w, 0.45, 0.52, 0, 0.62, 0, 0.01)
    block(g, m('stone'), w + 0.04, 0.05, 0.56, 0, 0.87, 0, 0.01)
    for (const s of w > 1.3 ? [-1, 1] : [0]) {
      drum(g, m('ceramic'), 0.2, 0.12, s * w * 0.25, 0.95, 0.02, 0.16)
      drum(g, m('metal'), 0.012, 0.22, s * w * 0.25, 1.0, -0.2)
    }
    const mirror = block(g, m('mirror'), w - 0.1, 0.95, 0.02, 0, 1.6, -0.27, 0)
    mirror.castShadow = false
    block(g, m('glow'), w - 0.1, 0.02, 0.04, 0, 1.1, -0.25, 0)
  },

  plant(p, m, g) {
    const h = p.h ?? 1.4
    drum(g, m('ceramic'), 0.2, 0.42, 0, 0.21, 0, 0.15)
    const leaves = 26
    for (let i = 0; i < leaves; i++) {
      const leaf = new THREE.Mesh(leafShape, m('leaf'))
      const a = i * 2.39996
      const lift = 0.35 + (i / leaves) * (h - 0.6)
      leaf.position.set(Math.cos(a) * 0.05, lift, Math.sin(a) * 0.05)
      leaf.rotation.order = 'YXZ'
      leaf.rotation.y = -a
      leaf.rotation.x = -0.35 - (1 - i / leaves) * 0.9
      leaf.scale.setScalar(0.7 + (i / leaves) * 0.9)
      leaf.castShadow = true
      g.add(leaf)
    }
    drum(g, m('dark'), 0.012, h * 0.7, 0, 0.35 + h * 0.35, 0, 0.012, 5)
  },

  ikebana(_p, m, g) {
    drum(g, m('basalt'), 0.11, 0.26, 0, 0.13, 0, 0.13)
    for (let i = 0; i < 4; i++) {
      const branch = drum(g, m('dark'), 0.006, 0.8 - i * 0.12, 0, 0.6, 0, 0.004, 4)
      branch.rotation.z = 0.25 + i * 0.22
      branch.rotation.y = i * 1.3
      branch.position.x = Math.sin(i) * 0.1
    }
    for (let i = 0; i < 9; i++) {
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), m('blossom'))
      bloom.position.set(0.12 + Math.sin(i * 1.9) * 0.18, 0.75 + Math.cos(i * 1.3) * 0.15, Math.sin(i * 2.7) * 0.12)
      g.add(bloom)
    }
  },

  art(p, m, g) {
    const w = p.w ?? 1.2
    const h = p.h ?? 1.5
    block(g, m('dark'), w + 0.06, h + 0.06, 0.03, 0, 0, 0, 0.005)
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m('art'))
    sheet.position.z = 0.017
    g.add(sheet)
  },

  rug(p, m, g) {
    block(g, m('rug'), p.w ?? 2.6, 0.015, p.d ?? 1.8, 0, 0.008, 0, 0.005).castShadow = false
  },

  wardrobe(p, m, g) {
    const w = p.w ?? 2
    block(g, m('wood'), w, 2.4, 0.6, 0, 1.2, 0, 0.005)
    for (let x = -w / 2 + w / 4; x < w / 2; x += w / 4) block(g, m('dark'), 0.01, 2.3, 0.01, x, 1.2, 0.3, 0)
  },

  bench(p, m, g) {
    const w = p.w ?? 1.6
    block(g, m('wood'), w, 0.06, 0.4, 0, 0.44, 0, 0.01)
    block(g, m('stone'), w * 0.85, 0.41, 0.3, 0, 0.205, 0, 0.01)
  },

  pendant(p, m, g) {
    const y = p.h ?? 2.1
    drum(g, m('dark'), 0.004, 3 - y, 0, (3 + y) / 2, 0, 0.004, 4)
    const shade = drum(g, m('glow'), 0.25, 0.08, 0, y, 0, 0.18)
    shade.castShadow = false
    if (p.light) {
      const bulb = new THREE.PointLight('#ffd09a', 3, 6, 1.5)
      bulb.position.set(0, y - 0.1, 0)
      g.add(bulb)
    }
  },

  daybed(p, m, g) {
    const w = p.w ?? 2.2
    block(g, m('stone'), w, 0.34, 1.2, 0, 0.17, 0, 0.03)
    block(g, m('linen'), w - 0.1, 0.14, 1.1, 0, 0.41, 0, 0.06)
    for (const s of [-0.3, 0.3]) block(g, m('fabric'), 0.5, 0.3, 0.14, s * w, 0.62, -0.45, 0.06).rotation.x = -0.25
  },

  lounger(_p, m, g) {
    block(g, m('wood'), 0.7, 0.18, 1.9, 0, 0.18, 0, 0.02)
    block(g, m('linen'), 0.66, 0.08, 1.3, 0, 0.31, 0.25, 0.04)
    block(g, m('linen'), 0.66, 0.08, 0.6, 0, 0.5, -0.62, 0.04).rotation.x = 0.7
  },

  firepit(p, m, g) {
    drum(g, m('stone'), 0.65, 0.35, 0, 0.175, 0, 0.7, 24)
    drum(g, m('basalt'), 0.5, 0.02, 0, 0.36, 0, 0.5, 24)
    for (let i = 0; i < 7; i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35 + (i % 3) * 0.1, 6), m('flame'))
      flame.position.set(Math.cos(i) * 0.18, 0.52, Math.sin(i * 1.7) * 0.18)
      flame.name = 'flame'
      g.add(flame)
    }
    if (p.light !== false) {
      const fire = new THREE.PointLight('#ff9a4a', 6, 8, 1.4)
      fire.position.y = 0.8
      fire.name = 'fire'
      g.add(fire)
    }
  },

  pool(p, m, g) {
    const w = p.w ?? 6
    const d = p.d ?? 3
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m('water'))
    water.rotation.x = -Math.PI / 2
    water.position.y = 0.02
    water.receiveShadow = true
    g.add(water)
    const lip = 0.3
    block(g, m('stone'), w + lip * 2, 0.06, lip, 0, 0.03, -d / 2 - lip / 2, 0.01)
    block(g, m('stone'), w + lip * 2, 0.06, lip, 0, 0.03, d / 2 + lip / 2, 0.01)
    block(g, m('stone'), lip, 0.06, d, -w / 2 - lip / 2, 0.03, 0, 0.01)
    block(g, m('stone'), lip, 0.06, d, w / 2 + lip / 2, 0.03, 0, 0.01)
  },

  rock(p, m, g) {
    const s = p.w ?? 1.5
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), m('sandstone'))
    const pos = r.geometry.attributes.position!
    for (let i = 0; i < pos.count; i++) {
      const k = 1 + Math.sin(i * 12.9898) * 0.12
      pos.setXYZ(i, pos.getX(i) * k, Math.max(pos.getY(i) * 0.7 * k, -0.2), pos.getZ(i) * k * 0.85)
    }
    r.geometry.computeVertexNormals()
    r.position.y = s * 0.35
    r.castShadow = r.receiveShadow = true
    g.add(r)
  },

  palm(p, m, g) {
    const h = p.h ?? 6
    const lean = 0.18
    const segs = 9
    let x = 0
    let y = 0
    for (let i = 0; i < segs; i++) {
      const piece = drum(g, m('bark'), 0.13 - i * 0.006, h / segs + 0.05, x, y + h / segs / 2, 0, 0.14 - i * 0.006, 8)
      piece.rotation.z = -lean * (i / segs)
      x += Math.sin(lean * (i / segs)) * (h / segs)
      y += h / segs
    }
    for (let i = 0; i < 11; i++) {
      const frond = new THREE.Group()
      for (let k = 0; k < 14; k++) {
        const leaf = new THREE.Mesh(leafShape, m('leaf'))
        leaf.scale.set(0.9, 1.6, 1)
        leaf.position.set(0, -k * 0.02 * k * 0.3, k * 0.17)
        leaf.rotation.set(Math.PI / 2 - 0.3, k % 2 ? 1.3 : -1.3, 0)
        frond.add(leaf)
      }
      frond.position.set(x, y, 0)
      frond.rotation.y = (i / 11) * Math.PI * 2
      frond.rotation.x = 0.35 + (i % 3) * 0.2
      g.add(frond)
    }
  },

  door(p, m, g) {
    const w = p.w ?? 1
    block(g, m('dark'), w, 2.38, 0.05, 0, 1.19, 0, 0.005)
    drum(g, m('metal'), 0.012, 0.32, w / 2 - 0.12, 1.05, 0.04)
  },

  bowl(_p, m, g) {
    drum(g, m('ceramic'), 0.16, 0.08, 0, 0.04, 0, 0.09)
  },

  shelf(p, m, g) {
    const w = p.w ?? 1.6
    for (const y of [0.4, 0.9, 1.4, 1.9]) block(g, m('wood'), w, 0.04, 0.38, 0, y, 0, 0.005)
    for (const s of [-1, 1]) block(g, m('wood'), 0.04, 2.0, 0.38, s * w / 2, 1.0, 0, 0)
    for (let i = 0; i < 6; i++) {
      block(g, m(i % 2 ? 'linen' : 'dark'), 0.05 + (i % 3) * 0.02, 0.26, 0.24, -w / 2 + 0.2 + i * 0.07, 0.55, 0, 0.005)
    }
    drum(g, m('ceramic'), 0.1, 0.24, w * 0.25, 1.04, 0, 0.07)
    drum(g, m('basalt'), 0.13, 0.12, -w * 0.2, 1.48, 0, 0.13)
  },
}

export const pieceKinds = Object.keys(make)

export function furnish(p: Piece, kit: Kit) {
  const g = new THREE.Group()
  const build = make[p.kind]
  if (!build) throw new Error(`no furniture called ${p.kind}`)
  build(p, kit, g)
  g.position.set(p.at[0], p.y ?? 0, p.at[1])
  g.rotation.y = THREE.MathUtils.degToRad(p.rot ?? 0)
  return g
}
