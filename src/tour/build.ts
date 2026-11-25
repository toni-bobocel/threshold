import * as THREE from 'three'
import { furnish } from './furniture'
import { claylike, finish, glass, paints, ripples, texture } from './materials'
import { bounds, type Recipe, runs, type Suite, type Wall } from './plan'
import { panorama } from './views'

const THICK = 0.16

// Roles that look the same in every suite; a suite may still override them.
const common: Record<string, Recipe> = {
  metal: { base: '#9a948b', rough: 0.35, metal: 1 },
  mirror: { base: '#a9aeb0', rough: 0.08, metal: 1 },
  glow: { base: '#f6e7cf', rough: 1, glow: '#ffcf8f' },
  flame: { base: '#ff9b42', rough: 1, glow: '#ff7a26' },
  leaf: { base: '#3c5a35', rough: 0.6 },
  blossom: { base: '#f2d6d2', rough: 0.8 },
  bark: { paint: 'speckle', base: '#6f604f', rough: 1 },
  ceramic: { base: '#ece6dc', rough: 0.35 },
  mullion: { base: '#2b2926', rough: 0.5, metal: 0.4 },
  paper: { paint: 'washi', base: '#f1eadc', rough: 1, glow: '#3b2f22' },
}

// Box mapping in world space: every face gets texels sized in metres, so a
// long wall and a short one show the same grain without per-mesh repeats.
function boxMap(geo: THREE.BufferGeometry, tile: number) {
  const pos = geo.attributes.position!
  const nor = geo.attributes.normal!
  const uv = geo.attributes.uv!
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i))
    const ny = Math.abs(nor.getY(i))
    const nz = Math.abs(nor.getZ(i))
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (ny >= nx && ny >= nz) uv.setXY(i, x / tile, z / tile)
    else if (nx >= nz) uv.setXY(i, z / tile, y / tile)
    else uv.setXY(i, x / tile, y / tile)
  }
  uv.needsUpdate = true
}

export type Built = {
  root: THREE.Group
  ceilings: THREE.Material[]
  backdrop: THREE.Mesh
  water: THREE.Texture[]
  flames: THREE.Object3D[]
  sun: THREE.DirectionalLight
  centre: THREE.Vector3
  span: number
}

export function buildSuite(suite: Suite): Built {
  const root = new THREE.Group()
  const mats = new Map<string, THREE.MeshStandardMaterial>()
  const tiles = new Map<string, number>()
  const recipes = { ...common, ...suite.finishes }
  const water: THREE.Texture[] = []

  const kit = (role: string) => {
    const hit = mats.get(role)
    if (hit) return hit
    if (role === 'water') {
      const normal = ripples()
      water.push(normal)
      const m = claylike(new THREE.MeshPhysicalMaterial({
        color: recipes.water?.base ?? '#5f8f92',
        roughness: 0.06,
        metalness: 0,
        normalMap: normal,
        normalScale: new THREE.Vector2(0.35, 0.35),
        envMapIntensity: 1.5,
        clearcoat: 1,
      }), 0.9)
      mats.set(role, m)
      return m
    }
    if (role === 'art') {
      const m = finish({ map: texture(`art-${suite.id}`, paints.ink('#efe8dc', '#262320', recipes.accent?.base ?? '#8a5a3c'), 1, 1024), rough: 0.9 })
      mats.set(role, m)
      return m
    }
    const r = recipes[role] ?? recipes.wood!
    const map = r.paint ? texture(`${suite.id}-${role}`, paints[r.paint](r.base, r.arg)) : undefined
    const m = finish({ color: map ? '#ffffff' : r.base, map, rough: r.rough, metal: r.metal, glow: r.glow })
    if (role === 'paper') {
      m.side = THREE.DoubleSide
      m.emissiveMap = map ?? null
    }
    if (role === 'leaf' || role === 'art') m.side = THREE.DoubleSide
    mats.set(role, m)
    tiles.set(role, r.tile ?? 1.6)
    return m
  }

  const slab = (role: string, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0) => {
    const geo = new THREE.BoxGeometry(w, h, d)
    geo.rotateY(rotY)
    geo.translate(x, y, z)
    const m = kit(role)
    boxMap(geo, tiles.get(role) ?? 1.6)
    const mesh = new THREE.Mesh(geo, m)
    mesh.castShadow = mesh.receiveShadow = true
    root.add(mesh)
    return mesh
  }

  const H = suite.height
  const b = bounds(suite.rooms)

  // the maquette's plinth, which also reads as the slab between floors
  slab('slab', b.w + 0.6, 0.5, b.d + 0.6, b.cx, -0.31, b.cz)

  for (const room of suite.rooms) {
    const [x0, z0, x1, z1] = room.rect
    slab(room.floor, x1 - x0, 0.06, z1 - z0, (x0 + x1) / 2, -0.03, (z0 + z1) / 2)
  }

  const ceilings: THREE.Material[] = []
  const ceilingMat = new Map<string, THREE.MeshStandardMaterial>()
  for (const room of suite.rooms) {
    if (room.ceiling === false) continue
    const role = room.ceiling ?? 'ceiling'
    let m = ceilingMat.get(role)
    if (!m) {
      m = kit(role).clone()
      m.transparent = true
      m.opacity = 0
      m.side = THREE.DoubleSide
      // clone() leaves the shader patch behind
      m.onBeforeCompile = kit(role).onBeforeCompile
      m.customProgramCacheKey = kit(role).customProgramCacheKey
      ceilingMat.set(role, m)
      ceilings.push(m)
    }
    const [x0, z0, x1, z1] = room.rect
    const w = x1 - x0
    const d = z1 - z0
    if (room.gable) {
      // a pitched timber roof, open to the rafters as Thai pavilions are
      const rise = 1.6
      const half = d / 2
      const pitch = Math.atan2(rise, half)
      const run = Math.hypot(rise, half)
      for (const s of [-1, 1]) {
        const geo = new THREE.BoxGeometry(w + 0.8, 0.05, run + 0.5)
        geo.rotateX(s * pitch)
        geo.translate((x0 + x1) / 2, H + rise / 2, (z0 + z1) / 2 + s * (half / 2 + 0.12))
        boxMap(geo, 1.2)
        root.add(new THREE.Mesh(geo, m))
      }
      for (let x = x0 + 0.5; x < x1; x += 1.1) {
        for (const s of [-1, 1]) {
          const geo = new THREE.BoxGeometry(0.08, 0.12, run)
          geo.rotateX(s * pitch)
          geo.translate(x, H + rise / 2 - 0.08, (z0 + z1) / 2 + s * (half / 2))
          root.add(new THREE.Mesh(geo, m))
        }
      }
      const ridge = new THREE.BoxGeometry(w + 0.8, 0.18, 0.14)
      ridge.translate((x0 + x1) / 2, H + rise - 0.06, (z0 + z1) / 2)
      root.add(new THREE.Mesh(ridge, m))
    } else {
      const geo = new THREE.PlaneGeometry(w, d)
      geo.rotateX(Math.PI / 2)
      geo.translate((x0 + x1) / 2, H, (z0 + z1) / 2)
      root.add(new THREE.Mesh(geo, m))
    }
  }

  for (const wall of suite.walls) addWall(wall)

  function addWall(wall: Wall) {
    const [ax, az] = wall.a
    const [bx, bz] = wall.b
    const len = Math.hypot(bx - ax, bz - az)
    const dx = (bx - ax) / len
    const dz = (bz - az) / len
    const rot = -Math.atan2(dz, dx)
    const kind = wall.kind ?? 'solid'
    const role = wall.finish ?? 'wall'
    const at = (t: number) => [ax + dx * t, az + dz * t] as const

    if (kind === 'low') {
      for (const r of runs(len, wall.gaps)) {
        if (r.gap) continue
        const [cx, cz] = at((r.from + r.to) / 2)
        slab(role, r.to - r.from, 1.0, THICK + 0.1, cx, 0.5, cz, rot)
      }
      return
    }

    if (kind === 'glass' || kind === 'paper') {
      const frame = kind === 'glass' ? 'mullion' : 'wood'
      const pane = kind === 'glass' ? glass() : kit('paper')
      const bay = kind === 'glass' ? 1.55 : 0.92
      for (const r of runs(len, wall.gaps)) {
        const span = r.to - r.from
        // an opening keeps its two jambs, which the neighbouring runs already draw
        if (r.gap) continue
        const n = Math.max(1, Math.round(span / bay))
        for (let i = 0; i <= n; i++) {
          const [mx, mz] = at(r.from + (span * i) / n)
          slab(frame, 0.05, H, 0.07, mx, H / 2, mz, rot)
        }
        const [cx, cz] = at((r.from + r.to) / 2)
        const geo = new THREE.PlaneGeometry(span, H)
        geo.rotateY(rot)
        geo.translate(cx, H / 2, cz)
        const mesh = new THREE.Mesh(geo, pane)
        mesh.renderOrder = 2
        root.add(mesh)
        if (kind === 'paper') {
          for (let y = 0.5; y < H; y += 0.5) slab('wood', span, 0.025, 0.04, cx, y, cz, rot)
        }
      }
      const [cx, cz] = at(len / 2)
      slab(frame, len, 0.08, 0.08, cx, H - 0.04, cz, rot)
      slab(frame, len, 0.04, 0.08, cx, 0.02, cz, rot)
      return
    }

    for (const r of runs(len, wall.gaps)) {
      const [cx, cz] = at((r.from + r.to) / 2)
      const span = r.to - r.from
      if (!r.gap) {
        // overlap only at the wall's own ends, where it meets the next wall
        const from = r.from === 0 ? -THICK / 2 : r.from
        const to = r.to === len ? len + THICK / 2 : r.to
        const [mx, mz] = at((from + to) / 2)
        slab(role, to - from, H, THICK, mx, H / 2, mz, rot)
        continue
      }
      const top = r.gap.top ?? 2.4
      const sill = r.gap.sill ?? 0
      if (top < H) slab(role, span, H - top, THICK, cx, (H + top) / 2, cz, rot)
      if (sill > 0) slab(role, span, sill, THICK, cx, sill / 2, cz, rot)
    }
  }

  const flames: THREE.Object3D[] = []
  for (const piece of suite.pieces) {
    const obj = furnish(piece, kit)
    obj.traverse(o => {
      if (o.name === 'flame') flames.push(o)
    })
    root.add(obj)
  }

  // the world beyond the glass: a painted cylinder, hidden while it is still a maquette
  const backdrop = new THREE.Mesh(
    new THREE.CylinderGeometry(70, 70, 100, 96, 1, true),
    new THREE.MeshBasicMaterial({ map: panorama(suite), side: THREE.BackSide, transparent: true, opacity: 0, toneMapped: false, fog: false, depthWrite: false }),
  )
  backdrop.position.set(b.cx, -10, b.cz)
  backdrop.renderOrder = -1
  root.add(backdrop)

  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.16 }))
  catcher.rotation.x = -Math.PI / 2
  catcher.position.set(b.cx, -0.56, b.cz)
  catcher.receiveShadow = true
  root.add(catcher)

  const sun = new THREE.DirectionalLight('#fff1dc', 2.6)
  sun.position.set(b.cx + suite.sun[0], suite.sun[1], b.cz + suite.sun[2])
  sun.target.position.set(b.cx, 0, b.cz)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const reach = Math.max(b.w, b.d) * 0.75 + 2
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 120 })
  sun.shadow.radius = 5
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.03
  root.add(sun, sun.target)
  // stands in for the light bouncing off pale floors and walls
  root.add(new THREE.HemisphereLight('#f6f1ea', '#b9a58f', 1.25))

  return {
    root,
    ceilings,
    backdrop,
    water,
    flames,
    sun,
    centre: new THREE.Vector3(b.cx, 0, b.cz),
    span: Math.max(b.w, b.d),
  }
}
