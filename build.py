# Builds /project1/firework (gesture + firework particles + compositing) and the display output.
# Run in TouchDesigner Textport:  exec(open(r'D:/TD-test/Firework/build.py').read())
# Safe to re-run: it deletes and rebuilds the generated nodes.

FOLDER = 'D:/TD-test/Firework'
ROOT = op('/project1')
MP_VIDEO = '/project1/MediaPipe/video'
W, H = 1280, 720
ASPECT = W / H

for _n in ('firework', 'display_out', 'display_window'):
	if ROOT.op(_n):
		ROOT.op(_n).destroy()

fw = ROOT.create(baseCOMP, 'firework')
fw.nodeX, fw.nodeY = 400, 0
fw.color = (0.9, 0.45, 0.1)

# ---------------------------------------------------------------- custom parameters
pg = fw.appendCustomPage('Gesture')
def _f(page, name, label, default, lo, hi):
	p = page.appendFloat(name, label=label)[0]
	p.default = default; p.val = default; p.normMin = lo; p.normMax = hi
	return p
_f(pg, 'Openthr', 'Thumb Open Threshold', 0.55, 0.2, 1.2)
_f(pg, 'Closethr', 'Thumb Click Threshold', 0.38, 0.1, 0.8)
_f(pg, 'Extendratio', 'Finger Extend Ratio', 1.10, 1.0, 1.4)
_f(pg, 'Cooldown', 'Shot Cooldown (s)', 0.25, 0.0, 1.0)
pf = fw.appendCustomPage('Firework')
_f(pf, 'Bulletspeed', 'Bullet Speed', 2.6, 0.5, 6.0)
_f(pf, 'Fuse', 'Fuse Time (s)', 0.55, 0.1, 2.0)
_f(pf, 'Sparks', 'Spark Count', 900, 100, 2500)
_f(pf, 'Flowersize', 'Flower Size', 0.46, 0.1, 0.8)
_f(pf, 'Burstspeed', 'Burst Speed', 1.1, 0.2, 3.0)
_f(pf, 'Gravity', 'Gravity', 0.6, 0.0, 3.0)
_f(pf, 'Drag', 'Air Drag', 1.4, 0.0, 5.0)
_f(pf, 'Sparksize', 'Spark Size', 0.012, 0.001, 0.03)
_f(pf, 'Glow', 'Glow Amount', 1.3, 0.0, 4.0)
ps = fw.appendCustomPage('Sound')
_f(ps, 'Volume', 'Volume', 0.9, 0.0, 1.0)
_f(ps, 'Shootvol', 'Shoot Volume', 0.7, 0.0, 1.0)
_f(ps, 'Boomvol', 'Explosion Volume', 1.0, 0.0, 1.0)
ps.appendToggle('Mute', label='Mute')
pd = fw.appendCustomPage('Display')
_f(pd, 'Bgdim', 'Webcam Brightness', 0.55, 0.0, 1.0)
pd.appendToggle('Showhud', label='Show Debug HUD')[0].val = True

def place(o, x, y):
	o.nodeX, o.nodeY = x * 180, -y * 140
	return o

# ---------------------------------------------------------------- script CHOPs
def script_chop(name, pyfile, x, y):
	cb = fw.create(textDAT, name + '_callbacks')
	cb.par.file = FOLDER + '/' + pyfile
	cb.par.syncfile = True
	place(cb, x, y + 1)
	s = fw.create(scriptCHOP, name)
	auto = fw.op(name + '_callbacks1')
	if auto:
		auto.destroy()
	s.par.callbacks = cb
	return place(s, x, y)

gesture = script_chop('gesture', 'gesture.py', 0, 0)
fx = script_chop('fx', 'fireworks.py', 1, 0)

# force both script CHOPs to cook every frame, even when nothing is viewing them
ticker = place(fw.create(executeDAT, 'tick'), 0, -1)
ticker.text = (
	"def onFrameStart(frame):\n"
	"\top('gesture').cook(force=True)\n"
	"\top('fx').cook(force=True)\n"
	"\treturn\n"
)
ticker.par.framestart = True
ticker.par.active = True

# ---------------------------------------------------------------- 3D particles
mat = place(fw.create(constantMAT, 'spark_mat'), 2, 2)
mat.par.blending = True
mat.par.srcblend = 'one'
mat.par.destblend = 'one'
mat.par.depthtest = False
mat.par.depthwriting = False

geo = place(fw.create(geometryCOMP, 'particles'), 2, 0)
for c in list(geo.children):
	c.destroy()
sph = geo.create(sphereSOP, 'spark')
sph.par.type = 'poly'; sph.par.rows = 6; sph.par.cols = 8
sph.render = True; sph.display = True
geo.par.material = mat
geo.par.instancing = True
geo.par.instanceop = fx
geo.par.instancetx = 'tx'; geo.par.instancety = 'ty'; geo.par.instancetz = 'tz'
geo.par.instancesop = fx
geo.par.instancesx = 'sx'; geo.par.instancesy = 'sx'; geo.par.instancesz = 'sx'
geo.par.instancecolorop = fx
geo.par.instancer = 'r'; geo.par.instanceg = 'g'; geo.par.instanceb = 'b'; geo.par.instancea = 'a'

cam = place(fw.create(cameraCOMP, 'cam'), 2, 1)
cam.par.projection = 'ortho'
cam.par.orthowidth = 2 * ASPECT
cam.par.tz = 5

render = place(fw.create(renderTOP, 'render'), 3, 0)
render.par.camera = cam
render.par.geometry = geo
render.par.lights = ''
render.par.outputresolution = 'custom'
render.par.resolutionw = W; render.par.resolutionh = H

# ---------------------------------------------------------------- glow
blur_s = place(fw.create(blurTOP, 'glow_small'), 4, 1)
blur_s.inputConnectors[0].connect(render)
blur_s.par.size = 10
blur_l = place(fw.create(blurTOP, 'glow_large'), 4, 2)
blur_l.inputConnectors[0].connect(render)
blur_l.par.size = 45
lvl_s = place(fw.create(levelTOP, 'glow_small_lvl'), 5, 1)
lvl_s.inputConnectors[0].connect(blur_s)
lvl_s.par.brightness1.expr = "parent().par.Glow * 1.5"
lvl_l = place(fw.create(levelTOP, 'glow_large_lvl'), 5, 2)
lvl_l.inputConnectors[0].connect(blur_l)
lvl_l.par.brightness1.expr = "parent().par.Glow * 2.5"
fx_add = place(fw.create(compositeTOP, 'fx_glow'), 6, 0)
fx_add.par.operand = 'add'
for src in (render, lvl_s, lvl_l):
	fx_add.inputConnectors[len(fx_add.inputs)].connect(src)

# ---------------------------------------------------------------- webcam background
video = place(fw.create(selectTOP, 'video_in'), 5, -1)
video.par.top = MP_VIDEO
vdim = place(fw.create(levelTOP, 'video_dim'), 6, -1)
vdim.inputConnectors[0].connect(video)
vdim.par.brightness1.expr = "parent().par.Bgdim"

scene = place(fw.create(compositeTOP, 'scene'), 7, 0)
scene.par.operand = 'add'
scene.inputConnectors[0].connect(vdim)
scene.inputConnectors[1].connect(fx_add)

# ---------------------------------------------------------------- HUD
hud = place(fw.create(textTOP, 'hud'), 7, 1)
hud.par.outputresolution = 'custom'
hud.par.resolutionw = W; hud.par.resolutionh = H
hud.par.bgalpha = 0
hud.par.alignx = 'left'; hud.par.aligny = 'top'
hud.par.positionx = 20; hud.par.positiony = -20
hud.par.fontsizex = 22
hud.par.fontalpha.expr = "1 if parent().par.Showhud else 0"
HUD_EXPR = (
	"(lambda g: '\\n'.join("
	"'%s hand:  %s%s   thumb %.2f   shots %d' % ("
	"'LEFT' if g['side%d' % i][0] < 0 else 'RIGHT', "
	"'GUN ON' if g['gun%d' % i][0] > 0.5 else 'gun off', "
	"'  [COCKED - click!]' if g['cocked%d' % i][0] > 0.5 else '', "
	"g['thumb%d' % i][0], g['shot%d' % i][0]) "
	"for i in (0, 1) if g['side%d' % i][0] != 0) or 'no hands')(op('gesture'))"
)
hud.par.text.expr = HUD_EXPR

final = place(fw.create(overTOP, 'final'), 8, 0)
final.inputConnectors[0].connect(hud)
final.inputConnectors[1].connect(scene)
out_null = place(fw.create(nullTOP, 'OUT'), 9, 0)
out_null.inputConnectors[0].connect(final)
out_top = place(fw.create(outTOP, 'out1'), 10, 0)
out_top.inputConnectors[0].connect(out_null)

# ---------------------------------------------------------------- sound effects
# fireworks.py triggers these players (round robin so sounds can overlap)
players = [('shoot1', 'shoot.wav', 'Shootvol'), ('shoot2', 'shoot.wav', 'Shootvol'),
           ('boom1', 'boom1.wav', 'Boomvol'), ('boom2', 'boom2.wav', 'Boomvol'), ('boom3', 'boom3.wav', 'Boomvol')]
mix = place(fw.create(mathCHOP, 'sfx_mix'), 3, 5)
mix.par.chopop = 'add'
for i, (name, wav, volpar) in enumerate(players):
	a = place(fw.create(audiofileinCHOP, name), 2, 3 + i * 0.7)
	a.par.file = FOLDER + '/sounds/' + wav
	a.par.playmode = 'sequential'
	a.par.repeat = 'off'
	a.par.mono = True
	a.par.play = False
	a.par.volume.expr = "parent().par.%s" % volpar
	mix.inputConnectors[i].connect(a)
aout = place(fw.create(audiodeviceoutCHOP, 'sfx_out'), 4, 5)
aout.inputConnectors[0].connect(mix)
aout.par.volume.expr = "0 if parent().par.Mute else parent().par.Volume"

# ---------------------------------------------------------------- display output (project level)
disp = ROOT.create(nullTOP, 'display_out')
disp.nodeX, disp.nodeY = 650, 0
disp.inputConnectors[0].connect(fw.outputConnectors[0])
disp.viewer = True
disp.color = (0.2, 0.7, 0.3)

win = ROOT.create(windowCOMP, 'display_window')
win.nodeX, win.nodeY = 650, -180
win.par.winop = disp
win.par.winw = W; win.par.winh = H
win.par.justifyh = 'center'; win.par.justifyv = 'center'
win.par.borders = True

print('firework build OK -> /project1/firework, /project1/display_out, /project1/display_window')
