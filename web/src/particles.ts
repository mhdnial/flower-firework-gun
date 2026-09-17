// Particle system: bullets with trails that burst into flowers or a classic circle.
// Port of fireworks.py. Works in screen pixels (y down); sizes/speeds scale with U = min(w, h) / 2,
// which matches the TouchDesigner version where the screen height was 2 units.

import { BURST_TYPES, FLOWER_SHAPES, ShuffleBag, type BurstType } from './bursts'

const Kind = { Bullet: 0, Trail: 1, Spark: 2, Crackle: 3, Flower: 4 } as const
type Kind = (typeof Kind)[keyof typeof Kind]

export interface FireworkSettings {
  bulletSpeed: number
  fuse: number
  sparks: number
  flowerSize: number
  gravity: number
  drag: number
  sparkSize: number
}

export const DEFAULT_FIREWORK: FireworkSettings = {
  bulletSpeed: 2.6,
  fuse: 0.55,
  sparks: 800,
  flowerSize: 0.42,
  gravity: 0.6,
  drag: 1.4,
  sparkSize: 0.012,
}

/** Interleaved per-particle render data: x, y, radius, r, g, b */
export const STRIDE = 6

const TAU = Math.PI * 2
const rand = (a = 0, b = 1) => a + Math.random() * (b - a)
const gauss = (sd: number) => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random()) * sd
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function hsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6), f = h * 6 - i
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s)
  switch (((i % 6) + 6) % 6) {
    case 0: return [v, t, p]
    case 1: return [q, v, p]
    case 2: return [p, v, t]
    case 3: return [p, q, v]
    case 4: return [t, p, v]
    default: return [v, p, q]
  }
}

export class Fireworks {
  settings: FireworkSettings
  readonly max: number
  count = 0
  width = 1
  height = 1
  onShoot?: () => void
  onBoom?: (type: BurstType) => void

  private x: Float32Array; private y: Float32Array
  private vx: Float32Array; private vy: Float32Array
  private life: Float32Array; private maxLife: Float32Array
  private r: Float32Array; private g: Float32Array; private b: Float32Array
  private size: Float32Array
  private kind: Uint8Array
  private bag = new ShuffleBag<BurstType>(BURST_TYPES)
  readonly out: Float32Array

  constructor(max = 6000, settings: Partial<FireworkSettings> = {}) {
    this.max = max
    this.settings = { ...DEFAULT_FIREWORK, ...settings }
    this.x = new Float32Array(max); this.y = new Float32Array(max)
    this.vx = new Float32Array(max); this.vy = new Float32Array(max)
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max)
    this.r = new Float32Array(max); this.g = new Float32Array(max); this.b = new Float32Array(max)
    this.size = new Float32Array(max)
    this.kind = new Uint8Array(max)
    // a few spare slots so the app can append fingertip indicators after the particles
    this.out = new Float32Array((max + 8) * STRIDE)
  }

  get unit() { return Math.min(this.width, this.height) / 2 }

  /** Remove every particle (e.g. when leaving the stage). */
  clear() {
    this.count = 0
  }

  resize(w: number, h: number) {
    this.width = w
    this.height = h
  }

  private spawn(x: number, y: number, vx: number, vy: number, life: number,
    r: number, g: number, b: number, size: number, kind: Kind) {
    if (this.count >= this.max) return
    const i = this.count++
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy
    this.life[i] = life; this.maxLife[i] = life
    this.r[i] = r; this.g[i] = g; this.b[i] = b
    this.size[i] = size; this.kind[i] = kind
  }

  /** Fire a bullet from (x, y) in screen pixels along unit direction (dx, dy). */
  shoot(x: number, y: number, dx: number, dy: number) {
    const U = this.unit, S = this.settings
    const speed = S.bulletSpeed * U
    this.spawn(x, y, dx * speed, dy * speed, S.fuse, 1, 0.95, 0.8, S.sparkSize * 2.2 * U, Kind.Bullet)
    const base = Math.atan2(dy, dx)
    for (let i = 0; i < 25; i++) {
      const a = base + rand(-0.5, 0.5)
      const v = rand(0.2, 0.9) * U
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.1, 0.3), 1, 0.8, 0.4, rand(0.5, 1) * S.sparkSize * U, Kind.Trail)
    }
    this.onShoot?.()
  }

  private explode(x: number, y: number) {
    const U = this.unit, S = this.settings
    const type = this.bag.next()
    this.onBoom?.(type)
    this.spawn(x, y, 0, 0, 0.15, 0.8, 0.8, 0.8, S.sparkSize * 5 * U, Kind.Crackle)
    const drag = Math.max(S.drag, 0.3)

    if (type === 'circle') {
      const n = Math.floor(S.sparks * 0.5)
      const radius = S.flowerSize * 1.15 * rand(0.9, 1.15) * U
      const speed = (radius * drag) / (1 - Math.exp(-drag))
      const hue = Math.random()
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU)
        const rr = Math.random() < 0.5 ? rand(0.9, 1) : Math.sqrt(Math.random())
        let [r, g, b] = hsv((hue + rand(-0.05, 0.05) + 1) % 1, rand(0.55, 1), 1)
        if (Math.random() < 0.12) r = g = b = 1
        this.spawn(x, y, Math.cos(a) * rr * speed, Math.sin(a) * rr * speed, rand(1.7, 2.5),
          r, g, b, rand(0.7, 1.2) * S.sparkSize * U, Kind.Spark)
      }
      return
    }

    const shape = FLOWER_SHAPES[type](S.sparks)
    const scale = S.flowerSize * rand(0.85, 1.15) * U
    const tilt = rand(-0.25, 0.25)
    const c = Math.cos(tilt), s = Math.sin(tilt)
    // with exponential drag a spark travels vel/drag in total: aim it at its target point in ~1.2 s
    const k = drag / (1 - Math.exp(-drag * 1.2))
    const m = shape.pts.length / 2
    for (let i = 0; i < m; i++) {
      const fx = shape.pts[2 * i], fy = shape.pts[2 * i + 1]
      const ox = (fx * c - fy * s) * scale + gauss(0.004 * U)
      const oy = -(fx * s + fy * c) * scale + gauss(0.004 * U) // flower units are y-up
      let r = shape.cols[3 * i] * 0.5, g = shape.cols[3 * i + 1] * 0.5, b = shape.cols[3 * i + 2] * 0.5
      if (Math.random() < 0.04) r = g = b = 0.9
      this.spawn(x, y, ox * k, oy * k, rand(1.9, 2.6), r, g, b, rand(0.45, 0.75) * S.sparkSize * U, Kind.Flower)
    }
  }

  /** Advance the simulation by dt seconds and fill `out`. Returns the number of particles to draw. */
  update(dtIn: number): number {
    const dt = Math.min(Math.max(dtIn, 0), 1 / 20)
    const U = this.unit, S = this.settings
    const grav = S.gravity * U
    const dragMul = Math.exp(-S.drag * dt)
    const fs = S.flowerSize * U
    const explosions: number[] = []

    // --- bullets: trails + fuse / off-screen check
    const n0 = this.count
    for (let i = 0; i < n0; i++) {
      if (this.kind[i] !== Kind.Bullet || this.life[i] <= 0) continue
      const x = this.x[i], y = this.y[i]
      const trail = Math.random() < (240 * dt) % 1 ? Math.ceil(240 * dt) : Math.floor(240 * dt)
      for (let t = 0; t < trail; t++) {
        this.spawn(x + gauss(0.004 * U), y + gauss(0.004 * U),
          gauss(0.05 * U) - this.vx[i] * 0.05, gauss(0.05 * U) - this.vy[i] * 0.05,
          rand(0.25, 0.5), 1, 0.65, 0.25, rand(0.4, 0.8) * S.sparkSize * U, Kind.Trail)
      }
      // explode early only when the bullet is heading out of the screen, so the flower stays visible
      const vx = this.vx[i], vy = this.vy[i]
      const off = (x < fs * 0.9 && vx < 0) || (x > this.width - fs * 0.9 && vx > 0) ||
        (y < fs * 1.05 && vy < 0) || y > this.height + 20
      if (this.life[i] <= dt || off) {
        explosions.push(
          Math.min(Math.max(x, fs), this.width - fs),
          Math.min(Math.max(y, fs * 1.1), this.height - 20),
        )
        this.life[i] = 0
      }
    }
    for (let e = 0; e < explosions.length; e += 2) this.explode(explosions[e], explosions[e + 1])

    // --- integrate, cull dead (swap-remove), crackle, write render buffer
    const out = this.out
    let o = 0
    let i = 0
    while (i < this.count) {
      const kind = this.kind[i]
      let life = this.life[i] - dt
      if (life <= 0) {
        const last = --this.count
        if (i !== last) this.copy(last, i)
        continue
      }
      this.life[i] = life
      const age = this.maxLife[i] - life
      if (kind === Kind.Bullet) {
        this.vy[i] += grav * 0.25 * dt
      } else {
        const g = kind === Kind.Flower ? grav * clamp01((age - 1.2) / 0.6) : grav
        this.vy[i] = (this.vy[i] + g * dt) * dragMul
        this.vx[i] *= dragMul
      }
      this.x[i] += this.vx[i] * dt
      this.y[i] += this.vy[i] * dt

      const k = life / this.maxLife[i]
      let fade = k, size = this.size[i]
      if (kind === Kind.Spark) { fade = Math.pow(k, 1.3) * (0.75 + 0.25 * Math.random()); size *= 0.4 + 0.6 * k }
      else if (kind === Kind.Flower) { const h = clamp01(k / 0.45); fade = Math.pow(h, 1.2) * (0.85 + 0.15 * Math.random()); size *= 0.5 + 0.5 * h }
      else if (kind === Kind.Crackle) size *= k
      else if (kind === Kind.Bullet) fade = 1

      if ((kind === Kind.Spark || kind === Kind.Flower) && life < 0.35 && Math.random() < 0.6 * dt) {
        this.spawn(this.x[i], this.y[i], gauss(0.15 * U), gauss(0.15 * U), rand(0.05, 0.15), 1, 1, 1, S.sparkSize * 0.8 * U, Kind.Crackle)
      }

      out[o++] = this.x[i]
      out[o++] = this.y[i]
      out[o++] = size
      out[o++] = this.r[i] * fade
      out[o++] = this.g[i] * fade
      out[o++] = this.b[i] * fade
      i++
    }
    return o / STRIDE
  }

  private copy(from: number, to: number) {
    this.x[to] = this.x[from]; this.y[to] = this.y[from]
    this.vx[to] = this.vx[from]; this.vy[to] = this.vy[from]
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from]
    this.r[to] = this.r[from]; this.g[to] = this.g[from]; this.b[to] = this.b[from]
    this.size[to] = this.size[from]; this.kind[to] = this.kind[from]
  }
}
