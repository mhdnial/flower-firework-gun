# Synthesizes the firework sound effects into D:/TD-test/Firework/sounds (no downloads needed).
#   shoot.wav        launch thump + whoosh + rising whistle
#   boom1..3.wav     explosion: sub boom + blast + crackle tail (3 random variations)
# Run inside TouchDesigner (numpy is bundled) or any Python 3 with numpy:
#   exec(open(r'D:/TD-test/Firework/gen_sounds.py').read())

import os
import wave
import numpy as np

SR = 44100
OUT_DIR = 'D:/TD-test/Firework/sounds'


def lowpass(x, cutoff):
	a = np.exp(-2.0 * np.pi * cutoff / SR)
	y = np.empty_like(x)
	acc = 0.0
	for i, v in enumerate(x):
		acc = (1.0 - a) * v + a * acc
		y[i] = acc
	return y


def write_wav(path, x, peak=0.9):
	x = np.tanh(1.4 * x) / np.tanh(1.4)
	x = x / max(np.max(np.abs(x)), 1e-6) * peak
	fade = min(len(x), int(0.01 * SR))
	x[-fade:] *= np.linspace(1, 0, fade)
	data = (x * 32767).astype('<i2').tobytes()
	with wave.open(path, 'wb') as w:
		w.setnchannels(1)
		w.setsampwidth(2)
		w.setframerate(SR)
		w.writeframes(data)


def shoot(rng):
	dur = 0.9
	t = np.arange(int(dur * SR)) / SR
	# launch thump
	f = 60 + 90 * np.exp(-t * 30)
	thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 35)
	# airy whoosh (high-passed noise)
	n = rng.standard_normal(len(t))
	whoosh = (n - lowpass(n, 900)) * np.minimum(t / 0.02, 1) * np.exp(-t * 4.5) * 0.35
	# rising whistle with a little wobble
	fw = 1300 + 1700 * np.power(t / dur, 0.6) + 25 * np.sin(2 * np.pi * 11 * t)
	whistle = np.sin(2 * np.pi * np.cumsum(fw) / SR) * np.minimum(t / 0.04, 1) * np.exp(-t * 2.8) * 0.22
	return thump * 0.9 + whoosh + whistle


def boom(rng):
	dur = 2.8
	t = np.arange(int(dur * SR)) / SR
	att = np.minimum(t / 0.003, 1)
	# deep sub boom with falling pitch
	f = 32 + 45 * np.exp(-t * 2.0)
	sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2) * att
	# body blast
	n = rng.standard_normal(len(t))
	blast = lowpass(n, rng.uniform(450, 800)) * 6.0 * np.exp(-t * 5.5) * att
	# initial crack
	crack = n * np.exp(-t * 30) * 0.35 * att
	# crackle tail: many tiny sparkles, sparser over time
	crackle = np.zeros_like(t)
	for _ in range(rng.integers(110, 170)):
		start = 0.3 + 2.1 * rng.random() ** 1.7
		i0 = int(start * SR)
		ln = int(rng.uniform(0.002, 0.009) * SR)
		if i0 + ln >= len(t):
			continue
		win = np.hanning(ln)
		crackle[i0:i0 + ln] += rng.standard_normal(ln) * win * rng.uniform(0.08, 0.35) * np.exp(-(start - 0.3) * 0.9)
	dry = sub * 0.9 + blast + crack + crackle
	# cheap echo for outdoor space
	wet = np.zeros_like(dry)
	for delay, gain in ((0.07, 0.3), (0.13, 0.2), (0.21, 0.13), (0.33, 0.08)):
		d = int(delay * SR)
		wet[d:] += dry[:-d] * gain
	return dry + lowpass(wet, 2500)


os.makedirs(OUT_DIR, exist_ok=True)
write_wav(OUT_DIR + '/shoot.wav', shoot(np.random.default_rng(7)), peak=0.8)
for k, seed in enumerate((11, 23, 42), start=1):
	write_wav(OUT_DIR + '/boom%d.wav' % k, boom(np.random.default_rng(seed)), peak=0.95)
print('sounds written to', OUT_DIR)
