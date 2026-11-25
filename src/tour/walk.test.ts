import { readFileSync } from 'node:fs'
import { CatmullRomCurve3, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { amangiri } from '../suites/amangiri'
import { amanpuri } from '../suites/amanpuri'
import { tokyo } from '../suites/tokyo'
import { bounds, pieceKinds, runs, type Suite, type V2 } from './plan'

const suites: Suite[] = [tokyo, amangiri, amanpuri]

function crosses(p: V2, q: V2, a: V2, b: V2) {
  const side = (o: V2, s: V2, t: V2) => (s[0] - o[0]) * (t[1] - o[1]) - (s[1] - o[1]) * (t[0] - o[0])
  return side(p, q, a) * side(p, q, b) < 0 && side(a, b, p) * side(a, b, q) < 0
}

// Every stretch of wall a person cannot walk through: solid runs, glass,
// and openings with a sill (windows), but not doorways.
function barriers(suite: Suite) {
  const out: [V2, V2][] = []
  for (const w of suite.walls) {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])
    const dx = (w.b[0] - w.a[0]) / len
    const dz = (w.b[1] - w.a[1]) / len
    for (const r of runs(len, w.gaps)) {
      if (r.gap && !r.gap.sill) continue
      out.push([
        [w.a[0] + dx * r.from, w.a[1] + dz * r.from],
        [w.a[0] + dx * r.to, w.a[1] + dz * r.to],
      ])
    }
  }
  return out
}

describe('the furniture kit', () => {
  it('matches what Blender can build', () => {
    const py = readFileSync(new URL('../../blender/kit.py', import.meta.url), 'utf-8')
    const listed = py.slice(py.indexOf('KINDS = {')).match(/\(([^)]*)\)/)?.[1] ?? ''
    const kinds = listed.split(',').map(k => k.trim()).filter(Boolean)
    expect([...kinds].sort()).toEqual([...pieceKinds].sort())
  })
})

describe('runs', () => {
  it('splits a wall around its openings', () => {
    expect(runs(10, [{ at: 5, w: 2 }])).toEqual([
      { from: 0, to: 4 },
      { from: 4, to: 6, gap: { at: 5, w: 2 } },
      { from: 6, to: 10 },
    ])
  })

  it('accepts openings out of order and against the ends', () => {
    const r = runs(6, [{ at: 5.5, w: 1 }, { at: 0.5, w: 1 }])
    expect(r.map(x => [x.from, x.to])).toEqual([[0, 1], [1, 5], [5, 6]])
  })
})

describe.each(suites)('$id', suite => {
  const b = bounds(suite.rooms)

  it('walks through doorways, never through a wall', () => {
    const v = (p: number[]) => new Vector3(p[0], p[1], p[2])
    const path = new CatmullRomCurve3(suite.stops.map(s => v(s.pos)), false, 'centripetal')
    const pts = path.getPoints(suite.stops.length * 120).map(p => [p.x, p.z] as V2)
    const walls = barriers(suite)
    for (let i = 1; i < pts.length; i++) {
      for (const [a, c] of walls) {
        expect(crosses(pts[i - 1]!, pts[i]!, a, c), `step ${i} crosses the wall ${a} to ${c}`).toBe(false)
      }
    }
  })

  it('keeps every stop on the plan, at eye height', () => {
    for (const s of suite.stops) {
      expect(s.pos[0]).toBeGreaterThan(b.x0)
      expect(s.pos[0]).toBeLessThan(b.x1)
      expect(s.pos[2]).toBeGreaterThan(b.z0)
      expect(s.pos[2]).toBeLessThan(b.z1)
      expect(s.pos[1]).toBeGreaterThan(1.4)
      expect(s.pos[1]).toBeLessThan(1.8)
    }
  })

  it('only uses furniture and finishes that exist', () => {
    for (const p of suite.pieces) expect(pieceKinds).toContain(p.kind)
    for (const r of suite.rooms) {
      expect(suite.finishes).toHaveProperty(r.floor)
      if (r.ceiling) expect(suite.finishes).toHaveProperty(r.ceiling)
    }
  })

  it('starts and ends on a stop that says something', () => {
    expect(suite.stops[0]?.title).toBeTruthy()
    expect(suite.stops.at(-1)?.title).toBeTruthy()
  })
})
