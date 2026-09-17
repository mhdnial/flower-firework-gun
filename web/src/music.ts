// Background music player. Streams tracks with <audio preload="none"> so nothing downloads
// until the user presses play. Playlist lives in /music/playlist.json.

export interface Track {
  title: string
  artist?: string
  src: string
}

export interface MusicState {
  tracks: Track[]
  index: number
  playing: boolean
  muted: boolean
  volume: number
}

export class MusicPlayer {
  private audio = new Audio()
  private listeners = new Set<(s: MusicState) => void>()
  tracks: Track[] = []
  index = 0

  constructor(volume: number, muted: boolean) {
    this.audio.preload = 'none'
    this.audio.volume = volume
    this.audio.muted = muted
    this.audio.addEventListener('ended', () => this.next())
    this.audio.addEventListener('play', () => this.emit())
    this.audio.addEventListener('pause', () => this.emit())
    this.audio.addEventListener('volumechange', () => this.emit())
    this.audio.addEventListener('error', () => {
      if (this.tracks.length > 1) this.next()
      else this.emit()
    })
  }

  async load(url: string) {
    try {
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { tracks?: Track[] }
      this.tracks = (data.tracks ?? []).filter((t) => t && t.src && t.title)
    } catch {
      this.tracks = []
    }
    if (this.tracks.length) this.select(0, false)
    this.setupMediaSession()
    this.emit()
  }

  get state(): MusicState {
    return {
      tracks: this.tracks,
      index: this.index,
      playing: !this.audio.paused,
      muted: this.audio.muted,
      volume: this.audio.volume,
    }
  }

  onChange(fn: (s: MusicState) => void) {
    this.listeners.add(fn)
    fn(this.state)
  }

  private emit() {
    const s = this.state
    this.listeners.forEach((fn) => fn(s))
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = s.playing ? 'playing' : 'paused'
  }

  private select(i: number, autoplay: boolean) {
    if (!this.tracks.length) return
    this.index = (i + this.tracks.length) % this.tracks.length
    const t = this.tracks[this.index]
    this.audio.src = t.src
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist ?? '' })
    }
    if (autoplay) void this.audio.play().catch(() => this.emit())
    this.emit()
  }

  toggle() {
    if (!this.tracks.length) return
    if (this.audio.paused) void this.audio.play().catch(() => this.emit())
    else this.audio.pause()
  }

  pause() { this.audio.pause() }

  next() { this.select(this.index + 1, !this.audio.paused || this.audio.ended) }
  prev() { this.select(this.index - 1, !this.audio.paused) }

  setMuted(m: boolean) { this.audio.muted = m }
  setVolume(v: number) { this.audio.volume = Math.min(1, Math.max(0, v)) }

  private setupMediaSession() {
    if (!('mediaSession' in navigator) || !this.tracks.length) return
    const ms = navigator.mediaSession
    ms.setActionHandler('play', () => this.toggle())
    ms.setActionHandler('pause', () => this.toggle())
    ms.setActionHandler('nexttrack', () => this.select(this.index + 1, true))
    ms.setActionHandler('previoustrack', () => this.select(this.index - 1, true))
  }
}
