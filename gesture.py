# Script CHOP callbacks: /project1/firework/gesture
# Reads raw MediaPipe hand landmarks (JSON from /project1/MediaPipe/hands) and detects
# a "finger gun" + thumb hammer click independently on BOTH hands.
#
# Hands are kept in stable slots by MediaPipe handedness (slot 0 = 'Left', slot 1 = 'Right'),
# so the list order swapping between frames does not mix up their state.
#
# Output channels (1 sample):
#   hands            number of hands seen
#   gun              1 while any hand holds the gun sign
#   Per slot N (0, 1):
#   gunN, cockedN    gun sign held / thumb up and ready to fire
#   thumbN           thumb-open ratio (dist thumb_tip->index_mcp / hand size)
#   shotN            counter, +1 each time this hand fires (fireworks.py watches it)
#   oxN, oyN         muzzle position (index fingertip) in render space, held after the gun drops
#   dxN, dyN         unit pointing direction (index_mcp -> index_tip)
#   sideN            -1 hand on the left of the screen, +1 on the right, 0 not seen

import json
import math
from collections import deque

WRIST, THUMB_TIP, INDEX_MCP, INDEX_PIP, INDEX_TIP = 0, 4, 5, 6, 8
MIDDLE_MCP, MIDDLE_PIP, MIDDLE_TIP = 9, 10, 12
RING_PIP, RING_TIP, PINKY_PIP, PINKY_TIP = 14, 16, 18, 20

SLOT_BY_LABEL = {'Left': 0, 'Right': 1}
NSLOTS = 2

# rolling debug log of measurements (read with op('gesture_callbacks').module.debug_log)
debug_log = deque(maxlen=1200)


def _new_slot():
	return {'gun_frames': 0, 'armed': False, 'thumb': None, 'last_fire': -1e9, 'shot': 0,
	        'ox': 0.0, 'oy': 0.0, 'dx': 0.0, 'dy': 1.0}


_state = [_new_slot() for _ in range(NSLOTS)]


def onSetupParameters(scriptOp):
	return


def onPulse(par):
	return


def _assign_slots(landmarks, handedness):
	"""Map each detected hand (list index) to a stable slot using its handedness label."""
	slots = {}
	used = set()
	for hi in range(min(len(landmarks), NSLOTS)):
		label = ''
		if hi < len(handedness) and handedness[hi]:
			label = handedness[hi][0].get('categoryName', '')
		slot = SLOT_BY_LABEL.get(label, hi)
		if slot in used:  # both hands got the same label: give this one the free slot
			slot = next(s for s in range(NSLOTS) if s not in used)
		used.add(slot)
		slots[hi] = slot
	return slots


def onCook(scriptOp):
	frame = absTime.frame  # makes this CHOP cook every frame
	now = absTime.seconds
	P = scriptOp.parent().par

	aspect = 16.0 / 9.0
	landmarks, mp_gestures, handedness = [], [], []
	try:
		d = json.loads(op('/project1/MediaPipe/hands')[0, 0].val)
		res = d.get('resolution', {})
		if res.get('width') and res.get('height'):
			aspect = float(res['width']) / float(res['height'])
		gr = d.get('gestureResults', {})
		landmarks = gr.get('landmarks', []) or []
		mp_gestures = gr.get('gestures', []) or []
		handedness = gr.get('handedness', []) or gr.get('handednesses', []) or []
	except Exception:
		landmarks = []

	open_thr = P.Openthr.eval()
	close_thr = P.Closethr.eval()
	ext_ratio = P.Extendratio.eval()
	cooldown = P.Cooldown.eval()

	# screen space: x in [-aspect, aspect], y in [-1, 1] (y up), matches ortho camera
	def pt(lm, i):
		return ((lm[i]['x'] - 0.5) * 2.0 * aspect, (0.5 - lm[i]['y']) * 2.0)

	def dist(a, b):
		return math.hypot(a[0] - b[0], a[1] - b[1])

	out = {'hands': len(landmarks), 'gun': 0}
	per = [{'gun': 0, 'cocked': 0, 'thumb': 0.0, 'side': 0} for _ in range(NSLOTS)]
	seen = set()

	for hi, slot in _assign_slots(landmarks, handedness).items():
		lm = landmarks[hi]
		if len(lm) < 21:
			continue
		seen.add(slot)
		s = _state[slot]
		p = [pt(lm, i) for i in range(21)]
		w = p[WRIST]
		size = max(dist(w, p[MIDDLE_MCP]), 1e-4)

		def ratio(tip, pip):
			return dist(w, p[tip]) / max(dist(w, p[pip]), 1e-4)

		# MediaPipe's own classifier vetoes clearly-open hands
		gesture_name = ''
		veto = False
		if hi < len(mp_gestures) and mp_gestures[hi]:
			top = mp_gestures[hi][0]
			gesture_name = top.get('categoryName', '')
			veto = gesture_name in ('Open_Palm', 'Victory', 'ILoveYou') and top.get('score', 0) > 0.5

		index_out = ratio(INDEX_TIP, INDEX_PIP) > ext_ratio and dist(p[INDEX_MCP], p[INDEX_TIP]) > size * 0.55
		others_in = (ratio(MIDDLE_TIP, MIDDLE_PIP) < 0.98 and ratio(RING_TIP, RING_PIP) < 0.98
		             and ratio(PINKY_TIP, PINKY_PIP) < 0.98)
		is_gun = index_out and others_in and not veto
		s['gun_frames'] = s['gun_frames'] + 1 if is_gun else max(0, s['gun_frames'] - 3)
		gun_ok = s['gun_frames'] >= 8

		raw_thumb = dist(p[THUMB_TIP], p[INDEX_MCP]) / size
		s['thumb'] = raw_thumb if s['thumb'] is None else s['thumb'] * 0.4 + raw_thumb * 0.6
		thumb = s['thumb']

		if gun_ok and thumb > open_thr:
			s['armed'] = True
		if s['gun_frames'] == 0:
			s['armed'] = False

		if gun_ok:
			vx, vy = p[INDEX_TIP][0] - p[INDEX_MCP][0], p[INDEX_TIP][1] - p[INDEX_MCP][1]
			n = math.hypot(vx, vy) or 1.0
			s.update(ox=p[INDEX_TIP][0], oy=p[INDEX_TIP][1], dx=vx / n, dy=vy / n)

		if s['armed'] and gun_ok and thumb < close_thr and (now - s['last_fire']) > cooldown:
			s['armed'] = False
			s['last_fire'] = now
			s['shot'] += 1

		per[slot].update(gun=1 if gun_ok else 0, cocked=1 if (s['armed'] and gun_ok) else 0,
		                 thumb=thumb, side=-1 if w[0] < 0 else 1)
		if gun_ok:
			out['gun'] = 1

		debug_log.append((round(now, 2), slot, round(ratio(INDEX_TIP, INDEX_PIP), 2),
		                  round(dist(p[INDEX_MCP], p[INDEX_TIP]) / size, 2),
		                  round(ratio(MIDDLE_TIP, MIDDLE_PIP), 2), round(ratio(RING_TIP, RING_PIP), 2),
		                  round(ratio(PINKY_TIP, PINKY_PIP), 2), round(raw_thumb, 2),
		                  gesture_name, int(is_gun), s['gun_frames'], int(s['armed']), s['shot']))

	for slot in range(NSLOTS):
		if slot not in seen:
			_state[slot].update(gun_frames=0, armed=False, thumb=None)

	scriptOp.clear()
	scriptOp.numSamples = 1
	for name, val in out.items():
		scriptOp.appendChan(name)[0] = val
	for slot in range(NSLOTS):
		s = _state[slot]
		vals = dict(per[slot], shot=s['shot'], ox=s['ox'], oy=s['oy'], dx=s['dx'], dy=s['dy'])
		for name in ('gun', 'cocked', 'thumb', 'shot', 'ox', 'oy', 'dx', 'dy', 'side'):
			scriptOp.appendChan('%s%d' % (name, slot))[0] = vals[name]
	return
