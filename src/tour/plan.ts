// A suite is described as data: rooms, walls with their openings, furniture
// and the stops of the walk. The builder, the minimap and the timeline all
// read this one description, so a new suite is a new file and nothing else.

export type V2 = [number, number]
export type V3 = [number, number, number]

export type Recipe = {
  paint?: 'planks' | 'grain' | 'stone' | 'tiles' | 'speckle' | 'plaster' | 'weave' | 'washi'
  base: string
  arg?: number
  // metres covered by one tile of the texture
  tile?: number
  rough?: number
  metal?: number
  glow?: string
}

// `at` is measured along the wall from `a`. A door leaves `sill` at 0; a window raises it.
export type Gap = { at: number; w: number; top?: number; sill?: number }

export type Wall = {
  a: V2
  b: V2
  kind?: 'solid' | 'glass' | 'paper' | 'low'
  gaps?: Gap[]
  finish?: string
}

export type Room = {
  name: string
  rect: [number, number, number, number]
  floor: string
  // false for a terrace open to the sky
  ceiling?: string | false
  gable?: boolean
}

export type Piece = {
  kind: string
  at: V2
  rot?: number
  y?: number
  w?: number
  d?: number
  h?: number
  light?: boolean
  variant?: string
}

// A stop without a title is a turn in the corridor: the camera passes through, nothing is said.
export type Stop = {
  pos: V3
  look: V3
  room?: string
  title?: string
  body?: string
  facts?: [string, string][]
}

export type Sky = { top: string; horizon: string; glow: string; haze: string }

export type Suite = {
  id: 'tokyo' | 'amangiri' | 'amanpuri'
  place: string
  title: string
  lede: string
  gauge: {
    label: string
    from: number
    to: number
    unit: string
    name: string
    note: string
    facts: [string, string][]
  }
  figures: [string, string][]
  plate: string
  height: number
  // where the maquette is seen from, in radians around the suite; face the glass
  iso: number
  sky: Sky
  sun: V3
  view: 'city' | 'desert' | 'sea'
  finishes: Record<string, Recipe>
  rooms: Room[]
  walls: Wall[]
  pieces: Piece[]
  stops: Stop[]
  outro: { title: string; body: string; facts: [string, string][] }
}

// What blender/kit.py knows how to build; the test keeps the plans honest about it.
export const pieceKinds = [
  'sofa', 'armchair', 'lowTable', 'sideTable', 'dining', 'bed', 'desk', 'tub', 'vanity', 'plant', 'ikebana',
  'art', 'rug', 'wardrobe', 'bench', 'pendant', 'daybed', 'lounger', 'firepit', 'pool', 'rock', 'palm', 'bowl',
  'shelf', 'door', 'post',
]

export function bounds(rooms: Room[]) {
  let x0 = Infinity
  let z0 = Infinity
  let x1 = -Infinity
  let z1 = -Infinity
  for (const { rect } of rooms) {
    x0 = Math.min(x0, rect[0])
    z0 = Math.min(z0, rect[1])
    x1 = Math.max(x1, rect[2])
    z1 = Math.max(z1, rect[3])
  }
  return { x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }
}

// Splits a wall into the solid runs between its openings, in metres along the wall.
export function runs(length: number, gaps: Gap[] = []) {
  const out: { from: number; to: number; gap?: Gap }[] = []
  let t = 0
  for (const gap of [...gaps].sort((p, q) => p.at - q.at)) {
    const start = Math.max(t, gap.at - gap.w / 2)
    if (start > t) out.push({ from: t, to: start })
    const end = Math.min(length, gap.at + gap.w / 2)
    out.push({ from: start, to: end, gap })
    t = end
  }
  if (t < length) out.push({ from: t, to: length })
  return out
}
