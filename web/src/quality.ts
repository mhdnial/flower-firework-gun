// Picks a performance tier so phones and older laptops stay smooth.

export interface Quality {
  lowPower: boolean
  dprCap: number
  sparks: number
  maxParticles: number
}

export function detectQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency || 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const lowPower = coarse || cores <= 4 || memory <= 4

  let sparks = lowPower ? 480 : 800
  if (reducedMotion) sparks = Math.round(sparks * 0.5)
  return {
    lowPower,
    dprCap: lowPower ? 1.5 : 2,
    sparks,
    maxParticles: lowPower ? 3500 : 6000,
  }
}
