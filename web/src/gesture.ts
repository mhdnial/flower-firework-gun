// Finger-gun + thumb-click detection for up to two hands.
// Port of gesture.py from the TouchDesigner project.
//
// Hands are kept in stable slots by MediaPipe handedness ('Left' = 0, 'Right' = 1), so the
// order of hands in the result swapping between frames does not mix up their state.
// Points are in screen pixels (x right, y down); all tests are ratios so the scale doesn't matter.

export interface Point { x: number; y: number }

export interface HandInput {
  /** 21 landmarks in screen pixels */
  points: Point[]
  /** MediaPipe handedness label, e.g. 'Left' / 'Right' */
  handedness?: string
  /** top canned gesture from MediaPipe, e.g. 'Open_Palm' */
  gesture?: string
  gestureScore?: number
}

export interface GestureSettings {
  openThreshold: number
  clickThreshold: number
  extendRatio: number
  cooldownMs: number
  holdFrames: number
}

export interface Shot {
  slot: number
  x: number
  y: number
  /** unit direction the index finger points (screen space) */
  dx: number
  dy: number
}

export interface HandView {
  slot: number
  gun: boolean
  cocked: boolean
  thumb: number
  tip: Point
}

export const DEFAULT_SETTINGS: GestureSettings = {
  openThreshold: 0.55,
  clickThreshold: 0.38,
  extendRatio: 1.1,
  cooldownMs: 250,
  holdFrames: 4,
}

const WRIST = 0, THUMB_TIP = 4, INDEX_MCP = 5, INDEX_PIP = 6, INDEX_TIP = 8
const MIDDLE_MCP = 9, MIDDLE_PIP = 10, MIDDLE_TIP = 12
const RING_PIP = 14, RING_TIP = 16, PINKY_PIP = 18, PINKY_TIP = 20
const SLOT_BY_LABEL: Record<string, number> = { Left: 0, Right: 1 }
const VETO = new Set(['Open_Palm', 'Victory', 'ILoveYou'])
const NSLOTS = 2

interface SlotState {
  gunFrames: number
  armed: boolean
  thumb: number | null
  lastFire: number
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export class GestureTracker {
  settings: GestureSettings
  private slots: SlotState[]

  constructor(settings: Partial<GestureSettings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings }
    this.slots = Array.from({ length: NSLOTS }, () => ({ gunFrames: 0, armed: false, thumb: null, lastFire: -Infinity }))
  }

  /** Map result index -> slot, resolving duplicate handedness labels. */
  private assignSlots(hands: HandInput[]): number[] {
    const used = new Set<number>()
    return hands.slice(0, NSLOTS).map((h, i) => {
      let slot = SLOT_BY_LABEL[h.handedness ?? ''] ?? i
      if (used.has(slot)) slot = [0, 1].find((s) => !used.has(s))!
      used.add(slot)
      return slot
    })
  }

  /**
   * Process one detection frame. `now` is in milliseconds.
   * Returns shots fired this frame and a per-hand view for UI feedback.
   */
  update(hands: HandInput[], now: number): { shots: Shot[]; views: HandView[] } {
    const s = this.settings
    const shots: Shot[] = []
    const views: HandView[] = []
    const seen = new Set<number>()
    const slots = this.assignSlots(hands)

    slots.forEach((slot, hi) => {
      const p = hands[hi].points
      if (!p || p.length < 21) return
      seen.add(slot)
      const st = this.slots[slot]
      const w = p[WRIST]
      const size = Math.max(dist(w, p[MIDDLE_MCP]), 1e-4)
      const ratio = (tip: number, pip: number) => dist(w, p[tip]) / Math.max(dist(w, p[pip]), 1e-4)

      const veto = !!hands[hi].gesture && VETO.has(hands[hi].gesture!) && (hands[hi].gestureScore ?? 0) > 0.5
      const indexOut = ratio(INDEX_TIP, INDEX_PIP) > s.extendRatio && dist(p[INDEX_MCP], p[INDEX_TIP]) > size * 0.55
      const othersIn = ratio(MIDDLE_TIP, MIDDLE_PIP) < 0.98 && ratio(RING_TIP, RING_PIP) < 0.98 && ratio(PINKY_TIP, PINKY_PIP) < 0.98
      const isGun = indexOut && othersIn && !veto
      st.gunFrames = isGun ? st.gunFrames + 1 : Math.max(0, st.gunFrames - 2)
      const gunOk = st.gunFrames >= s.holdFrames

      const rawThumb = dist(p[THUMB_TIP], p[INDEX_MCP]) / size
      st.thumb = st.thumb === null ? rawThumb : st.thumb * 0.4 + rawThumb * 0.6
      const thumb = st.thumb

      if (gunOk && thumb > s.openThreshold) st.armed = true
      if (st.gunFrames === 0) st.armed = false

      if (st.armed && gunOk && thumb < s.clickThreshold && now - st.lastFire > s.cooldownMs) {
        st.armed = false
        st.lastFire = now
        let dx = p[INDEX_TIP].x - p[INDEX_MCP].x
        let dy = p[INDEX_TIP].y - p[INDEX_MCP].y
        const n = Math.hypot(dx, dy) || 1
        dx /= n
        dy /= n
        shots.push({ slot, x: p[INDEX_TIP].x, y: p[INDEX_TIP].y, dx, dy })
      }

      views.push({ slot, gun: gunOk, cocked: st.armed && gunOk, thumb, tip: p[INDEX_TIP] })
    })

    for (let i = 0; i < NSLOTS; i++) {
      if (!seen.has(i)) Object.assign(this.slots[i], { gunFrames: 0, armed: false, thumb: null })
    }
    return { shots, views }
  }
}
