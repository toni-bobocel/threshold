import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ripples } from './materials'
import type { Suite, V3 } from './plan'

// The establishing shots: a tower in Otemachi, a mesa in Utah, a headland in
// Phuket. Each returns its scene and the flight the camera takes into it.

export type Outside = {
  scene: THREE.Scene
  path: { pos: V3[]; look: V3[] }
  tick: (t: number) => void
}

function noise(seed: number) {
  const hash = (x: number, y: number) => {
    const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
    return h - Math.floor(h)
  }
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const value = (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = smooth(x - xi)
    const yf = smooth(y - yi)
    const a = hash(xi, yi)
    const b = hash(xi + 1, yi)
    const c = hash(xi, yi + 1)
    const d = hash(xi + 1, yi + 1)
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf
  }
  return (x: number, y: number, oct = 5) => {
    let sum = 0
    let amp = 0.5
    let f = 1
    for (let i = 0; i < oct; i++) {
      sum += amp * value(x * f, y * f)
      f *= 2.03
      amp *= 0.5
    }
    return sum
  }
}

function skyDome(suite: Suite) {
  const sun = new THREE.Vector3(...suite.sun).normalize()
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(suite.sky.top) },
      glow: { value: new THREE.Color(suite.sky.glow) },
      horizon: { value: new THREE.Color(suite.sky.horizon) },
      sun: { value: sun },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 glow; uniform vec3 horizon; uniform vec3 sun;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 c = mix(horizon, glow, smoothstep(0.0, 0.18, h));
        c = mix(c, top, smoothstep(0.15, 0.75, h));
        float s = max(dot(vDir, sun), 0.0);
        c += vec3(1.0, 0.82, 0.66) * (pow(s, 18.0) * 0.55 + pow(s, 600.0) * 2.0);
        // thin bands of cloud near the horizon, the way the reference films are lit
        float band = sin(vDir.y * 90.0 + sin(atan(vDir.z, vDir.x) * 7.0) * 1.5) * 0.5 + 0.5;
        c = mix(c, vec3(1.0, 0.86, 0.82), band * smoothstep(0.35, 0.05, h) * smoothstep(0.0, 0.05, h) * 0.18);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  })
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), mat)
  dome.name = 'sky'
  return dome
}

function base(suite: Suite) {
  const scene = new THREE.Scene()
  scene.add(skyDome(suite))
  scene.fog = new THREE.Fog(new THREE.Color(suite.sky.horizon).lerp(new THREE.Color(suite.sky.glow), 0.3), 300, 3600)
  const sun = new THREE.DirectionalLight('#ffe2c4', 2.4)
  sun.position.set(...suite.sun).multiplyScalar(40)
  scene.add(sun, new THREE.HemisphereLight(suite.sky.top, '#5d5249', 1.1))
  return scene
}

function facade(floors: number, lit: number, seed: number) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 1024
  const g = c.getContext('2d')!
  const e = document.createElement('canvas')
  e.width = 512
  e.height = 1024
  const ge = e.getContext('2d')!
  ge.fillStyle = '#000'
  ge.fillRect(0, 0, 512, 1024)
  let s = seed
  const r = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  const fh = 1024 / floors
  for (let f = 0; f < floors; f++) {
    const y = f * fh
    const aman = f < lit
    g.fillStyle = aman ? '#3c3a3c' : '#4c5566'
    g.fillRect(0, y, 512, fh)
    for (let k = 0; k < 24; k++) {
      const on = aman ? r() > 0.15 : r() > 0.82
      if (!on) continue
      const x = k * (512 / 24)
      const warm = aman ? `rgba(255,${180 + r() * 40},${110 + r() * 40},1)` : `rgba(255,236,200,${0.25 + r() * 0.4})`
      ge.fillStyle = warm
      ge.fillRect(x + 2, y + fh * 0.18, 512 / 24 - 4, fh * 0.64)
    }
    g.fillStyle = '#25262b'
    g.fillRect(0, y + fh - 3, 512, 3)
  }
  g.fillStyle = 'rgba(20,20,24,0.8)'
  for (let k = 0; k <= 24; k++) g.fillRect(k * (512 / 24) - 1, 0, 2, 1024)
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  const glow = new THREE.CanvasTexture(e)
  glow.colorSpace = THREE.SRGBColorSpace
  return { map, glow }
}

function city(suite: Suite): Outside {
  const scene = base(suite)
  const floors = 38
  const fh = 5.2
  const tower = new THREE.Group()
  const skin = facade(floors, 6, 3)
  const towerMat = new THREE.MeshStandardMaterial({
    map: skin.map,
    emissiveMap: skin.glow,
    emissive: '#ffffff',
    emissiveIntensity: 1.4,
    metalness: 0.7,
    roughness: 0.22,
    envMapIntensity: 1.2,
  })
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(46, floors * fh, 46), towerMat)
  shaft.position.y = (floors * fh) / 2
  tower.add(shaft)
  const crown = new THREE.Mesh(new THREE.BoxGeometry(48, 6, 48), new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.5 }))
  crown.position.y = floors * fh + 3
  tower.add(crown)
  tower.rotation.y = 0.5
  scene.add(tower)

  // the rest of Tokyo: a few thousand boxes, kept clear of the palace grounds to the west
  const n = noise(4)
  const box = new THREE.BoxGeometry(1, 1, 1)
  box.translate(0, 0.5, 0)
  const cityMat = new THREE.MeshStandardMaterial({ map: facade(12, 0, 9).map, emissiveMap: facade(12, 0, 9).glow, emissive: '#ffffff', emissiveIntensity: 0.8, roughness: 0.6, metalness: 0.3 })
  const count = 2600
  const blocks = new THREE.InstancedMesh(box, cityMat, count)
  const m = new THREE.Matrix4()
  let placed = 0
  for (let i = 0; placed < count && i < count * 4; i++) {
    const a = i * 2.39996
    const rad = 150 + Math.sqrt(i / (count * 4)) * 2600
    const x = Math.cos(a) * rad
    const z = Math.sin(a) * rad
    if (x < -180 && x > -1100 && Math.abs(z) < 700) continue
    // nothing nearby may rival the tower, or the opening shot loses it
    const h = 10 + n(x / 300, z / 300) ** 3 * Math.min(140, rad * 0.18)
    const w = 18 + n(z / 50, x / 50) * 40
    m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.round(a) * 0.1), new THREE.Vector3(w, h, w * (0.7 + n(x, z) * 0.6)))
    blocks.setMatrixAt(placed++, m)
  }
  blocks.count = placed
  scene.add(blocks)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ color: '#4a4a50', roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)
  const garden = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: '#33452f', roughness: 1 }))
  garden.rotation.x = -Math.PI / 2
  garden.scale.set(420, 330, 1)
  garden.position.set(-640, 0.3, 0)
  scene.add(garden)
  const moat = new THREE.Mesh(new THREE.RingGeometry(1, 1.06, 64), new THREE.MeshStandardMaterial({ color: '#8fa3b0', roughness: 0.1, metalness: 0.6 }))
  moat.rotation.x = -Math.PI / 2
  moat.scale.set(420, 330, 1)
  moat.position.set(-640, 0.5, 0)
  scene.add(moat)

  const level = suite.gauge.to * fh + fh / 2
  const face = new THREE.Vector3(Math.sin(0.5), 0, Math.cos(0.5))
  const at = (d: number, y: number): V3 => [face.x * d - face.z * d * 0.25, y, face.z * d + face.x * d * 0.25]
  return {
    scene,
    path: {
      pos: [[-430, 60, 640], at(380, 140), at(150, level + 8), at(40, level)],
      look: [[60, 135, 0], [0, 150, 0], [0, level, 0], [face.x * 23, level, face.z * 23]],
    },
    tick() {},
  }
}

function terrain(size: number, seg: number, height: (x: number, z: number) => number, color: (h: number, x: number, z: number) => THREE.Color) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position!
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = height(x, z)
    pos.setY(i, h)
    color(h, x, z).toArray(colors, i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }))
}

function pavilion(w: number, d: number, h: number, mat: THREE.Material, roof?: THREE.Material) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  body.position.y = h / 2
  g.add(body)
  if (roof) {
    const shape = new THREE.Shape([new THREE.Vector2(-d / 2 - 1, 0), new THREE.Vector2(0, d * 0.42), new THREE.Vector2(d / 2 + 1, 0)])
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w + 2, bevelEnabled: false })
    geo.translate(0, 0, -(w + 2) / 2)
    geo.rotateY(Math.PI / 2)
    const r = new THREE.Mesh(geo, roof)
    r.position.y = h
    g.add(r)
  }
  return g
}

function desert(suite: Suite): Outside {
  const scene = base(suite)
  const n = noise(7)
  const mesa = (x: number, z: number) => {
    const k = n(x / 900, z / 900, 4)
    // flat tops and sheer sides: Utah's sandstone, not rolling hills
    const step = THREE.MathUtils.smoothstep(k, 0.52, 0.56) * 170 + THREE.MathUtils.smoothstep(k, 0.62, 0.64) * 90
    return step + n(x / 120, z / 120, 3) * 14
  }
  const height = (x: number, z: number) => {
    const clear = Math.min(1, Math.hypot(x, z) / 260)
    return mesa(x, z) * clear
  }
  const sand = new THREE.Color('#c99572')
  const rust = new THREE.Color('#9c5438')
  const pale = new THREE.Color('#e0c0a0')
  const land = terrain(6000, 260, height, (h, x, z) => {
    const c = sand.clone().lerp(rust, THREE.MathUtils.clamp(h / 120, 0, 1))
    return c.lerp(pale, n(x / 40, z / 40, 2) * 0.25)
  })
  scene.add(land)

  const concrete = new THREE.MeshStandardMaterial({ color: '#cfb59b', roughness: 0.95 })
  const ring = 14
  for (let i = 0; i < ring; i++) {
    const a = -0.5 + (i / ring) * Math.PI * 1.3
    const p = pavilion(16, 12, 4.2, concrete)
    p.position.set(Math.cos(a) * 70, 0, Math.sin(a) * 70)
    p.rotation.y = -a
    scene.add(p)
  }
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(36, 9), new THREE.MeshStandardMaterial({ color: '#6aa3a6', roughness: 0.05, metalness: 0.2, normalMap: ripples() }))
  pool.rotation.x = -Math.PI / 2
  pool.position.set(0, 0.3, 0)
  scene.add(pool)

  const sage = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#7d8160', roughness: 1, flatShading: true }), 1400)
  const m = new THREE.Matrix4()
  for (let i = 0; i < 1400; i++) {
    const a = i * 2.39996
    const r = 40 + Math.sqrt(i / 1400) * 1500
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const s = 0.8 + n(x, z) * 1.6
    m.compose(new THREE.Vector3(x, height(x, z), z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.6, s))
    sage.setMatrixAt(i, m)
  }
  scene.add(sage)

  const [sx, , sz] = suite.sun
  const out = new THREE.Vector2(-sx, -sz).normalize()
  return {
    scene,
    path: {
      pos: [[out.x * 1300, 420, out.y * 1300], [out.x * 600, 190, out.y * 600], [out.x * 190, 40, out.y * 190], [out.x * 86, 4, out.y * 86]],
      look: [[0, 60, 0], [0, 20, 0], [0, 4, 0], [out.x * 70, 2.4, out.y * 70]],
    },
    tick() {},
  }
}

function palms(count: number, place: (i: number) => THREE.Vector3 | null) {
  const trunk = new THREE.CylinderGeometry(0.22, 0.3, 9, 6)
  trunk.translate(0, 4.5, 0)
  const fronds: THREE.BufferGeometry[] = []
  for (let i = 0; i < 9; i++) {
    const f = new THREE.ConeGeometry(0.9, 4.6, 3, 1, true)
    f.scale(1, 1, 0.12)
    f.rotateX(Math.PI / 2 + 0.5)
    f.translate(0, 0, 2.1)
    f.rotateY((i / 9) * Math.PI * 2)
    f.translate(0, 9, 0)
    fronds.push(f)
  }
  const crown = mergeGeometries(fronds)!
  const tm = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: '#7a6a58', roughness: 1 }), count)
  const cm = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: '#36532f', roughness: 0.8, side: THREE.DoubleSide }), count)
  const m = new THREE.Matrix4()
  let k = 0
  for (let i = 0; i < count * 3 && k < count; i++) {
    const p = place(i)
    if (!p) continue
    const s = 0.8 + ((i * 7919) % 100) / 220
    m.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(((i % 7) - 3) * 0.03, i, ((i % 5) - 2) * 0.04)), new THREE.Vector3(s, s, s))
    tm.setMatrixAt(k, m)
    cm.setMatrixAt(k, m)
    k++
  }
  tm.count = cm.count = k
  return [tm, cm]
}

function shore(suite: Suite): Outside {
  const scene = base(suite)
  const n = noise(2)
  // a headland rising from the sea toward the south-west
  const height = (x: number, z: number) => {
    const land = THREE.MathUtils.smoothstep(z, -120, 260)
    return land * (30 + n(x / 260, z / 260) * 90) - 8 + n(x / 40, z / 40, 3) * 6
  }
  const green = new THREE.Color('#3f5a35')
  const dark = new THREE.Color('#2a3d27')
  const sandC = new THREE.Color('#d8c6a4')
  const land = terrain(4000, 220, height, (h, x, z) => {
    if (h < 2.5) return sandC.clone()
    return green.clone().lerp(dark, n(x / 30, z / 30, 2))
  })
  scene.add(land)

  const normal = ripples()
  normal.repeat.set(60, 60)
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    new THREE.MeshPhysicalMaterial({ color: '#2f6f78', roughness: 0.08, metalness: 0, normalMap: normal, normalScale: new THREE.Vector2(0.4, 0.4), clearcoat: 1, envMapIntensity: 1.4 }),
  )
  sea.rotation.x = -Math.PI / 2
  sea.position.y = 0
  scene.add(sea)

  const teak = new THREE.MeshStandardMaterial({ color: '#8b6a4c', roughness: 0.9 })
  const roof = new THREE.MeshStandardMaterial({ color: '#2f2924', roughness: 0.85 })
  for (let i = 0; i < 18; i++) {
    const x = -220 + i * 26 + Math.sin(i * 3.1) * 10
    const z = 40 + Math.cos(i * 1.7) * 30
    const p = pavilion(9, 7, 3.4, teak, roof)
    p.position.set(x, height(x, z), z)
    p.rotation.y = Math.sin(i) * 0.3
    scene.add(p)
  }
  const villa = pavilion(12, 9, 3.6, teak, roof)
  villa.position.set(0, height(0, 0), 0)
  scene.add(villa)

  scene.add(...palms(900, i => {
    const a = i * 2.39996
    const r = 10 + Math.sqrt(i / 2700) * 700
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r + 60
    const h = height(x, z)
    return h > 2 ? new THREE.Vector3(x, h, z) : null
  }))

  const y = height(0, 0)
  return {
    scene,
    path: {
      pos: [[260, 140, -900], [120, 70, -380], [30, y + 22, -90], [0, y + 3, -20]],
      look: [[0, 30, 0], [0, y, 0], [0, y + 2, 0], [0, y + 2, 0]],
    },
    tick(t) {
      normal.offset.set(t * 0.004, t * 0.002)
    },
  }
}

export function buildOutside(suite: Suite): Outside {
  return { city, desert, sea: shore }[suite.view](suite)
}
