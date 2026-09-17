// Sound effects synthesized in the browser (port of gen_sounds.py) — zero download.
//   shoot: launch thump + whoosh + rising whistle
//   boom:  sub boom + blast + crack + crackle tail with echo (3 random variations)

const SR = 32000

function lowpass(x: Float32Array, cutoff: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * cutoff) / SR)
  const y = new Float32Array(x.length)
  let acc = 0
  for (let i = 0; i < x.length; i++) {
    acc = (1 - a) * x[i] + a * acc
    y[i] = acc
  }
  return y
}

function noise(n: number): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const u = 1 - Math.random()
    out[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random())
  }
  return out
}

function finish(x: Float32Array, peak: number): Float32Array {
  const t = Math.tanh(1.4)
  let max = 1e-6
  for (let i = 0; i < x.length; i++) {
    x[i] = Math.tanh(1.4 * x[i]) / t
    max = Math.max(max, Math.abs(x[i]))
  }
  const fade = Math.min(x.length, Math.floor(0.01 * SR))
  for (let i = 0; i < x.length; i++) {
    x[i] = (x[i] / max) * peak
    const fromEnd = x.length - 1 - i
    if (fromEnd < fade) x[i] *= fromEnd / fade
  }
  return x
}

export function synthShoot(): Float32Array {
  const dur = 0.9
  const n = Math.floor(dur * SR)
  const out = new Float32Array(n)
  const nz = noise(n)
  const low = lowpass(nz, 900)
  let ph1 = 0, ph2 = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const f1 = 60 + 90 * Math.exp(-t * 30)
    ph1 += (2 * Math.PI * f1) / SR
    const thump = Math.sin(ph1) * Math.exp(-t * 35)
    const whoosh = (nz[i] - low[i]) * Math.min(t / 0.02, 1) * Math.exp(-t * 4.5) * 0.35
    const fw = 1300 + 1700 * Math.pow(t / dur, 0.6) + 25 * Math.sin(2 * Math.PI * 11 * t)
    ph2 += (2 * Math.PI * fw) / SR
    const whistle = Math.sin(ph2) * Math.min(t / 0.04, 1) * Math.exp(-t * 2.8) * 0.22
    out[i] = thump * 0.9 + whoosh + whistle
  }
  return finish(out, 0.8)
}

export function synthBoom(): Float32Array {
  const dur = 2.8
  const n = Math.floor(dur * SR)
  const nz = noise(n)
  const blastSrc = lowpass(nz, 450 + Math.random() * 350)
  const dry = new Float32Array(n)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const att = Math.min(t / 0.003, 1)
    ph += (2 * Math.PI * (32 + 45 * Math.exp(-t * 2))) / SR
    const sub = Math.sin(ph) * Math.exp(-t * 3.2) * att
    const blast = blastSrc[i] * 6 * Math.exp(-t * 5.5) * att
    const crack = nz[i] * Math.exp(-t * 30) * 0.35 * att
    dry[i] = sub * 0.9 + blast + crack
  }
  // crackle tail
  const pops = 110 + Math.floor(Math.random() * 60)
  for (let p = 0; p < pops; p++) {
    const start = 0.3 + 2.1 * Math.pow(Math.random(), 1.7)
    const i0 = Math.floor(start * SR)
    const len = Math.floor((0.002 + Math.random() * 0.007) * SR)
    if (i0 + len >= n) continue
    const amp = (0.08 + Math.random() * 0.27) * Math.exp(-(start - 0.3) * 0.9)
    for (let k = 0; k < len; k++) {
      const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (len - 1))
      dry[i0 + k] += nz[(i0 * 7 + k) % n] * win * amp
    }
  }
  // cheap echo
  const wet = new Float32Array(n)
  for (const [delay, gain] of [[0.07, 0.3], [0.13, 0.2], [0.21, 0.13], [0.33, 0.08]]) {
    const d = Math.floor(delay * SR)
    for (let i = d; i < n; i++) wet[i] += dry[i - d] * gain
  }
  const wetLow = lowpass(wet, 2500)
  for (let i = 0; i < n; i++) dry[i] += wetLow[i]
  return finish(dry, 0.95)
}

export class SoundFx {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private shoot: AudioBuffer | null = null
  private booms: AudioBuffer[] = []
  private muted = false
  volume = 0.9

  /** Must be called from a user gesture (tap/click) so mobile browsers allow audio. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctx({ latencyHint: 'interactive' })
      this.gain = this.ctx.createGain()
      this.gain.connect(this.ctx.destination)
      this.applyGain()
      this.buildBuffers()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private toBuffer(data: Float32Array): AudioBuffer {
    const buf = this.ctx!.createBuffer(1, data.length, SR)
    buf.getChannelData(0).set(data)
    return buf
  }

  private buildBuffers() {
    this.shoot = this.toBuffer(synthShoot())
    // spread the heavier explosion synthesis over a few frames so startup stays smooth
    let k = 0
    const step = () => {
      this.booms.push(this.toBuffer(synthBoom()))
      if (++k < 3) setTimeout(step, 30)
    }
    setTimeout(step, 30)
  }

  setMuted(m: boolean) {
    this.muted = m
    this.applyGain()
  }

  private applyGain() {
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02)
  }

  suspend() { void this.ctx?.suspend() }
  resume() { if (this.ctx?.state === 'suspended') void this.ctx.resume() }

  private play(buf: AudioBuffer | null | undefined, gain: number) {
    if (!this.ctx || !this.gain || !buf || this.muted) return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = 0.94 + Math.random() * 0.12
    const g = this.ctx.createGain()
    g.gain.value = gain
    src.connect(g).connect(this.gain)
    src.start()
  }

  playShoot() { this.play(this.shoot, 0.7) }
  playBoom() { this.play(this.booms[Math.floor(Math.random() * this.booms.length)], 1) }
}
