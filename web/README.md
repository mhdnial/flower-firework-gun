# Flower Firework Gun — web version

Browser port of the TouchDesigner project: make a finger gun, snap your thumb down, and a bullet
bursts into a tulip, sunflower, rose, white lily or circle. Works on phones, tablets and desktop.

## Stack
Vite + vanilla TypeScript (no framework), WebGL point sprites (Canvas 2D fallback), MediaPipe
Gesture Recognizer (loaded only after **Start**), Web Audio synthesized sound effects, service worker cache.

First load ≈ 14 KB gzipped. Hand tracking downloads ≈ 11.5 MB once (WASM 3.1 MB + model 8.4 MB), then it is cached.

## Commands
```bash
npm install
npm run dev          # http://localhost:5173 (camera works on localhost)
npm run dev:phone    # HTTPS on your LAN so a phone can use its camera (accept the self-signed warning)
npm test             # gesture + burst unit tests
npm run build        # type check + production build into dist/
```
Dev helpers: **Space** or **double-tap** fires a test shot; **Help → Show tracking debug info** shows the HUD.

## Music
Put audio files in `public/music/` and list them in `public/music/playlist.json`:
```json
{
  "tracks": [
    { "title": "Song name", "artist": "Artist", "src": "/music/song-name.m4a" }
  ]
}
```
Tip for low bandwidth: encode as AAC (`.m4a`) or Opus at ~96 kbps. Tracks stream only when played.
Files can also be hosted elsewhere (full `https://` URL in `src`).

## Code map
| File | What it does |
| --- | --- |
| `src/gesture.ts` | finger-gun + thumb click per hand (port of `gesture.py`) |
| `src/bursts.ts` | tulip / sunflower / rose / lily shapes + shuffle bag |
| `src/particles.ts` | bullets, trails, flower & circle bursts (port of `fireworks.py`) |
| `src/render.ts` | WebGL additive glow renderer |
| `src/tracking.ts` | camera + MediaPipe, maps landmarks onto the mirrored video |
| `src/audio.ts` | synthesized shoot / boom sounds + mute |
| `src/music.ts` | playlist player, mute, volume, lock-screen controls |
| `src/quality.ts` | phone / low-end performance tier |
| `public/sw.js` | caches MediaPipe + assets for repeat visits |
| `vercel.json` | cache + security headers for deployment |

## Deploy (Vercel)
Import the repo in Vercel with **Root Directory = `web`**. Build command and output (`dist`) come from `vercel.json`.
