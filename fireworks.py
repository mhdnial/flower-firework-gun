# Script CHOP callbacks: /project1/firework/fx
# numpy particle system. Watches the per-hand 'shot0' / 'shot1' counters from ../gesture:
#   shot -> bullet flies from index fingertip along finger direction, leaving a trail
#   fuse runs out (or bullet leaves screen) -> firework burst of sparks with gravity + fade
# Output: one sample per live particle, channels tx ty tz sx r g b a (instancing data).

import math
import colorsys
import numpy as np

MAXP = 6000
BULLET, TRAIL, SPARK, CRACKLE, FLOWER = 0, 1, 2, 3, 4

S = None  # state dict, rebuilt when this DAT is edited/reloaded


def _init():
	return {
		'pos': np.zeros((MAXP, 2), np.float32),
		'vel': np.zeros((MAXP, 2), np.float32),
		'life': np.zeros(MAXP, np.float32),     # remaining seconds, <=0 means dead
		'maxlife': np.ones(MAXP, np.float32),
		'col': np.ones((MAXP, 3), np.float32),
		'size': np.zeros(MAXP, np.float32),
		'kind': np.zeros(MAXP, np.int8),
		'hue': np.zeros(MAXP, np.float32),      # bullets remember their burst hue
		'last_shot': None,
		'last_time': None,
	}


def _spawn(n, pos, vel, life, col, size, kind, hue=0.0):
	dead = np.flatnonzero(S['life'] <= 0)
	if len(dead) == 0:
		return
	idx = dead[:n]
	k = len(idx)
	S['pos'][idx] = pos[:k] if np.ndim(pos) == 2 else pos
	S['vel'][idx] = vel[:k] if np.ndim(vel) == 2 else vel
	S['life'][idx] = life[:k] if np.ndim(life) == 1 else life
	S['maxlife'][idx] = S['life'][idx]
	S['col'][idx] = col[:k] if np.ndim(col) == 2 else col
	S['size'][idx] = size[:k] if np.ndim(size) == 1 else size
	S['kind'][idx] = kind
	S['hue'][idx] = hue


# ------------------------------------------------------------------ flower shapes
# Each shape returns (offsets Nx2, colors Nx3) in flower units: head roughly radius 1 at the
# origin, stem hanging below. Sparks fly out and settle on these points (drag), then droop.

GREEN_STEM = (0.25, 0.95, 0.3)
GREEN_LEAF = (0.1, 0.75, 0.25)


def _rot(xy, a):
	c, s = math.cos(a), math.sin(a)
	return np.stack([xy[:, 0] * c - xy[:, 1] * s, xy[:, 0] * s + xy[:, 1] * c], 1)


def _petal(n, length, width, angle, base=(0.0, 0.0), roundness=0.8, edge=0.88):
	"""Lens-shaped petal growing along +y from base, rotated by angle; mostly outline points."""
	t = np.random.rand(n)
	half = width * np.power(np.sin(np.pi * np.clip(t, 0, 1)), roundness)
	on_edge = np.random.rand(n) < edge
	side = np.where(np.random.rand(n) < 0.5, -1.0, 1.0)
	x = np.where(on_edge, side * half, np.random.uniform(-1, 1, n) * half)
	xy = _rot(np.stack([x, t * length], 1), angle)
	return xy + np.asarray(base)


def _stem(n, top, bottom=-1.9):
	y = np.random.uniform(bottom, top, n)
	x = 0.07 * np.sin((y - top) * 2.2) + np.random.normal(0, 0.006, n)
	return np.stack([x, y], 1)


def _leaves(n, top):
	ya = top - 0.55
	a = n // 2
	l1 = _petal(a, 0.55, 0.13, 1.05, base=(0.07 * math.sin(-0.55 * 2.2), ya), edge=0.7)
	l2 = _petal(n - a, 0.45, 0.11, -1.0, base=(0.07 * math.sin(-0.8 * 2.2), ya - 0.25), edge=0.7)
	return np.concatenate([l1, l2])


def _tint(n, rgb, jitter=0.15):
	c = np.tile(np.asarray(rgb, np.float32), (n, 1))
	return np.clip(c * np.random.uniform(1 - jitter, 1 + jitter, (n, 1)), 0, 1)


def _green_parts(n, top):
	ns, nl = int(n * 0.45), n - int(n * 0.45)
	return [(_stem(ns, top), _tint(ns, GREEN_STEM)), (_leaves(nl, top), _tint(nl, GREEN_LEAF))]


def _tulip(n):
	colors = [(1.0, 0.12, 0.2), (1.0, 0.35, 0.65), (0.75, 0.3, 1.0), (1.0, 0.55, 0.1), (1.0, 0.9, 0.2)]
	col = colors[np.random.randint(len(colors))]
	nh = int(n * 0.72)
	k = nh // 3
	base = (0.0, -0.55)
	head = np.concatenate([
		_petal(k, 1.35, 0.42, 0.0, base, roundness=0.55),
		_petal(k, 1.25, 0.40, 0.32, (0.05, -0.5), roundness=0.55),
		_petal(nh - 2 * k, 1.25, 0.40, -0.32, (-0.05, -0.5), roundness=0.55),
	])
	parts = [(head, _tint(nh, col))] + _green_parts(n - nh, -0.5)
	return parts


def _sunflower(n):
	nh = int(n * 0.75)
	nc = int(nh * 0.28)
	npet = nh - nc
	# seed disk with golden-angle phyllotaxis
	i = np.arange(nc) + 0.5
	r = 0.36 * np.sqrt(i / nc)
	th = i * 2.399963
	disk = np.stack([r * np.cos(th), r * np.sin(th)], 1)
	disk_col = np.where((i / nc < 0.6)[:, None], _tint(nc, (0.85, 0.4, 0.05)), _tint(nc, (1.0, 0.55, 0.1)))
	petals = []
	count = 18
	off = np.random.uniform(0, 2 * math.pi)
	per = npet // count
	for j in range(count):
		m = per if j < count - 1 else npet - per * (count - 1)
		a = off + j * 2 * math.pi / count
		base = (-0.36 * math.sin(a), 0.36 * math.cos(a))
		petals.append(_petal(m, 0.72, 0.13, a, base, roundness=0.7, edge=0.85))
	petals = np.concatenate(petals)
	return [(disk, disk_col), (petals, _tint(npet, (1.0, 0.82, 0.08)))] + _green_parts(n - nh, -1.05)


def _rose(n):
	shades = [(1.0, 0.05, 0.15), (1.0, 0.3, 0.5), (0.9, 0.0, 0.3)]
	col = shades[np.random.randint(len(shades))]
	nh = int(n * 0.72)
	nsp = int(nh * 0.28)
	nin = int(nh * 0.3)
	nout = nh - nsp - nin
	# inner spiral of tightly wrapped petals
	th = np.random.uniform(0, 5 * math.pi, nsp)
	r = 0.34 * th / (5 * math.pi)
	spiral = np.stack([r * np.cos(th), r * np.sin(th) * 0.9], 1) + np.random.normal(0, 0.01, (nsp, 2))
	def ring(m, count, length, width, radius, rot):
		out = []
		per = m // count
		for j in range(count):
			k = per if j < count - 1 else m - per * (count - 1)
			a = rot + j * 2 * math.pi / count
			base = (-radius * math.sin(a), radius * math.cos(a))
			out.append(_petal(k, length, width, a, base, roundness=0.4, edge=0.9))
		return np.concatenate(out)
	rot = np.random.uniform(0, 2 * math.pi)
	inner = ring(nin, 5, 0.42, 0.26, 0.2, rot + math.pi / 5)
	outer = ring(nout, 5, 0.6, 0.4, 0.38, rot)
	head = [
		(spiral, _tint(nsp, tuple(c * 0.85 for c in col))),
		(inner, _tint(nin, col)),
		(outer, _tint(nout, tuple(min(1.0, c * 1.1 + 0.05) for c in col))),
	]
	return head + _green_parts(n - nh, -0.95)


def _lily(n):
	"""White lily: six long pointed, slightly curling petals, pale green throat, orange-tipped stamens."""
	nh = int(n * 0.75)
	nst = int(nh * 0.14)
	npet = nh - nst
	rot = np.random.uniform(0, 2 * math.pi)
	petals = []
	per = npet // 6
	for j in range(6):
		m = per if j < 5 else npet - per * 5
		a = rot + j * math.pi / 3
		base = (-0.06 * math.sin(a), 0.06 * math.cos(a))
		petals.append(_petal(m, 1.0, 0.2, a, base, roundness=1.1, edge=0.85))
	petals = np.concatenate(petals)
	# curl the petal tips a little, like a lily opening up
	r = np.linalg.norm(petals, axis=1)
	bend = 0.22 * r * r
	c, s = np.cos(bend), np.sin(bend)
	petals = np.stack([petals[:, 0] * c - petals[:, 1] * s, petals[:, 0] * s + petals[:, 1] * c], 1)
	pet_col = np.where((r < 0.3)[:, None], _tint(npet, (0.8, 1.0, 0.55), 0.08), _tint(npet, (1.0, 1.0, 1.0), 0.05))
	blush = np.random.rand(npet) < 0.05
	pet_col[blush] = (1.0, 0.75, 0.85)
	# stamens: thin filaments with orange anthers
	nfil = int(nst * 0.6)
	nanth = nst - nfil
	fil_a = rot + math.pi / 6 + np.random.randint(0, 6, nfil) * math.pi / 3 + np.random.normal(0, 0.03, nfil)
	fil_r = np.random.uniform(0.05, 0.55, nfil)
	fil = np.stack([-fil_r * np.sin(fil_a), fil_r * np.cos(fil_a)], 1)
	an_a = rot + math.pi / 6 + np.random.randint(0, 6, nanth) * math.pi / 3
	anth = np.stack([-0.58 * np.sin(an_a), 0.58 * np.cos(an_a)], 1) + np.random.normal(0, 0.025, (nanth, 2))
	return [(petals, pet_col), (fil, _tint(nfil, (0.7, 0.95, 0.5))), (anth, _tint(nanth, (1.0, 0.45, 0.05)))] \
		+ _green_parts(n - nh, -0.95)


# ------------------------------------------------------------------ sound effects
SFX = {'shoot': ('shoot1', 'shoot2'), 'boom': ('boom1', 'boom2', 'boom3')}
_sfx_next = {}


def _sfx(kind):
	"""Restart the next Audio File In CHOP of this kind (round robin, so sounds overlap)."""
	names = SFX[kind]
	i = _sfx_next.get(kind, 0)
	_sfx_next[kind] = (i + 1) % len(names)
	if kind == 'boom':
		i = (i + np.random.randint(len(names))) % len(names)
	player = op(names[i])
	if player is None:
		return
	player.par.play = True
	player.par.cuepulse.pulse()


def _circle_burst(p, hue, P):
	"""Classic round firework: sparks fly out in a ring/sphere, fall with gravity and fade."""
	n = int(P.Sparks.eval() * 0.5)
	# size follows Flower Size so every burst type is about the same size
	drag = max(P.Drag.eval(), 0.3)
	radius = P.Flowersize.eval() * 1.15 * np.random.uniform(0.9, 1.15)
	speed = radius * drag / (1.0 - math.exp(-drag * 1.0))
	ang = np.random.uniform(0, 2 * math.pi, n)
	# mix of a crisp ring and a filled burst
	r = np.where(np.random.rand(n) < 0.5, np.random.uniform(0.9, 1.0, n), np.sqrt(np.random.rand(n)))
	v = np.stack([np.cos(ang), np.sin(ang)], 1) * (r * speed)[:, None]
	life = np.random.uniform(1.7, 2.5, n).astype(np.float32)
	hues = (hue + np.random.uniform(-0.05, 0.05, n)) % 1.0
	cols = np.array([colorsys.hsv_to_rgb(h, np.random.uniform(0.55, 1.0), 1.0) for h in hues], np.float32)
	cols[np.random.rand(n) < 0.12] = 1.0
	size = np.random.uniform(0.7, 1.2, n).astype(np.float32) * P.Sparksize.eval()
	_spawn(n, np.tile(p, (n, 1)), v, life, cols, size, SPARK)


# every burst type: flower shape functions, plus 'circle' for the classic round burst
BURSTS = [_tulip, _sunflower, _rose, _lily, 'circle']
_bag = []
_last = -1


def _next_burst():
	"""Shuffle-bag: every type appears once per round in random order, never twice in a row."""
	global _bag, _last
	if not _bag:
		_bag = list(np.random.permutation(len(BURSTS)))
		if _bag[-1] == _last:
			_bag[0], _bag[-1] = _bag[-1], _bag[0]
	_last = _bag.pop()
	return BURSTS[_last]


def _explode(p, hue, P):
	burst = _next_burst()
	_sfx('boom')
	# flash core
	_spawn(1, p, np.zeros(2), 0.15, np.array([0.8, 0.8, 0.8]), P.Sparksize.eval() * 5, CRACKLE)
	if burst == 'circle':
		_circle_burst(p, hue, P)
		return
	n = int(P.Sparks.eval())
	scale = P.Flowersize.eval() * np.random.uniform(0.85, 1.15)
	tilt = np.random.uniform(-0.25, 0.25)
	drag = max(P.Drag.eval(), 0.3)
	parts = burst(n)
	off = np.concatenate([o for o, c in parts]).astype(np.float32)
	cols = np.concatenate([c for o, c in parts]).astype(np.float32)
	m = len(off)
	off = _rot(off, tilt) * scale + np.random.normal(0, 0.004, (m, 2))
	# with exponential drag the spark travels vel/drag in total: aim it at its target point
	settle = 1.0 / (1.0 - math.exp(-drag * 1.2))
	v = off * drag * settle
	life = np.random.uniform(1.9, 2.6, m).astype(np.float32)
	# dimmer, smaller sparks so overlapping points (additive) keep the petal shapes readable
	cols *= 0.5
	white = np.random.rand(m) < 0.04
	cols[white] = 0.9
	size = np.random.uniform(0.45, 0.75, m).astype(np.float32) * P.Sparksize.eval()
	_spawn(m, np.tile(p, (m, 1)), v, life, cols, size, FLOWER)


def onSetupParameters(scriptOp):
	return


def onPulse(par):
	return


def onCook(scriptOp):
	global S
	frame = absTime.frame  # cook every frame
	if S is None:
		S = _init()
	P = scriptOp.parent().par
	g = op('gesture')

	t = absTime.seconds
	dt = 1.0 / 60.0 if S['last_time'] is None else min(max(t - S['last_time'], 0.0), 1.0 / 20.0)
	S['last_time'] = t

	aspect = 16.0 / 9.0
	if S['last_shot'] is None:
		S['last_shot'] = {}

	# --- fire new bullet(s): each hand (slot 0 / 1) has its own shot counter and muzzle
	for slot in (0, 1):
		ch = g['shot%d' % slot] if g is not None else None
		if ch is None:
			continue
		shot = int(ch[0])
		last = S['last_shot'].get(slot)
		S['last_shot'][slot] = shot
		if last is None or shot <= last:  # first cook, no new shot, or gesture script reloaded
			continue
		o = np.array([g['ox%d' % slot][0], g['oy%d' % slot][0]], np.float32)
		d = np.array([g['dx%d' % slot][0], g['dy%d' % slot][0]], np.float32)
		hue = np.random.rand()
		_sfx('shoot')
		_spawn(1, o, d * P.Bulletspeed.eval(), P.Fuse.eval(), np.array([1.0, 0.95, 0.8]),
		       P.Sparksize.eval() * 2.2, BULLET, hue)
		# muzzle flash
		n = 25
		a = np.arctan2(d[1], d[0]) + np.random.uniform(-0.5, 0.5, n)
		v = np.stack([np.cos(a), np.sin(a)], 1) * np.random.uniform(0.2, 0.9, n)[:, None]
		_spawn(n, np.tile(o, (n, 1)), v, np.random.uniform(0.1, 0.3, n).astype(np.float32),
		       np.tile([1.0, 0.8, 0.4], (n, 1)).astype(np.float32),
		       np.random.uniform(0.5, 1.0, n).astype(np.float32) * P.Sparksize.eval(), TRAIL)

	alive = S['life'] > 0
	kind = S['kind']

	# --- bullets: trail + explode when fuse ends or leaving the screen
	bullets = np.flatnonzero(alive & (kind == BULLET))
	for b in bullets:
		p = S['pos'][b].copy()
		n = 4
		_spawn(n, p + np.random.normal(0, 0.004, (n, 2)), np.random.normal(0, 0.05, (n, 2)) - S['vel'][b] * 0.05,
		       np.random.uniform(0.25, 0.5, n).astype(np.float32),
		       np.tile([1.0, 0.65, 0.25], (n, 1)).astype(np.float32),
		       np.random.uniform(0.4, 0.8, n).astype(np.float32) * P.Sparksize.eval(), TRAIL)
		fs = P.Flowersize.eval()
		off = abs(p[0]) > aspect - fs * 0.9 or p[1] > 1.0 - fs * 1.05 or p[1] < -0.97
		if S['life'][b] <= dt or off:
			# keep the flower head on screen
			p[0] = np.clip(p[0], -aspect + fs, aspect - fs)
			p[1] = np.clip(p[1], -0.9, 1.0 - fs * 1.1)
			S['life'][b] = 0
			_explode(p, S['hue'][b], P)

	# --- crackle: some dying sparks pop into tiny white flickers
	alive = S['life'] > 0
	kind = S['kind']
	dying = np.flatnonzero(alive & ((kind == SPARK) | (kind == FLOWER)) & (S['life'] < 0.35) & (np.random.rand(MAXP) < 0.01))
	if len(dying):
		n = len(dying)
		_spawn(n, S['pos'][dying], np.random.normal(0, 0.15, (n, 2)), np.random.uniform(0.05, 0.15, n).astype(np.float32),
		       np.ones((n, 3), np.float32), np.full(n, P.Sparksize.eval() * 0.8, np.float32), CRACKLE)

	# --- integrate
	alive = S['life'] > 0
	kind = S['kind']
	grav = P.Gravity.eval()
	falls = alive & (kind != BULLET) & (kind != FLOWER)
	S['vel'][falls, 1] -= grav * dt
	# flower sparks hold their shape first, then droop and fall
	fl = alive & (kind == FLOWER)
	age = S['maxlife'][fl] - S['life'][fl]
	S['vel'][fl, 1] -= grav * np.clip((age - 1.2) / 0.6, 0.0, 1.0) * dt
	falls = falls | fl
	S['vel'][falls] *= math.exp(-P.Drag.eval() * dt)
	bl = alive & (kind == BULLET)
	S['vel'][bl, 1] -= grav * 0.25 * dt
	S['pos'][alive] += S['vel'][alive] * dt
	S['life'][alive] -= dt

	# --- output live particles
	idx = np.flatnonzero(S['life'] > 0)
	scriptOp.clear()
	names = ('tx', 'ty', 'tz', 'sx', 'r', 'g', 'b', 'a')
	if len(idx) == 0:
		scriptOp.numSamples = 1
		for nm in names:
			scriptOp.appendChan(nm)[0] = 0.0
		return

	k = S['life'][idx] / S['maxlife'][idx]
	kd = S['kind'][idx]
	fade = np.where(kd == SPARK, np.power(k, 1.3) * (0.75 + 0.25 * np.random.rand(len(idx))), k)
	flower_fade = np.power(np.clip(k / 0.45, 0.0, 1.0), 1.2) * (0.85 + 0.15 * np.random.rand(len(idx)))
	fade = np.where(kd == FLOWER, flower_fade, fade)
	fade = np.where(kd == BULLET, 1.0, fade)
	size = S['size'][idx] * np.where(kd == SPARK, 0.4 + 0.6 * k,
	                        np.where(kd == CRACKLE, k,
	                        np.where(kd == FLOWER, 0.5 + 0.5 * np.clip(k / 0.45, 0.0, 1.0), 1.0)))
	rgb = S['col'][idx] * fade[:, None]

	scriptOp.numSamples = len(idx)
	cols = {
		'tx': S['pos'][idx, 0], 'ty': S['pos'][idx, 1], 'tz': np.zeros(len(idx)),
		'sx': size, 'r': rgb[:, 0], 'g': rgb[:, 1], 'b': rgb[:, 2], 'a': fade,
	}
	for nm in names:
		scriptOp.appendChan(nm).vals = cols[nm].astype(float).tolist()
	return
