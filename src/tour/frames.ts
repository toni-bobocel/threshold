// Holds a suite's rendered frames. Every file is fetched once and kept as a
// compressed blob; only the frames around the playhead are decoded, because
// a decoded 1440×810 frame costs almost 5 MB and a suite has six hundred.

const WINDOW = 10
const KEEP = 18

export class Frames {
  private blobs = new Map<string, Blob>()
  private bitmaps = new Map<string, ImageBitmap>()
  private decoding = new Set<string>()
  private inflight = new Set<string>()
  private queue: string[] = []
  // the last frame shown of each kind, kept decoded so a jump past the frames
  // that have arrived leaves the previous picture up instead of a blank canvas
  private held = new Map<string, string>()
  private fetching = 0
  private gone = false
  onReady: () => void = () => {}

  constructor(
    private url: (key: string) => string,
    private count: number,
    private clay: [number, number],
  ) {}

  // Coarse first, so a fast scroll always has something near to show, then the gaps.
  preload() {
    const keys: string[] = []
    for (let step = 16; step >= 1; step /= 2) {
      for (let i = 0; i < this.count; i += step) keys.push(`c${i}`)
    }
    for (let i = this.clay[0]; i < this.clay[0] + this.clay[1]; i += 2) keys.push(`k${i}`)
    for (let i = this.clay[0] + 1; i < this.clay[0] + this.clay[1]; i += 2) keys.push(`k${i}`)
    this.queue = [...new Set(keys)]
    for (let n = 0; n < 6; n++) this.next()
  }

  private next(): void {
    if (this.gone) return
    let key = this.queue.shift()
    while (key && (this.blobs.has(key) || this.inflight.has(key))) key = this.queue.shift()
    if (!key) return
    const got = key
    this.inflight.add(got)
    this.fetching++
    fetch(this.url(key))
      // a frame not rendered yet comes back as the dev server's index.html
      .then(r => (r.ok && r.headers.get('content-type')?.startsWith('image/') ? r.blob() : null))
      .then(blob => {
        if (blob) this.blobs.set(got, blob)
      })
      // a missing frame is not worth an error: nearest() shows its neighbour instead
      .catch(() => {})
      .finally(() => {
        this.inflight.delete(got)
        this.fetching--
        this.next()
      })
  }

  // Ask for the frames around `at` to be decoded; drop the far ones.
  focus(at: number, kind: 'c' | 'k' = 'c') {
    const centre = Math.round(at)
    for (let d = 0; d <= WINDOW; d++) {
      for (const i of d ? [centre + d, centre - d] : [centre]) {
        if (i < 0 || i >= this.count) continue
        // the maquette was only rendered over the model orbit
        if (kind === 'k' && (i < this.clay[0] || i >= this.clay[0] + this.clay[1])) continue
        const key = `${kind}${i}`
        if (this.bitmaps.has(key) || this.decoding.has(key)) continue
        const blob = this.blobs.get(key)
        if (!blob) {
          // jump the queue: this one is about to be on screen
          this.queue.unshift(key)
          if (this.fetching < 8) this.next()
          continue
        }
        this.decode(key, blob)
      }
    }
    // Nothing to show yet, here or before: decode the closest frame that has
    // arrived, wherever it is, rather than leave the stage empty.
    if (!this.held.has(kind) && !this.decoding.size) {
      let best: string | undefined
      for (const key of this.blobs.keys()) {
        if (key[0] !== kind) continue
        if (!best || Math.abs(Number(key.slice(1)) - at) < Math.abs(Number(best.slice(1)) - at)) best = key
      }
      if (best && !this.bitmaps.has(best)) {
        this.decode(best, this.blobs.get(best)!, () => this.held.set(kind, best))
      } else if (best) {
        this.held.set(kind, best)
      }
    }
    for (const [key, bmp] of this.bitmaps) {
      if (key[0] === kind && key !== this.held.get(kind) && Math.abs(Number(key.slice(1)) - centre) > KEEP) {
        bmp.close()
        this.bitmaps.delete(key)
      }
    }
  }

  private decode(key: string, blob: Blob, then?: () => void) {
    this.decoding.add(key)
    createImageBitmap(blob).then(
      bmp => {
        this.decoding.delete(key)
        if (this.gone) return bmp.close()
        this.bitmaps.set(key, bmp)
        then?.()
        this.onReady()
      },
      () => {
        this.decoding.delete(key)
        this.blobs.delete(key)
      },
    )
  }

  // The decoded frame nearest to `i`, looking outwards.
  nearest(i: number, kind: 'c' | 'k' = 'c') {
    for (let d = 0; d <= KEEP; d++) {
      for (const key of [`${kind}${i - d}`, `${kind}${i + d}`]) {
        const hit = this.bitmaps.get(key)
        if (!hit) continue
        this.held.set(kind, key)
        return hit
      }
    }
    const last = this.held.get(kind)
    return last ? this.bitmaps.get(last) : undefined
  }

  exact(i: number, kind: 'c' | 'k' = 'c') {
    return this.bitmaps.get(`${kind}${i}`)
  }

  dispose() {
    this.gone = true
    for (const bmp of this.bitmaps.values()) bmp.close()
    this.bitmaps.clear()
    this.blobs.clear()
  }
}
