// Draws glowing particles additively over the camera video.
// WebGL point sprites (one draw call for all particles); Canvas 2D fallback when WebGL is unavailable.

import { STRIDE } from './particles'

export interface Renderer {
  readonly kind: 'webgl' | 'canvas2d'
  resize(cssW: number, cssH: number, dpr: number): void
  /** data: interleaved x, y, radius (CSS px), r, g, b */
  draw(data: Float32Array, count: number): void
}

const VERT = `
attribute vec2 a_pos;
attribute float a_size;
attribute vec3 a_col;
uniform vec2 u_res;
uniform float u_dpr;
uniform float u_maxPoint;
varying vec3 v_col;
void main() {
  vec2 clip = a_pos / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = min(a_size * 5.0 * u_dpr, u_maxPoint);
  v_col = a_col;
}`

const FRAG = `
precision mediump float;
varying vec3 v_col;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = 1.0 - smoothstep(0.26, 0.4, d);
  float halo = pow(1.0 - d, 2.4) * 0.6;
  gl_FragColor = vec4(v_col * (core * 1.25 + halo), 0.0);
}`

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error')
  return sh
}

class GLRenderer implements Renderer {
  readonly kind = 'webgl'
  private gl: WebGLRenderingContext
  private buf: WebGLBuffer
  private uRes: WebGLUniformLocation
  private uDpr: WebGLUniformLocation

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' })
    if (!gl) throw new Error('no webgl')
    this.gl = gl
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link error')
    gl.useProgram(prog)

    this.buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    const f = Float32Array.BYTES_PER_ELEMENT
    const attr = (name: string, size: number, offset: number) => {
      const loc = gl.getAttribLocation(prog, name)
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * f, offset * f)
    }
    attr('a_pos', 2, 0)
    attr('a_size', 1, 2)
    attr('a_col', 3, 3)

    this.uRes = gl.getUniformLocation(prog, 'u_res')!
    this.uDpr = gl.getUniformLocation(prog, 'u_dpr')!
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array
    gl.uniform1f(gl.getUniformLocation(prog, 'u_maxPoint'), range ? range[1] : 64)

    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.clearColor(0, 0, 0, 0)
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.canvas.width = Math.round(cssW * dpr)
    this.canvas.height = Math.round(cssH * dpr)
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    this.gl.uniform2f(this.uRes, cssW, cssH)
    this.gl.uniform1f(this.uDpr, dpr)
  }

  draw(data: Float32Array, count: number) {
    const gl = this.gl
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (count <= 0) return
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * STRIDE), gl.DYNAMIC_DRAW)
    gl.drawArrays(gl.POINTS, 0, count)
  }
}

class Canvas2DRenderer implements Renderer {
  readonly kind = 'canvas2d'
  private ctx: CanvasRenderingContext2D
  private dpr = 1

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr
    this.canvas.width = Math.round(cssW * dpr)
    this.canvas.height = Math.round(cssH * dpr)
  }

  draw(data: Float32Array, count: number) {
    const c = this.ctx
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    c.globalCompositeOperation = 'source-over'
    c.clearRect(0, 0, this.canvas.width, this.canvas.height)
    c.globalCompositeOperation = 'lighter'
    for (let i = 0; i < count; i++) {
      const o = i * STRIDE
      const to255 = (v: number) => Math.min(255, (v * 255) | 0)
      c.fillStyle = `rgb(${to255(data[o + 3])},${to255(data[o + 4])},${to255(data[o + 5])})`
      c.beginPath()
      c.arc(data[o], data[o + 1], Math.max(0.5, data[o + 2]), 0, Math.PI * 2)
      c.fill()
    }
  }
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  try {
    return new GLRenderer(canvas)
  } catch {
    return new Canvas2DRenderer(canvas)
  }
}
