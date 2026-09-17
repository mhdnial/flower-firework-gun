# Flower Firework Gun

Make a finger gun (index out, other fingers curled, thumb up), then snap the thumb down:
a bullet leaves the index fingertip and bursts into a tulip, sunflower, rose, white lily or circle firework.
Both hands work.

This repo has two versions:

| Folder | Version |
| --- | --- |
| [`web/`](web/README.md) | **Web app** (Vite + TypeScript + MediaPipe) for phone, tablet and desktop — deployable to Vercel |
| repo root | **TouchDesigner 2025** version (`build.py`, `gesture.py`, `fireworks.py`, `gen_sounds.py`) |

Not included in the repo: the TouchDesigner `.toe` file (too large for GitHub), the
[MediaPipe TouchDesigner plugin](https://github.com/torinmb/mediapipe-touchdesigner/releases), and music files.

### TouchDesigner setup
1. Download the MediaPipe TouchDesigner release and put `MediaPipe.tox` + `hand_tracking.tox` in `Mediapipe/`.
2. Drag both into `/project1`, connect MediaPipe output **hands** → `hand_tracking`, pick your webcam.
3. In the Textport run `exec(open(r'<repo path>/build.py').read())` (update `FOLDER` in `build.py` to your repo path).
4. Generate the sound effects once: `exec(open(r'<repo path>/gen_sounds.py').read())`.

---

# TouchDesigner version details

## Network
- `/project1/MediaPipe` → output **2 (hands)** → `/project1/hand_tracking`
- `/project1/firework`
  - `gesture` (Script CHOP, `gesture.py`) reads the raw hand JSON and tracks **both hands independently**
    (stable slots by MediaPipe handedness). Per hand N=0/1: `gunN`, `cockedN`, `thumbN`, `shotN`, muzzle `oxN/oyN`,
    direction `dxN/dyN`, screen `sideN` — so left and right hand can each fire, even at the same time
  - `fx` (Script CHOP, `fireworks.py`) runs the numpy particle sim and outputs instancing channels
  - `tick` (Execute DAT) makes both CHOPs cook every frame
  - `particles` + `spark_mat` + `cam` → `render` → glow → added over the dimmed webcam → `hud` → `OUT`
- `/project1/display_out` shows the final image; `/project1/display_window` opens it in its own window (Window COMP → **Open**)

## Tuning (select `firework`, parameter pages Gesture / Firework / Display)
- Shots fire too easily → lower **Thumb Click Threshold**. Doesn't fire → raise it.
- Gun never gets COCKED → lower **Thumb Open Threshold** (watch `thumb` value in the HUD).
- Bullet speed, fuse, spark count, flower size, gravity, glow, webcam brightness, HUD on/off.

## Sound
- `sounds/shoot.wav` (launch thump + whistle) plays on each shot; `sounds/boom1-3.wav` (boom + crackle) on each flower burst.
- Sounds are synthesized by `gen_sounds.py` — edit it and re-run to change them, or drop in your own WAVs with the same names.
- Players `shoot1-2`, `boom1-3` (Audio File In CHOPs) → `sfx_mix` → `sfx_out` (Audio Device Out, default speakers).
- `firework` → **Sound** page: Volume, Shoot Volume, Explosion Volume, Mute.

## Flowers
Each shot bursts into a **tulip, sunflower, rose, white lily or classic circle** (shuffle-bag: all five appear once per round,
never the same twice in a row). Shapes live in `fireworks.py` (`_tulip`, `_sunflower`, `_rose`, `_lily`, `_circle_burst`); all burst sizes follow **Flower Size**;
add a new function returning `[(points, colors), ...]` and append it to `BURSTS` to add another flower.

The `.py` files are file-synced: edit and save them and TouchDesigner reloads them.
Rebuild everything: `exec(open(r'D:/TD-test/Firework/build.py').read())` in the Textport.

## Troubleshooting
- Webcam image blank / 128×128 → press **Reset** on MediaPipe.
- `hands 0` in the HUD → use brighter light in front of you and keep the whole hand in the frame.
