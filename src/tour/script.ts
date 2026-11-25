import type { Stop } from './plan'

// How long each part of the walk lasts, in scroll units. One unit is a
// fraction of the viewport height; see UNIT in tour.ts.

export const beats = {
  arrive: 0.7,
  fly: 3.2,
  flash: 0.6,
  model: 1.1,
  colour: 1.5,
  descend: 1.8,
  read: 1.3,
  leave: 1.8,
  linger: 0.9,
}

// Walking speed is roughly constant, so a long corridor costs more scroll than a step.
export function legs(stops: Stop[]) {
  const out: number[] = []
  for (let i = 1; i < stops.length; i++) {
    const [ax, , az] = stops[i - 1]!.pos
    const [bx, , bz] = stops[i]!.pos
    out.push(0.35 + Math.hypot(bx - ax, bz - az) * 0.17)
  }
  return out
}

export function length(stops: Stop[]) {
  const walked = legs(stops).reduce((a, b) => a + b, 0)
  const read = stops.filter(s => s.title).length * beats.read
  return beats.arrive + beats.fly + beats.flash + beats.model + beats.colour + beats.descend + walked + read + beats.leave + beats.linger
}
