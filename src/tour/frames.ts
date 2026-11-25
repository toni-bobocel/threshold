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
      .then(r => (r.ok ? r.blob() : null))
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
        const key = `${kind}${i}`
        if (this.bitmaps.has(key) || this.decoding.has(key)) continue
        const blob = this.blobs.get(key)
        if (!blob) {
          // jump the queue: this one is about to be on screen
          this.queue.unshift(key)
          if (this.fetching < 8) this.next()
          continue
        }
        this.decoding.add(key)
        createImageBitmap(blob).then(bmp => {
          this.decoding.delete(key)
          if (this.gone) return bmp.close()
          this.bitmaps.set(key, bmp)
          this.onReady()
        })
      }
    }
    for (const [key, bmp] of this.bitmaps) {
      if (key[0] === kind && Math.abs(Number(key.slice(1)) - centre) > KEEP) {
        bmp.close()
        this.bitmaps.delete(key)
      }
    }
  }

  // The decoded frame nearest to `i`, looking outwards.
  nearest(i: number, kind: 'c' | 'k' = 'c') {
    for (let d = 0; d <= KEEP; d++) {
      const hit = this.bitmaps.get(`${kind}${i - d}`) ?? this.bitmaps.get(`${kind}${i + d}`)
      if (hit) return hit
    }
    return undefined
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
