import './styles.css'
import { SoundFx } from './audio'
import { GestureTracker, type HandView } from './gesture'
import { MusicPlayer } from './music'
import { Fireworks, STRIDE } from './particles'
import { detectQuality } from './quality'
import { createRenderer } from './render'
import type { HandTracker } from './tracking'

// ---------------------------------------------------------------- helpers
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

function setIcon(btn: HTMLElement, icon: string) {
  btn.querySelector('use')!.setAttribute('href', `#${icon}`)
}

const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(`fw:${key}`)
      return v === null ? fallback : (JSON.parse(v) as T)
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`fw:${key}`, JSON.stringify(value))
    } catch {
      /* storage unavailable: settings just won't persist */
    }
  },
}

let toastTimer = 0
function toast(text: string, ms = 3500) {
  const el = $('toast')
  el.textContent = text
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (el.hidden = true), ms)
}

// ---------------------------------------------------------------- core objects
const quality = detectQuality()
const stage = $('stage')
const video = $<HTMLVideoElement>('camera')
const canvas = $<HTMLCanvasElement>('fx')
const renderer = createRenderer(canvas)
const fireworks = new Fireworks(quality.maxParticles, { sparks: quality.sparks })
const gestures = new GestureTracker()
const sfx = new SoundFx()
let tracker: HandTracker | null = null
let views: HandView[] = []
let viewsAt = 0

fireworks.onShoot = () => sfx.playShoot()
fireworks.onBoom = () => sfx.playBoom()

function resize() {
  const w = stage.clientWidth
  const h = stage.clientHeight
  renderer.resize(w, h, Math.min(window.devicePixelRatio || 1, quality.dprCap))
  fireworks.resize(w, h)
}
new ResizeObserver(resize).observe(stage)
resize()

// ---------------------------------------------------------------- render loop
let last = performance.now()
let raf = 0
function frame(now: number) {
  const dt = (now - last) / 1000
  last = now
  let n = fireworks.update(dt)

  // fingertip indicators: soft dot, yellow when the gun sign is held, pulsing pink when cocked
  if (now - viewsAt < 250) {
    const out = fireworks.out
    const U = fireworks.unit
    for (const v of views) {
      const o = n * STRIDE
      const pulse = 0.75 + 0.25 * Math.sin(now / 90)
      const [r, g, b] = v.cocked ? [1 * pulse, 0.3 * pulse, 0.6 * pulse] : v.gun ? [0.9, 0.75, 0.2] : [0.25, 0.25, 0.3]
      out[o] = v.tip.x
      out[o + 1] = v.tip.y
      out[o + 2] = U * (v.cocked ? 0.03 : 0.022)
      out[o + 3] = r
      out[o + 4] = g
      out[o + 5] = b
      n++
    }
  }
  renderer.draw(fireworks.out, n)
  raf = requestAnimationFrame(frame)
}
raf = requestAnimationFrame(frame)

// ---------------------------------------------------------------- HUD
const hud = $('hud')
let hudOn = store.get('hud', false)
const chkHud = $<HTMLInputElement>('chk-hud')
chkHud.checked = hudOn
chkHud.addEventListener('change', () => {
  hudOn = chkHud.checked
  store.set('hud', hudOn)
  hud.hidden = !hudOn
})

function updateHud(handCount: number) {
  if (!hudOn) return
  hud.hidden = false
  const lines = views.map((v) => {
    const side = v.tip.x < stage.clientWidth / 2 ? 'LEFT ' : 'RIGHT'
    return `${side} ${v.gun ? 'GUN ON ' : 'gun off'}${v.cocked ? ' COCKED' : '       '} thumb ${v.thumb.toFixed(2)}`
  })
  hud.textContent = [`hands ${handCount}  particles ${fireworks.count}  ${renderer.kind}`, ...lines].join('\n')
}

// ---------------------------------------------------------------- start / demo
const startOverlay = $('start')
const startBtn = $<HTMLButtonElement>('btn-start')
const startStatus = $('start-status')

const ERRORS: Record<string, string> = {
  denied: 'Camera permission was blocked. Allow camera access in your browser settings and try again.',
  'no-camera': 'No camera found on this device. You can still try demo mode.',
  insecure: 'The camera only works on a secure (https) page.',
  model: 'Could not download hand tracking. Check your connection and try again.',
  unknown: 'Could not start the camera. Try again, or use demo mode.',
}

startBtn.addEventListener('click', async () => {
  sfx.unlock()
  startBtn.disabled = true
  startStatus.textContent = 'Starting…'
  try {
    const { HandTracker } = await import('./tracking')
    tracker ??= new HandTracker({
      video,
      lowPower: quality.lowPower,
      onStatus: (t) => (startStatus.textContent = t),
      onHands: (hands, now) => {
        const res = gestures.update(hands, now)
        views = res.views
        viewsAt = performance.now()
        for (const s of res.shots) fireworks.shoot(s.x, s.y, s.dx, s.dy)
        updateHud(hands.length)
      },
    })
    await tracker.start()
    video.classList.add('live')
    enterStage()
    toast('Make a finger gun 👉 then snap your thumb down')
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'unknown'
    startStatus.textContent = ERRORS[code] ?? ERRORS.unknown
    startBtn.disabled = false
    startBtn.textContent = 'Try again'
  }
})

let demoTimer = 0
$('btn-demo').addEventListener('click', () => {
  sfx.unlock()
  enterStage()
  toast('Demo mode — press Space or double-tap to shoot')
  const auto = () => {
    if (!document.hidden) testShot()
    demoTimer = window.setTimeout(auto, 1800 + Math.random() * 1400)
  }
  clearTimeout(demoTimer)
  demoTimer = window.setTimeout(auto, 600)
})

// ---------------------------------------------------------------- exit to home
const exitBtn = $<HTMLButtonElement>('btn-exit')

function enterStage() {
  startOverlay.hidden = true
  exitBtn.hidden = false
}

/** Back to the start screen, as when the page first opened. */
function exitToHome() {
  clearTimeout(demoTimer)
  music.pause()
  tracker?.stop()
  video.srcObject = null
  video.classList.remove('live')
  views = []
  viewsAt = 0
  fireworks.clear()
  hud.hidden = true
  $('toast').hidden = true
  help.hidden = true
  if (document.fullscreenElement) void document.exitFullscreen()
  exitBtn.hidden = true
  startBtn.disabled = false
  startBtn.textContent = 'Start camera'
  startStatus.textContent = ''
  startOverlay.hidden = false
  startBtn.focus()
}
exitBtn.addEventListener('click', exitToHome)

function testShot(x?: number, y?: number) {
  const w = stage.clientWidth, h = stage.clientHeight
  const sx = x ?? w * (0.2 + Math.random() * 0.6)
  const sy = y ?? h * 0.85
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.5
  fireworks.shoot(sx, sy, Math.cos(angle), Math.sin(angle))
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && startOverlay.hidden && !(e.target instanceof HTMLInputElement)) {
    e.preventDefault()
    sfx.unlock()
    testShot()
  }
})
stage.addEventListener('dblclick', (e) => {
  if (!startOverlay.hidden) return
  sfx.unlock()
  testShot(e.clientX, stage.clientHeight * 0.85)
})

// ---------------------------------------------------------------- sound effects button
const sfxBtn = $<HTMLButtonElement>('btn-sfx')
let sfxMuted = store.get('sfxMuted', false)
function renderSfx() {
  sfx.setMuted(sfxMuted)
  setIcon(sfxBtn, sfxMuted ? 'i-sfx-off' : 'i-sfx-on')
  sfxBtn.setAttribute('aria-pressed', String(!sfxMuted))
  sfxBtn.setAttribute('aria-label', sfxMuted ? 'Sound effects off' : 'Sound effects on')
}
sfxBtn.addEventListener('click', () => {
  sfx.unlock()
  sfxMuted = !sfxMuted
  store.set('sfxMuted', sfxMuted)
  renderSfx()
  toast(sfxMuted ? 'Sound effects muted' : 'Sound effects on', 1500)
})
renderSfx()

// ---------------------------------------------------------------- fullscreen + help
const fullBtn = $('btn-full')
if (document.fullscreenEnabled) {
  fullBtn.hidden = false
  fullBtn.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => undefined)
  })
}
const help = $('help')
$('btn-help').addEventListener('click', () => (help.hidden = false))
$('btn-help-close').addEventListener('click', () => (help.hidden = true))
help.addEventListener('click', (e) => {
  if (e.target === help) help.hidden = true
})
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') help.hidden = true
})

// ---------------------------------------------------------------- music player
const music = new MusicPlayer(store.get('musicVolume', 0.7), store.get('musicMuted', false))
const playBtn = $<HTMLButtonElement>('btn-play')
const nextBtn = $<HTMLButtonElement>('btn-next')
const prevBtn = $<HTMLButtonElement>('btn-prev')
const muteBtn = $<HTMLButtonElement>('btn-music-mute')
const volume = $<HTMLInputElement>('volume')

music.onChange((s) => {
  const has = s.tracks.length > 0
  for (const b of [playBtn, nextBtn, prevBtn, muteBtn]) b.disabled = !has
  volume.disabled = !has
  const t = s.tracks[s.index]
  $('track-title').textContent = t ? t.title : 'No music yet'
  $('track-artist').textContent = t?.artist ?? ''
  setIcon(playBtn, s.playing ? 'i-pause' : 'i-play')
  playBtn.setAttribute('aria-label', s.playing ? 'Pause music' : 'Play music')
  setIcon(muteBtn, s.muted ? 'i-music-off' : 'i-music-on')
  muteBtn.setAttribute('aria-pressed', String(s.muted))
  muteBtn.setAttribute('aria-label', s.muted ? 'Unmute music' : 'Mute music')
  volume.value = String(s.volume)
})
playBtn.addEventListener('click', () => music.toggle())
nextBtn.addEventListener('click', () => music.next())
prevBtn.addEventListener('click', () => music.prev())
muteBtn.addEventListener('click', () => {
  const m = !music.state.muted
  music.setMuted(m)
  store.set('musicMuted', m)
})
volume.addEventListener('input', () => {
  music.setVolume(Number(volume.value))
  store.set('musicVolume', Number(volume.value))
})
void music.load(`${import.meta.env.BASE_URL}music/playlist.json`)

// ---------------------------------------------------------------- pause when hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(raf)
    tracker?.pause()
    sfx.suspend()
  } else {
    last = performance.now()
    raf = requestAnimationFrame(frame)
    tracker?.resume()
    sfx.resume()
  }
})

// ---------------------------------------------------------------- offline cache for repeat visits
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'))
}
