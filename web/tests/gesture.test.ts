import { describe, expect, it } from 'vitest'
import { GestureTracker, type HandInput, type Point } from '../src/gesture'

// Builds a 21-point hand (screen px, y down) pointing right, like a finger gun seen from the side.
function hand(opts: { indexOut?: boolean; othersCurled?: boolean; thumbUp?: boolean; handedness?: string; gesture?: string }): HandInput {
  const { indexOut = true, othersCurled = true, thumbUp = true } = opts
  const p: Point[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }))
  const set = (i: number, x: number, y: number) => (p[i] = { x, y })
  set(0, 0, 0) // wrist
  // thumb: up (far from index MCP) or pressed down onto it
  set(1, 20, -20); set(2, 35, -40); set(3, 45, -60)
  set(4, thumbUp ? 50 : 95, thumbUp ? -85 : -52)
  // index: MCP, PIP, DIP, TIP
  set(5, 100, -50)
  if (indexOut) { set(6, 140, -50); set(7, 170, -50); set(8, 200, -50) }
  else { set(6, 130, -30); set(7, 115, -10); set(8, 95, -20) }
  // middle / ring / pinky
  const finger = (mcp: number, y: number) => {
    set(mcp, 100, y)
    if (othersCurled) { set(mcp + 1, 135, y + 10); set(mcp + 2, 120, y + 30); set(mcp + 3, 100, y + 25) }
    else { set(mcp + 1, 140, y); set(mcp + 2, 170, y); set(mcp + 3, 200, y) }
  }
  finger(9, -20); finger(13, 5); finger(17, 25)
  return { points: p, handedness: opts.handedness ?? 'Right', gesture: opts.gesture }
}

function run(t: GestureTracker, frames: HandInput[][], start = 0, step = 33) {
  const shots = []
  let now = start
  for (const f of frames) {
    shots.push(...t.update(f, now).shots)
    now += step
  }
  return { shots, now }
}

describe('GestureTracker', () => {
  it('fires once when the thumb snaps down while holding a finger gun', () => {
    const t = new GestureTracker()
    const cocked = Array.from({ length: 8 }, () => [hand({})])
    const clicked = Array.from({ length: 6 }, () => [hand({ thumbUp: false })])
    const { shots } = run(t, [...cocked, ...clicked])
    expect(shots).toHaveLength(1)
    expect(shots[0].x).toBe(200)
    expect(shots[0].dx).toBeCloseTo(1)
    expect(shots[0].dy).toBeCloseTo(0)
  })

  it('does not fire again until the thumb is lifted', () => {
    const t = new GestureTracker()
    const frames = [
      ...Array.from({ length: 8 }, () => [hand({})]),
      ...Array.from({ length: 20 }, () => [hand({ thumbUp: false })]),
    ]
    expect(run(t, frames).shots).toHaveLength(1)
  })

  it('does not fire with an open hand or pointing without curled fingers', () => {
    const t = new GestureTracker()
    const frames = [
      ...Array.from({ length: 8 }, () => [hand({ othersCurled: false })]),
      ...Array.from({ length: 6 }, () => [hand({ othersCurled: false, thumbUp: false })]),
    ]
    expect(run(t, frames).shots).toHaveLength(0)
  })

  it('respects the MediaPipe Open_Palm veto', () => {
    const t = new GestureTracker()
    const frames = [
      ...Array.from({ length: 8 }, () => [{ ...hand({}), gesture: 'Open_Palm', gestureScore: 0.9 }]),
      ...Array.from({ length: 6 }, () => [{ ...hand({ thumbUp: false }), gesture: 'Open_Palm', gestureScore: 0.9 }]),
    ]
    expect(run(t, frames).shots).toHaveLength(0)
  })

  it('tracks both hands independently, even when their order swaps', () => {
    const t = new GestureTracker()
    const left = (thumbUp: boolean) => hand({ handedness: 'Left', thumbUp })
    const right = (thumbUp: boolean) => hand({ handedness: 'Right', thumbUp })
    const frames: HandInput[][] = []
    for (let i = 0; i < 8; i++) frames.push(i % 2 ? [left(true), right(true)] : [right(true), left(true)])
    // both click, with the order swapping every frame
    for (let i = 0; i < 6; i++) frames.push(i % 2 ? [left(false), right(false)] : [right(false), left(false)])
    const { shots } = run(t, frames)
    expect(shots.map((s) => s.slot).sort()).toEqual([0, 1])
  })
})
