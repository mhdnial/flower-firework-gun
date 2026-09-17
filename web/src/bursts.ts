// Burst shapes: tulip, sunflower, rose, white lily (+ the classic circle burst, built in particles.ts).
// Port of the shape functions in fireworks.py.
// Shapes are in "flower units": head roughly radius 1 around the origin, y UP, stem hanging below.

export type RGB = [number, number, number]

export interface Shape {
  /** x,y pairs */
  pts: number[]
  /** r,g,b triples (0..1) */
  cols: number[]
}

export type BurstType = 'tulip' | 'sunflower' | 'rose' | 'lily' | 'circle'
export const BURST_TYPES: BurstType[] = ['tulip', 'sunflower', 'rose', 'lily', 'circle']

const TAU = Math.PI * 2
const rand = (a = 0, b = 1) => a + Math.random() * (b - a)
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]
const gauss = (sd: number) => {
  const u = 1 - Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * Math.random()) * sd
}

const GREEN_STEM: RGB = [0.25, 0.95, 0.3]
const GREEN_LEAF: RGB = [0.1, 0.75, 0.25]

function push(shape: Shape, x: number, y: number, c: RGB, jitter = 0.15) {
  const k = rand(1 - jitter, 1 + jitter)
  shape.pts.push(x, y)
  shape.cols.push(Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k))
}

/** Lens-shaped petal growing along +y from base, rotated by angle; mostly outline points. */
function petal(shape: Shape, n: number, length: number, width: number, angle: number,
  bx: number, by: number, color: RGB | ((x: number, y: number) => RGB), roundness = 0.8, edge = 0.88) {
  const c = Math.cos(angle), s = Math.sin(angle)
  for (let i = 0; i < n; i++) {
    const t = Math.random()
    const half = width * Math.pow(Math.sin(Math.PI * t), roundness)
    const x = Math.random() < edge ? (Math.random() < 0.5 ? -half : half) : rand(-1, 1) * half
    const y = t * length
    const px = x * c - y * s + bx
    const py = x * s + y * c + by
    push(shape, px, py, typeof color === 'function' ? color(px, py) : color)
  }
}

function greenParts(shape: Shape, n: number, top: number) {
  const ns = Math.floor(n * 0.45)
  for (let i = 0; i < ns; i++) {
    const y = rand(-1.9, top)
    push(shape, 0.07 * Math.sin((y - top) * 2.2) + gauss(0.006), y, GREEN_STEM)
  }
  const nl = n - ns
  const a = Math.floor(nl / 2)
  const ya = top - 0.55
  petal(shape, a, 0.55, 0.13, 1.05, 0.07 * Math.sin(-0.55 * 2.2), ya, GREEN_LEAF, 0.8, 0.7)
  petal(shape, nl - a, 0.45, 0.11, -1.0, 0.07 * Math.sin(-0.8 * 2.2), ya - 0.25, GREEN_LEAF, 0.8, 0.7)
}

function ring(shape: Shape, m: number, count: number, length: number, width: number, radius: number,
  rot: number, color: RGB, roundness: number, edge: number) {
  const per = Math.floor(m / count)
  for (let j = 0; j < count; j++) {
    const k = j < count - 1 ? per : m - per * (count - 1)
    const a = rot + (j * TAU) / count
    petal(shape, k, length, width, a, -radius * Math.sin(a), radius * Math.cos(a), color, roundness, edge)
  }
}

export function tulip(n: number): Shape {
  const shape: Shape = { pts: [], cols: [] }
  const col = pick<RGB>([[1, 0.12, 0.2], [1, 0.35, 0.65], [0.75, 0.3, 1], [1, 0.55, 0.1], [1, 0.9, 0.2]])
  const nh = Math.floor(n * 0.72)
  const k = Math.floor(nh / 3)
  petal(shape, k, 1.35, 0.42, 0, 0, -0.55, col, 0.55)
  petal(shape, k, 1.25, 0.4, 0.32, 0.05, -0.5, col, 0.55)
  petal(shape, nh - 2 * k, 1.25, 0.4, -0.32, -0.05, -0.5, col, 0.55)
  greenParts(shape, n - nh, -0.5)
  return shape
}

export function sunflower(n: number): Shape {
  const shape: Shape = { pts: [], cols: [] }
  const nh = Math.floor(n * 0.75)
  const nc = Math.floor(nh * 0.28)
  for (let i = 0; i < nc; i++) {
    const f = (i + 0.5) / nc
    const r = 0.36 * Math.sqrt(f)
    const th = (i + 0.5) * 2.399963
    push(shape, r * Math.cos(th), r * Math.sin(th), f < 0.6 ? [0.85, 0.4, 0.05] : [1, 0.55, 0.1])
  }
  ring(shape, nh - nc, 18, 0.72, 0.13, 0.36, rand(0, TAU), [1, 0.82, 0.08], 0.7, 0.85)
  greenParts(shape, n - nh, -1.05)
  return shape
}

export function rose(n: number): Shape {
  const shape: Shape = { pts: [], cols: [] }
  const col = pick<RGB>([[1, 0.05, 0.15], [1, 0.3, 0.5], [0.9, 0, 0.3]])
  const nh = Math.floor(n * 0.72)
  const nsp = Math.floor(nh * 0.28)
  const nin = Math.floor(nh * 0.3)
  const nout = nh - nsp - nin
  const dark: RGB = [col[0] * 0.85, col[1] * 0.85, col[2] * 0.85]
  for (let i = 0; i < nsp; i++) {
    const th = rand(0, 5 * Math.PI)
    const r = (0.34 * th) / (5 * Math.PI)
    push(shape, r * Math.cos(th) + gauss(0.01), r * Math.sin(th) * 0.9 + gauss(0.01), dark)
  }
  const rot = rand(0, TAU)
  ring(shape, nin, 5, 0.42, 0.26, 0.2, rot + Math.PI / 5, col, 0.4, 0.9)
  const light: RGB = [Math.min(1, col[0] * 1.1 + 0.05), Math.min(1, col[1] * 1.1 + 0.05), Math.min(1, col[2] * 1.1 + 0.05)]
  ring(shape, nout, 5, 0.6, 0.4, 0.38, rot, light, 0.4, 0.9)
  greenParts(shape, n - nh, -0.95)
  return shape
}

export function lily(n: number): Shape {
  const shape: Shape = { pts: [], cols: [] }
  const nh = Math.floor(n * 0.75)
  const nst = Math.floor(nh * 0.14)
  const npet = nh - nst
  const rot = rand(0, TAU)
  const per = Math.floor(npet / 6)
  const petalShape: Shape = { pts: [], cols: [] }
  for (let j = 0; j < 6; j++) {
    const m = j < 5 ? per : npet - per * 5
    const a = rot + (j * Math.PI) / 3
    petal(petalShape, m, 1.0, 0.2, a, -0.06 * Math.sin(a), 0.06 * Math.cos(a), [1, 1, 1], 1.1, 0.85)
  }
  // curl the petal tips a little and colour the throat pale green, with a few pink blushes
  for (let i = 0; i < petalShape.pts.length; i += 2) {
    const x = petalShape.pts[i], y = petalShape.pts[i + 1]
    const r = Math.hypot(x, y)
    const bend = 0.22 * r * r
    const c = Math.cos(bend), s = Math.sin(bend)
    const color: RGB = Math.random() < 0.05 ? [1, 0.75, 0.85] : r < 0.3 ? [0.8, 1, 0.55] : [1, 1, 1]
    push(shape, x * c - y * s, x * s + y * c, color, 0.06)
  }
  const nfil = Math.floor(nst * 0.6)
  for (let i = 0; i < nfil; i++) {
    const a = rot + Math.PI / 6 + Math.floor(Math.random() * 6) * (Math.PI / 3) + gauss(0.03)
    const r = rand(0.05, 0.55)
    push(shape, -r * Math.sin(a), r * Math.cos(a), [0.7, 0.95, 0.5])
  }
  for (let i = nfil; i < nst; i++) {
    const a = rot + Math.PI / 6 + Math.floor(Math.random() * 6) * (Math.PI / 3)
    push(shape, -0.58 * Math.sin(a) + gauss(0.025), 0.58 * Math.cos(a) + gauss(0.025), [1, 0.45, 0.05])
  }
  greenParts(shape, n - nh, -0.95)
  return shape
}

export const FLOWER_SHAPES: Record<Exclude<BurstType, 'circle'>, (n: number) => Shape> = {
  tulip, sunflower, rose, lily,
}

/** Shuffle bag: every burst type appears once per round in random order, never twice in a row. */
export class ShuffleBag<T> {
  private bag: T[] = []
  private last: T | undefined
  constructor(private items: T[]) {}

  next(): T {
    if (this.bag.length === 0) {
      this.bag = [...this.items]
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]
      }
      // bag pops from the end: make sure the first pick isn't the previous one
      if (this.bag.length > 1 && this.bag[this.bag.length - 1] === this.last) {
        ;[this.bag[0], this.bag[this.bag.length - 1]] = [this.bag[this.bag.length - 1], this.bag[0]]
      }
    }
    this.last = this.bag.pop()!
    return this.last
  }
}
