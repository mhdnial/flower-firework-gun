// Camera + MediaPipe hand tracking. MediaPipe (JS + WASM + model) is only downloaded when start()
// is called, i.e. after the user taps Start. WASM comes from jsDelivr and the model from Google's CDN;
// the service worker caches both so later visits load instantly.

import type { GestureRecognizer } from '@mediapipe/tasks-vision'
import type { HandInput } from './gesture'

const TASKS_VERSION = '1.0.1'
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

export type TrackingErrorCode = 'no-camera' | 'denied' | 'insecure' | 'model' | 'unknown'

export class TrackingError extends Error {
  constructor(public code: TrackingErrorCode, message: string) {
    super(message)
  }
}

export interface TrackerOptions {
  video: HTMLVideoElement
  /** smaller camera + slower detection for phones / low-end devices */
  lowPower: boolean
  onHands: (hands: HandInput[], now: number) => void
  onStatus?: (text: string) => void
}

export class HandTracker {
  private recognizer: GestureRecognizer | null = null
  private stream: MediaStream | null = null
  private running = false
  private lastRun = 0
  private lastVideoTime = -1
  private frameHandle = 0

  constructor(private opts: TrackerOptions) {}

  async start() {
    if (!window.isSecureContext) throw new TrackingError('insecure', 'Camera needs HTTPS')
    if (!navigator.mediaDevices?.getUserMedia) throw new TrackingError('no-camera', 'Camera not supported')

    this.opts.onStatus?.('Asking for camera…')
    const cameraReady = this.openCamera()
    // download the tracker in parallel with the camera permission prompt
    const trackerReady = this.recognizer ? Promise.resolve() : this.loadRecognizer()
    trackerReady.catch(() => undefined) // avoid an unhandled rejection if the camera fails first
    await cameraReady
    this.opts.onStatus?.('Loading hand tracking…')
    await trackerReady
    this.resume()
  }

  private async openCamera() {
    const low = this.opts.lowPower
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: low ? 640 : 1280 },
          height: { ideal: low ? 480 : 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      })
    } catch (e) {
      const name = (e as DOMException)?.name
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new TrackingError('denied', 'Camera permission denied')
      if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new TrackingError('no-camera', 'No camera found')
      throw new TrackingError('unknown', String(e))
    }
    const v = this.opts.video
    v.srcObject = this.stream
    await v.play().catch(() => undefined)
    if (!v.videoWidth) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }))
  }

  private async loadRecognizer() {
    try {
      const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL)
      const make = (delegate: 'GPU' | 'CPU') =>
        GestureRecognizer.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
      try {
        this.recognizer = await make('GPU')
      } catch {
        this.recognizer = await make('CPU')
      }
    } catch (e) {
      throw new TrackingError('model', 'Could not load hand tracking: ' + String(e))
    }
  }

  /** Pause detection and release the camera (e.g. tab hidden). */
  pause() {
    this.running = false
    cancelAnimationFrame(this.frameHandle)
  }

  resume() {
    if (this.running || !this.recognizer) return
    this.running = true
    this.schedule()
  }

  stop() {
    this.pause()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }

  private schedule() {
    if (!this.running) return
    const v = this.opts.video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => this.tick())
    else this.frameHandle = requestAnimationFrame(() => this.tick())
  }

  private tick() {
    if (!this.running || !this.recognizer) return
    const v = this.opts.video
    const now = performance.now()
    const minGap = this.opts.lowPower ? 45 : 30
    if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime && now - this.lastRun >= minGap) {
      this.lastVideoTime = v.currentTime
      this.lastRun = now
      try {
        const res = this.recognizer.recognizeForVideo(v, now)
        this.opts.onHands(this.toScreen(res), now)
      } catch {
        // a dropped frame is fine; keep going
      }
    }
    this.schedule()
  }

  /** Convert normalized landmarks to CSS pixels of the mirrored, object-fit: cover video. */
  private toScreen(res: ReturnType<GestureRecognizer['recognizeForVideo']>): HandInput[] {
    const v = this.opts.video
    const W = v.clientWidth, H = v.clientHeight
    const vw = v.videoWidth || W, vh = v.videoHeight || H
    const scale = Math.max(W / vw, H / vh)
    const dw = vw * scale, dh = vh * scale
    const ox = (W - dw) / 2, oy = (H - dh) / 2
    return res.landmarks.map((lm, i) => ({
      points: lm.map((p) => ({ x: W - (ox + p.x * dw), y: oy + p.y * dh })),
      handedness: res.handedness[i]?.[0]?.categoryName,
      gesture: res.gestures[i]?.[0]?.categoryName,
      gestureScore: res.gestures[i]?.[0]?.score,
    }))
  }
}
