import { describe, expect, it } from 'vitest'
import { BURST_TYPES, FLOWER_SHAPES, ShuffleBag } from '../src/bursts'
import { Fireworks } from '../src/particles'

describe('ShuffleBag', () => {
  it('uses every burst type once per round and never repeats back to back', () => {
    const bag = new ShuffleBag(BURST_TYPES)
    let prev: string | undefined
    for (let round = 0; round < 200; round++) {
      const seen = new Set<string>()
      for (let i = 0; i < BURST_TYPES.length; i++) {
        const t = bag.next()
        expect(t).not.toBe(prev)
        seen.add(t)
        prev = t
      }
      expect(seen.size).toBe(BURST_TYPES.length)
    }
  })
})

describe('flower shapes', () => {
  for (const [name, fn] of Object.entries(FLOWER_SHAPES)) {
    it(`${name} returns matching points and colours near the flower size`, () => {
      const s = fn(800)
      expect(s.pts.length / 2).toBeGreaterThan(700)
      expect(s.cols.length / 3).toBe(s.pts.length / 2)
      for (const v of s.pts) expect(Math.abs(v)).toBeLessThan(2.2)
      for (const c of s.cols) expect(c).toBeGreaterThanOrEqual(0)
    })
  }
})

describe('Fireworks', () => {
  it('shoots, explodes and eventually clears all particles', () => {
    const fw = new Fireworks(6000)
    fw.resize(800, 600)
    const booms: string[] = []
    fw.onBoom = (t) => booms.push(t)
    fw.shoot(400, 500, 0, -1)
    let maxCount = 0
    for (let i = 0; i < 60 * 5; i++) {
      fw.update(1 / 60)
      maxCount = Math.max(maxCount, fw.count)
    }
    expect(booms).toHaveLength(1)
    expect(maxCount).toBeGreaterThan(300)
    expect(fw.count).toBe(0)
  })
})
