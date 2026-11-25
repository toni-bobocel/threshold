import * as THREE from 'three'

// Every surface is painted on a canvas at start-up: no texture files to ship,
// and each suite can retint the same recipes.

type Paint = (g: CanvasRenderingContext2D, s: number, rnd: () => number) => void

function rng(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function canvasTexture(size: number, seed: number, paint: Paint, repeat = 1) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  paint(g, size, rng(seed))
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.anisotropy = 8
  return tex
}

const shade = (hex: string, k: number) => {
  const c = new THREE.Color(hex)
  c.offsetHSL(0, 0, k)
  return `#${c.getHexString()}`
}

function grain(g: CanvasRenderingContext2D, s: number, rnd: () => number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${alpha * rnd()})` : `rgba(0,0,0,${alpha * rnd()})`
    g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2)
  }
}

export const paints = {
  planks(base: string, width = 6): Paint {
    return (g, s, rnd) => {
      const w = s / width
      for (let i = 0; i < width; i++) {
        let y = -rnd() * s
        while (y < s) {
          const len = s * (0.45 + rnd() * 0.6)
          g.fillStyle = shade(base, (rnd() - 0.5) * 0.07)
          g.fillRect(i * w, y, w, len)
          g.strokeStyle = 'rgba(40,25,10,0.07)'
          for (let k = 0; k < 14; k++) {
            const x = i * w + rnd() * w
            g.lineWidth = 0.5 + rnd()
            g.beginPath()
            g.moveTo(x, y)
            g.bezierCurveTo(x + (rnd() - 0.5) * 6, y + len / 3, x + (rnd() - 0.5) * 6, y + len * 0.66, x, y + len)
            g.stroke()
          }
          g.fillStyle = 'rgba(30,18,8,0.35)'
          g.fillRect(i * w, y, w, 1.2)
          y += len
        }
        g.fillStyle = 'rgba(30,18,8,0.3)'
        g.fillRect(i * w, 0, 1.2, s)
      }
      grain(g, s, rnd, 9000, 0.05)
    }
  },

  // one board, end to end, for furniture: plank joints look wrong on a chair back
  grain(base: string): Paint {
    return (g, s, rnd) => {
      g.fillStyle = base
      g.fillRect(0, 0, s, s)
      for (let k = 0; k < 90; k++) {
        const x = rnd() * s
        g.strokeStyle = `rgba(${rnd() > 0.3 ? '60,35,15' : '255,240,220'},${0.04 + rnd() * 0.06})`
        g.lineWidth = 0.6 + rnd() * 2.4
        g.beginPath()
        g.moveTo(x, 0)
        g.bezierCurveTo(x + (rnd() - 0.5) * 30, s / 3, x + (rnd() - 0.5) * 30, (s * 2) / 3, x, s)
        g.stroke()
      }
      grain(g, s, rnd, 6000, 0.04)
    }
  },

  stone(base: string, veins = 0.5): Paint {
    return (g, s, rnd) => {
      g.fillStyle = base
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(${rnd() > 0.5 ? '255,250,240' : '120,100,80'},${0.05 * rnd()})`
        g.beginPath()
        g.ellipse(rnd() * s, rnd() * s, 10 + rnd() * 70, 4 + rnd() * 18, 0.1 * (rnd() - 0.5), 0, Math.PI * 2)
        g.fill()
      }
      // travertine reads as stone because of its long horizontal bands and pits
      for (let i = 0; i < 40 * veins; i++) {
        const y = rnd() * s
        g.strokeStyle = `rgba(110,90,70,${0.06 + 0.08 * rnd()})`
        g.lineWidth = 0.6 + rnd() * 1.6
        g.beginPath()
        g.moveTo(0, y)
        for (let x = 0; x <= s; x += s / 8) g.lineTo(x, y + (rnd() - 0.5) * 10)
        g.stroke()
      }
      for (let i = 0; i < 380 * veins; i++) {
        g.fillStyle = `rgba(90,70,50,${0.15 * rnd()})`
        g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 4, 1 + rnd())
      }
      grain(g, s, rnd, 14000, 0.04)
    }
  },

  // large-format stone laid in a running bond; joints are what make a floor read as stone
  tiles(base: string, rows = 2): Paint {
    return (g, s, rnd) => {
      paints.speckle(base)(g, s, rnd)
      const h = s / rows
      g.strokeStyle = 'rgba(20,18,16,0.35)'
      g.lineWidth = 2
      for (let r = 0; r < rows; r++) {
        g.beginPath()
        g.moveTo(0, r * h)
        g.lineTo(s, r * h)
        const x = r % 2 ? s / 2 : 0
        g.moveTo(x, r * h)
        g.lineTo(x, r * h + h)
        g.stroke()
        g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},0.04)`
        g.fillRect(x, r * h, s / 2, h)
      }
    }
  },

  speckle(base: string): Paint {
    return (g, s, rnd) => {
      g.fillStyle = base
      g.fillRect(0, 0, s, s)
      grain(g, s, rnd, 40000, 0.09)
      for (let i = 0; i < 1600; i++) {
        g.fillStyle = `rgba(255,255,255,${0.05 * rnd()})`
        g.fillRect(rnd() * s, rnd() * s, 1, 1)
      }
    }
  },

  plaster(base: string, cloud = 0.05): Paint {
    return (g, s, rnd) => {
      g.fillStyle = base
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 90; i++) {
        const r = 30 + rnd() * 120
        const x = rnd() * s
        const y = rnd() * s
        const grd = g.createRadialGradient(x, y, 0, x, y, r)
        const tone = rnd() > 0.5 ? '255,255,255' : '90,70,55'
        grd.addColorStop(0, `rgba(${tone},${cloud * rnd()})`)
        grd.addColorStop(1, `rgba(${tone},0)`)
        g.fillStyle = grd
        g.fillRect(x - r, y - r, r * 2, r * 2)
      }
      grain(g, s, rnd, 16000, 0.035)
    }
  },

  weave(base: string): Paint {
    return (g, s, rnd) => {
      g.fillStyle = base
      g.fillRect(0, 0, s, s)
      for (let y = 0; y < s; y += 3) {
        for (let x = 0; x < s; x += 3) {
          const k = (rnd() - 0.5) * 0.16
          g.fillStyle = k > 0 ? `rgba(255,255,255,${k})` : `rgba(0,0,0,${-k})`
          g.beginPath()
          g.arc(x + rnd(), y + rnd(), 1.3, 0, Math.PI * 2)
          g.fill()
        }
      }
    }
  },

  washi(base: string): Paint {
    return (g, s, rnd) => {
      g.fillStyle = base
      g.fillRect(0, 0, s, s)
      g.strokeStyle = 'rgba(160,140,110,0.12)'
      for (let i = 0; i < 700; i++) {
        const x = rnd() * s
        const y = rnd() * s
        g.lineWidth = 0.4 + rnd() * 0.6
        g.beginPath()
        g.moveTo(x, y)
        g.quadraticCurveTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 30, x + (rnd() - 0.5) * 50, y + (rnd() - 0.5) * 50)
        g.stroke()
      }
    }
  },

  // A brushed ink composition for the walls; Aman hangs calligraphy, not colour fields.
  ink(paper: string, ink: string, accent: string): Paint {
    return (g, s, rnd) => {
      g.fillStyle = paper
      g.fillRect(0, 0, s, s)
      grain(g, s, rnd, 8000, 0.04)
      g.lineCap = 'round'
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = k === 2 ? accent : ink
        g.globalAlpha = k === 2 ? 0.85 : 0.9
        let x = s * (0.2 + rnd() * 0.5)
        let y = s * (0.15 + rnd() * 0.2)
        let w = s * (0.05 + rnd() * 0.04)
        for (let i = 0; i < 70; i++) {
          g.lineWidth = w
          g.beginPath()
          g.moveTo(x, y)
          x += (rnd() - 0.4) * s * 0.03
          y += s * 0.01
          g.lineTo(x, y)
          g.stroke()
          w *= 0.985
        }
      }
      g.globalAlpha = 1
    }
  },
}

export function texture(key: string, paint: Paint, repeat = 1, size = 512) {
  let seed = 0
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) | 0
  return canvasTexture(size, seed, paint, repeat)
}

// One uniform drives every surface from white clay to its real finish, so the
// maquette colours itself in a single tween instead of swapping materials.
export const clay = { value: 1 }

export function claylike<M extends THREE.MeshStandardMaterial>(m: M, white = 0.94): M {
  m.onBeforeCompile = shader => {
    shader.uniforms.uClay = clay
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uClay;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(${white.toFixed(3)}), uClay);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.92, uClay);',
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - uClay;',
      )
  }
  m.customProgramCacheKey = () => `clay${white}`
  return m
}

export type Finish = {
  color?: string
  map?: THREE.Texture
  rough?: number
  metal?: number
  glow?: string
  side?: THREE.Side
}

export function finish(f: Finish) {
  return claylike(new THREE.MeshStandardMaterial({
    color: f.color ?? '#ffffff',
    map: f.map ?? null,
    roughness: f.rough ?? 0.8,
    metalness: f.metal ?? 0,
    emissive: f.glow ?? '#000000',
    emissiveIntensity: f.glow ? 1.6 : 0,
    side: f.side ?? THREE.FrontSide,
  }))
}

export function glass(tint = '#dfe9ec') {
  return new THREE.MeshPhysicalMaterial({
    color: tint,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: 0.14,
    envMapIntensity: 1.4,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

// Normal map for water: a few octaves of soft blobs, scrolled every frame.
export function ripples() {
  const tex = canvasTexture(256, 7, (g, s, rnd) => {
    g.fillStyle = 'rgb(128,128,255)'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 500; i++) {
      const x = rnd() * s
      const y = rnd() * s
      const r = 4 + rnd() * 22
      const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r)
      grd.addColorStop(0, 'rgba(150,150,255,0.35)')
      grd.addColorStop(1, 'rgba(108,108,255,0)')
      g.fillStyle = grd
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
  }, 3)
  tex.colorSpace = THREE.NoColorSpace
  return tex
}
