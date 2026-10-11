/**
 * Motor do carrossel côncavo (parede curva em WebGL2).
 *
 * Portado para vanilla a partir de um componente React: só o invólucro era
 * React — este motor sempre foi JS puro. Ele cuida de GL, física (arrasto,
 * inércia, mola, autoplay), hit-test e desenho; quem usa fornece a config via
 * `getConfig()` a cada frame e recebe `onActive`/`onSelect` de volta. A camada
 * de DOM/UX fica no componente .astro (ver ProjetosDestaque.astro).
 *
 * Sem dependências. WebGL2 obrigatório: se não houver, `createConcaveEngine`
 * devolve `null` e o chamador mantém o fallback acessível no DOM.
 */

export type ConcaveAutoplay = 'drift' | 'step' | 'off';

export interface ConcavePalette {
  /** Cor de fundo resolvida (0..1, RGBA). */
  bg: [number, number, number, number];
  /** Cor do painel enquanto a textura não carregou. */
  placeholder: [number, number, number, number];
  /** Cor de texto derivada, como string "r g b" para a var --cc-fg. */
  fg: string;
}

export interface ConcaveConfig {
  count: number;
  aspect: number;
  size: number;
  curvature: number;
  distance: number;
  tilt: number;
  gap: number;
  radius: number;
  reflection: number;
  dim: number;
  autoplay: ConcaveAutoplay;
  speed: number;
  interval: number;
  snap: boolean;
  inertia: number;
  pauseOnHover: boolean;
  draggable: boolean;
  wheel: boolean;
  paused: boolean;
  reducedMotion: boolean;
  dpr: number;
  palette: ConcavePalette | null;
}

export interface ConcaveCallbacks {
  startIndex: number;
  getConfig: () => ConcaveConfig;
  onActive: (index: number) => void;
  onSelect: (index: number) => void;
}

export interface ConcaveEngine {
  setItems: (srcs: string[]) => void;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
  selectCurrent: () => void;
  pointerDown: (e: PointerEvent) => void;
  pointerMove: (e: PointerEvent) => void;
  pointerUp: (e: PointerEvent, cancel?: boolean) => void;
  pointerLeave: () => void;
  invalidate: () => void;
  destroy: () => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Módulo sempre positivo (−1 mod 4 = 3). */
const mod = (value: number, size: number) => ((value % size) + size) % size;

// ─── Leitura de cor ────────────────────────────────────────────────────────
// Um canvas 1x1 resolve qualquer cor CSS (nome, var, hex, rgb) para RGBA 0..1.

let probeCtx: CanvasRenderingContext2D | null = null;

function parseColor(css: string): [number, number, number, number] {
  if (!probeCtx) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    probeCtx = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!probeCtx || !css) return [0, 0, 0, 0];
  probeCtx.clearRect(0, 0, 1, 1);
  probeCtx.fillStyle = 'rgba(0,0,0,0)';
  probeCtx.fillStyle = css;
  probeCtx.fillRect(0, 0, 1, 1);
  const d = probeCtx.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
}

/**
 * Deriva a paleta a partir do fundo pedido e da cor de texto herdada do host.
 * Fundo transparente → placeholder é a cor de texto a 8% e as bordas somem
 * (o fundo real da seção aparece atrás do canvas).
 */
export function readPalette(host: HTMLElement, backgroundColor: string): ConcavePalette {
  const probe = document.createElement('span');
  probe.style.cssText =
    'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none';
  probe.style.backgroundColor = backgroundColor;
  host.appendChild(probe);
  const resolvedBg = getComputedStyle(probe).backgroundColor;
  probe.remove();

  const fg = parseColor(getComputedStyle(host.parentElement ?? host).color);
  const bg = parseColor(resolvedBg);
  const toRgb = (c: number[]) =>
    c.slice(0, 3).map((v) => Math.round(v * 255)).join(' ');

  if (bg[3] < 0.02) {
    return { bg: [0, 0, 0, 0], placeholder: [fg[0], fg[1], fg[2], 0.08], fg: toRgb(fg) };
  }

  const luma = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
  const ink: number[] = luma < 0.45 ? [0.95, 0.95, 0.94] : [0.08, 0.08, 0.09];
  const mix = (a: number, b: number) => a + (b - a) * 0.07;
  return {
    bg,
    placeholder: [mix(bg[0], ink[0]), mix(bg[1], ink[1]), mix(bg[2], ink[2]), 1],
    fg: toRgb(ink),
  };
}

// ─── Shaders ─────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
precision highp float;
in vec2 aUv;
uniform float uS;        // arc position of the panel centre (world units)
uniform vec2  uSize;     // panel width, height
uniform float uKappa;    // curvature = 1 / radius (0 = flat)
uniform float uDist;     // camera distance from the centred panel
uniform vec2  uTilt;     // cos, sin of pitch
uniform float uFocal;
uniform float uAspect;   // canvas width / height
uniform float uYShift;   // vertical offset in NDC
uniform float uMirror;   // 1 = floor reflection pass
uniform float uFloor;    // gap between wall and floor
out vec2 vUv;
out vec2 vLocal;
out float vNdcX;

void main() {
  float s = uS + (aUv.x - 0.5) * uSize.x;
  float y = (aUv.y - 0.5) * uSize.y;
  if (uMirror > 0.5) y = -uSize.y - 2.0 * uFloor - y;

  vec3 p = vec3(s, y, 0.0);
  if (uKappa > 1e-5) {
    float r = 1.0 / uKappa;
    float th = s * uKappa;
    p = vec3(r * sin(th), y, r * (1.0 - cos(th)));  // bends toward the viewer
  }
  vec3 q = vec3(p.x, p.y * uTilt.x - p.z * uTilt.y, p.y * uTilt.y + p.z * uTilt.x);
  float depth = uDist - q.z;
  const float near = 0.04;
  gl_Position = vec4(q.x * uFocal / uAspect, q.y * uFocal + uYShift * depth, depth - 2.0 * near, depth);

  vUv = aUv;
  vLocal = (aUv - 0.5) * uSize;
  vNdcX = q.x * uFocal / uAspect / max(depth, 1e-3);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vLocal;
in float vNdcX;
uniform sampler2D uTex;
uniform float uHasTex;
uniform float uOpacity;
uniform vec2  uUvScale;
uniform vec2  uSize;
uniform float uRadius;
uniform vec4  uPlaceholder;
uniform vec4  uBg;
uniform float uDim;
uniform float uMirror;
uniform float uReflection;
out vec4 outColor;

float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  float d = roundedBox(vLocal, uSize * 0.5, uRadius);
  float aa = fwidth(d) * 0.75;
  float mask = 1.0 - smoothstep(-aa, aa, d);
  if (mask <= 0.0) discard;

  vec4 col = uPlaceholder;
  if (uHasTex > 0.5) {
    vec3 t = texture(uTex, 0.5 + (vUv - 0.5) * uUvScale).rgb;
    col = vec4(mix(uPlaceholder.rgb, t, uOpacity), mix(uPlaceholder.a, 1.0, uOpacity));
  }
  float alpha = col.a * mask;
  if (uMirror > 0.5) alpha *= uReflection * smoothstep(0.6, 0.0, vUv.y);

  float fade = uDim * smoothstep(0.12, 1.05, abs(vNdcX));
  vec3 rgb = mix(col.rgb, uBg.rgb, fade * uBg.a);
  alpha *= 1.0 - fade * (1.0 - uBg.a);
  outColor = vec4(rgb * alpha, alpha);
}`;

const UNIFORMS = [
  'uS', 'uSize', 'uKappa', 'uDist', 'uTilt', 'uFocal', 'uAspect', 'uYShift',
  'uMirror', 'uFloor', 'uTex', 'uHasTex', 'uOpacity', 'uUvScale', 'uRadius',
  'uPlaceholder', 'uBg', 'uDim', 'uReflection',
] as const;

/** TEXTURE_MAX_ANISOTROPY_EXT — a constante não existe no tipo padrão do GL. */
const TEXTURE_MAX_ANISOTROPY_EXT = 0x84fe;

interface GLCtx {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  indexCount: number;
  white: WebGLTexture;
  u: Record<string, WebGLUniformLocation | null>;
  aniso: number;
  maxTex: number;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile failed');
  }
  return shader;
}

function initGL(canvas: HTMLCanvasElement): GLCtx | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const program = gl.createProgram()!;
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.bindAttribLocation(program, 0, 'aUv');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'program link failed');
  }

  // Tira de quads ao longo da largura do painel: curvar a parede precisa de
  // subdivisão, uma só face não dobra.
  const segments = 48;
  const verts = new Float32Array((segments + 1) * 4);
  for (let i = 0; i <= segments; i++) verts.set([i / segments, 0, i / segments, 1], i * 4);
  const indices = new Uint16Array(segments * 6);
  for (let i = 0; i < segments; i++) {
    const v = i * 2;
    indices.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], i * 6);
  }

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const ebo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const white = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, white);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const name of UNIFORMS) u[name] = gl.getUniformLocation(program, name);

  const ext = gl.getExtension('EXT_texture_filter_anisotropic');
  const aniso = ext ? Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 0;

  return {
    gl, program, vao, indexCount: indices.length, white, u, aniso,
    maxTex: Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE)),
  };
}

function uploadTexture(ctx: GLCtx, img: HTMLImageElement): WebGLTexture {
  const { gl } = ctx;
  let source: CanvasImageSource = img;
  const largest = Math.max(img.naturalWidth, img.naturalHeight);
  if (largest > ctx.maxTex) {
    const scale = ctx.maxTex / largest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    source = canvas;
  }
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (ctx.aniso > 1) gl.texParameterf(gl.TEXTURE_2D, TEXTURE_MAX_ANISOTROPY_EXT, ctx.aniso);
  return tex;
}

interface Geom {
  D: number; W: number; H: number; P: number; f: number; kappa: number;
  ct: number; st: number; aspect: number; scale: number; radius: number;
  floor: number; yShift: number;
}

function computeGeometry(cfg: ConcaveConfig, width: number, height: number): Geom {
  const D = Math.max(0.6, cfg.distance);
  const aspect = Math.max(0.1, cfg.aspect);
  const H = 1;
  const scale = Math.max(0.001, Math.min(clamp(cfg.size, 0.05, 1) * height, 0.86 * width / aspect));
  const gap = Math.max(0, cfg.gap) / scale;
  const tilt = clamp(cfg.tilt, -60, 60) * Math.PI / 180;
  return {
    D,
    W: aspect,
    H,
    P: aspect + gap,
    f: 2 * D * scale / height,
    kappa: Math.pow(clamp(cfg.curvature, 0, 1), 1.5) * 1.7 / D,
    ct: Math.cos(tilt),
    st: Math.sin(tilt),
    aspect: width / height,
    scale,
    radius: Math.min(Math.max(0, cfg.radius) / scale, Math.min(aspect, H) / 2),
    floor: Math.max(gap * 0.6, 0.02),
    yShift: cfg.reflection > 0 ? 0.07 : 0,
  };
}

interface TexEntry {
  img: HTMLImageElement;
  tex: WebGLTexture | null;
  w: number;
  h: number;
  readyAt: number;
  failed: boolean;
}

type Mode = 'free' | 'spring' | 'coast' | 'drag';

interface Press {
  id: number; x: number; y: number; moved: boolean; prevMode: Mode; prevTarget: number;
}

interface Drag {
  grabbed: number;
  samples: { t: number; p: number }[];
}

interface HitResult {
  s: number; y: number; index: number; inBand: boolean; inside: boolean;
}

/**
 * Cria o motor ligado a um `<canvas>` e a um `host` (que recebe os eventos de
 * ponteiro/roda e é medido pelo ResizeObserver). Devolve `null` sem WebGL2.
 */
export function createConcaveEngine(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  cb: ConcaveCallbacks,
): ConcaveEngine | null {
  let ctx = initGL(canvas);
  if (!ctx) return null;

  const cache = new Map<string, TexEntry>();
  let srcs: string[] = [];

  const state = {
    pos: cb.startIndex,
    vel: 0,
    target: cb.startIndex,
    mode: 'free' as Mode,
    stepTimer: 0,
    hovering: false,
    active: Number.NaN,
    press: null as Press | null,
    drag: null as Drag | null,
    wheelAcc: 0,
    wheelT: 0,
  };

  let viewW = 0;
  let viewH = 0;
  let needsResize = true;
  let dirty = true;
  let signature = '';
  let visible = true;
  let rafId = 0;
  let lastTime = performance.now();
  let geom: Geom | null = null;

  function setItems(list: string[]): void {
    srcs = list;
    const keep = new Set(list);
    for (const [src, entry] of cache) {
      if (keep.has(src)) continue;
      if (entry.tex && ctx) ctx.gl.deleteTexture(entry.tex);
      entry.img.onload = entry.img.onerror = null;
      cache.delete(src);
    }
    for (const src of list) {
      if (cache.has(src)) continue;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      const entry: TexEntry = { img, tex: null, w: 1, h: 1, readyAt: 0, failed: false };
      img.onload = () => {
        entry.w = img.naturalWidth || 1;
        entry.h = img.naturalHeight || 1;
        if (ctx && !ctx.gl.isContextLost()) {
          try {
            entry.tex = uploadTexture(ctx, img);
          } catch {
            entry.failed = true;
            console.warn(`[ConcaveCarousel] "${src}" não pôde virar textura (CORS?).`);
          }
        }
        entry.readyAt = performance.now();
        dirty = true;
      };
      img.onerror = () => {
        entry.failed = true;
        console.warn(`[ConcaveCarousel] falha ao carregar "${src}".`);
      };
      img.src = src;
      cache.set(src, entry);
    }
    dirty = true;
  }

  const onContextLost = (e: Event) => {
    e.preventDefault();
    ctx = null;
    for (const entry of cache.values()) entry.tex = null;
  };

  const onContextRestored = () => {
    ctx = initGL(canvas);
    if (!ctx) return;
    for (const entry of cache.values()) {
      if (entry.img.complete && entry.img.naturalWidth && !entry.failed) {
        entry.tex = uploadTexture(ctx, entry.img);
      }
    }
    needsResize = dirty = true;
  };

  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  const resizeObserver = new ResizeObserver(([entry]) => {
    viewW = entry.contentRect.width;
    viewH = entry.contentRect.height;
    needsResize = true;
  });
  resizeObserver.observe(host);

  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    dirty = true;
  });
  intersectionObserver.observe(host);

  // Projeta o ponto da tela de volta para a parede: resolve qual painel (e qual
  // posição dentro dele) está sob o cursor. Reta no caso plano; interseção
  // raio-cilindro quando curvo.
  function hitTest(clientX: number, clientY: number): HitResult | null {
    const cfg = cb.getConfig();
    if (!geom || !cfg.count) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const g = geom;
    const ndcX = (clientX - rect.left) / rect.width * 2 - 1;
    const ndcY = 1 - (clientY - rect.top) / rect.height * 2 - g.yShift;
    const rx = ndcX * g.aspect / g.f;
    const ry = ndcY / g.f;
    const rz = -1;
    const dirX = rx;
    const dirY = ry * g.ct + rz * g.st;
    const dirZ = -ry * g.st + rz * g.ct;
    const ox = 0;
    const oy = g.D * g.st;
    const oz = g.D * g.ct;
    let s: number;
    let y: number;
    if (g.kappa < 1e-5) {
      if (Math.abs(dirZ) < 1e-6) return null;
      const t = -oz / dirZ;
      if (t <= 0) return null;
      s = ox + t * dirX;
      y = oy + t * dirY;
    } else {
      const r = 1 / g.kappa;
      const cx = ox;
      const cz = oz - r;
      const a = dirX * dirX + dirZ * dirZ;
      const b = 2 * (cx * dirX + cz * dirZ);
      const c = cx * cx + cz * cz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0 || a < 1e-9) return null;
      const t = (-b + Math.sqrt(disc)) / (2 * a);
      if (t <= 0) return null;
      const hx = cx + t * dirX;
      const hz = cz + t * dirZ;
      s = Math.atan2(hx, -hz) * r;
      y = oy + t * dirY;
    }
    const raw = s / g.P + state.pos;
    const index = Math.round(raw);
    const local = s - (index - state.pos) * g.P;
    const inBand = Math.abs(y) <= g.H / 2;
    return { s, y, index, inBand, inside: inBand && Math.abs(local) <= g.W / 2 };
  }

  function updateCursor(over: boolean): void {
    const cfg = cb.getConfig();
    host.style.cursor =
      state.drag && state.press?.moved ? 'grabbing' : over ? 'pointer' : cfg.draggable ? 'grab' : 'default';
  }

  function springTo(target: number): void {
    state.target = target;
    state.mode = 'spring';
    state.stepTimer = 0;
  }

  const currentTarget = () => (state.mode === 'spring' ? state.target : Math.round(state.pos));

  function next(): void {
    springTo(currentTarget() + 1);
  }
  function previous(): void {
    springTo(currentTarget() - 1);
  }
  function goTo(index: number): void {
    const count = cb.getConfig().count;
    if (!count) return;
    const from = currentTarget();
    let delta = mod(index, count) - mod(from, count);
    if (delta > count / 2) delta -= count;
    if (delta < -count / 2) delta += count;
    springTo(from + delta);
  }
  function selectCurrent(): void {
    const count = cb.getConfig().count;
    if (count) cb.onSelect(mod(currentTarget(), count));
  }

  function pointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const cfg = cb.getConfig();
    const hit = hitTest(e.clientX, e.clientY);
    state.press = {
      id: e.pointerId, x: e.clientX, y: e.clientY, moved: false,
      prevMode: state.mode, prevTarget: state.target,
    };
    if (cfg.draggable && hit && geom) {
      try {
        host.setPointerCapture(e.pointerId);
      } catch {
        /* ignora */
      }
      state.drag = { grabbed: hit.s + state.pos * geom.P, samples: [{ t: performance.now(), p: state.pos }] };
      state.mode = 'drag';
      state.vel = 0;
    }
  }

  function pointerMove(e: PointerEvent): void {
    const hit = hitTest(e.clientX, e.clientY);
    state.hovering = !!hit?.inBand;
    if (state.press && e.pointerId === state.press.id) {
      if (!state.press.moved && Math.hypot(e.clientX - state.press.x, e.clientY - state.press.y) > 6) {
        state.press.moved = true;
      }
      if (state.drag && hit && geom) {
        state.pos = (state.drag.grabbed - hit.s) / geom.P;
        const now = performance.now();
        state.drag.samples.push({ t: now, p: state.pos });
        while (state.drag.samples.length > 2 && now - state.drag.samples[0].t > 120) {
          state.drag.samples.shift();
        }
      }
    }
    updateCursor(!!hit?.inside);
  }

  function pointerUp(e: PointerEvent, cancel = false): void {
    const press = state.press;
    if (!press || e.pointerId !== press.id) return;
    state.press = null;
    try {
      host.releasePointerCapture(e.pointerId);
    } catch {
      /* ignora */
    }
    const cfg = cb.getConfig();
    if (!press.moved && !cancel) {
      // Clique, não arrasto: seleciona o painel central, ou gira até o clicado.
      state.drag = null;
      const hit = hitTest(e.clientX, e.clientY);
      const prev = press.prevMode === 'spring' ? press.prevTarget : Math.round(state.pos);
      if (hit?.inside) {
        if (hit.index === prev && Math.abs(state.pos - prev) < 0.4) {
          cb.onSelect(mod(prev, cfg.count));
          if (state.mode === 'drag') {
            if (cfg.snap) springTo(prev);
            else state.mode = 'free';
          }
        } else {
          springTo(hit.index);
        }
      } else if (press.prevMode === 'spring') {
        springTo(press.prevTarget);
      } else if (state.mode === 'drag') {
        if (cfg.snap) springTo(Math.round(state.pos));
        else state.mode = 'free';
      }
      updateCursor(!!hit?.inside);
      return;
    }
    if (state.drag) {
      // Solta com velocidade: calcula o arremesso pelas amostras recentes.
      const samples = state.drag.samples;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = (last.t - first.t) / 1000;
      const fresh = performance.now() - last.t < 80;
      const vel = dt > 0.005 && fresh ? clamp((last.p - first.p) / dt, -25, 25) : 0;
      state.drag = null;
      state.stepTimer = 0;
      if (cfg.snap) {
        const reach = clamp(cfg.inertia, 0, 1) * 0.9;
        state.vel = vel * (0.3 + 0.7 * clamp(cfg.inertia, 0, 1));
        springTo(Math.round(state.pos + vel * reach));
      } else {
        state.vel = vel * clamp(cfg.inertia, 0, 1);
        state.mode = 'coast';
      }
    }
    updateCursor(false);
  }

  function pointerLeave(): void {
    state.hovering = false;
  }

  const onWheel = (e: WheelEvent) => {
    const cfg = cb.getConfig();
    if (!cfg.wheel || !cfg.count) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!delta) return;
    e.preventDefault();
    const now = performance.now();
    if (now - state.wheelT > 220) state.wheelAcc = 0;
    state.wheelT = now;
    if (e.deltaMode !== 0 || Math.abs(delta) >= 40) {
      state.wheelAcc = 0;
      if (delta > 0) next();
      else previous();
      return;
    }
    state.wheelAcc += delta;
    if (Math.abs(state.wheelAcc) >= 110) {
      if (state.wheelAcc > 0) next();
      else previous();
      state.wheelAcc = 0;
    }
  };
  host.addEventListener('wheel', onWheel, { passive: false });

  // Integra a física do frame conforme o modo atual.
  function advance(dt: number, cfg: ConcaveConfig): void {
    const autoplay = cfg.autoplay !== 'off' && !cfg.paused && !cfg.reducedMotion;
    const hoverPaused = cfg.pauseOnHover && state.hovering;
    switch (state.mode) {
      case 'drag':
        break;
      case 'spring': {
        const accel = -72.25 * (state.pos - state.target) - 17 * state.vel;
        state.vel += accel * dt;
        state.pos += state.vel * dt;
        if (Math.abs(state.pos - state.target) < 1e-4 && Math.abs(state.vel) < 0.001) {
          state.pos = state.target;
          state.vel = 0;
          state.mode = 'free';
          state.stepTimer = 0;
        }
        break;
      }
      case 'coast': {
        const damp = 1.2 + (1 - clamp(cfg.inertia, 0, 1)) * 7;
        state.vel *= Math.exp(-damp * dt);
        state.pos += state.vel * dt;
        if (Math.abs(state.vel) < 0.03) {
          state.vel = 0;
          state.mode = 'free';
        }
        break;
      }
      case 'free': {
        const drift = autoplay && cfg.autoplay === 'drift' && !hoverPaused ? cfg.speed : 0;
        state.vel += (drift - state.vel) * (1 - Math.exp(-dt * (drift === 0 ? 4 : 1.6)));
        if (drift === 0 && Math.abs(state.vel) < 1e-4) state.vel = 0;
        state.pos += state.vel * dt;
        if (drift === 0 && cfg.snap && Math.abs(state.vel) < 0.04) {
          const nearest = Math.round(state.pos);
          if (Math.abs(state.pos - nearest) > 1e-4) {
            state.target = nearest;
            state.mode = 'spring';
          }
        }
        if (autoplay && cfg.autoplay === 'step' && !hoverPaused) {
          state.stepTimer += dt;
          if (state.stepTimer >= Math.max(0.3, cfg.interval)) {
            springTo(Math.round(state.pos) + (cfg.speed < 0 ? -1 : 1));
          }
        }
        // Mantém `pos` perto de zero para não perder precisão com o tempo.
        if (Math.abs(state.pos) > 1e4 && cfg.count) {
          const wraps = Math.round(state.pos / cfg.count) * cfg.count;
          state.pos -= wraps;
          state.target -= wraps;
        }
        break;
      }
    }
  }

  // Desenha a parede. Devolve true se alguma textura ainda está surgindo
  // (fade-in), para o loop se manter ativo até terminar.
  function render(cfg: ConcaveConfig, now: number): boolean {
    if (!ctx || !geom || !cfg.palette) return false;
    const { gl, u } = ctx;
    const g = geom;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!cfg.count || !srcs.length) return false;
    gl.useProgram(ctx.program);
    gl.bindVertexArray(ctx.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u.uTex, 0);
    gl.uniform2f(u.uSize, g.W, g.H);
    gl.uniform1f(u.uKappa, g.kappa);
    gl.uniform1f(u.uDist, g.D);
    gl.uniform2f(u.uTilt, g.ct, g.st);
    gl.uniform1f(u.uFocal, g.f);
    gl.uniform1f(u.uAspect, g.aspect);
    gl.uniform1f(u.uYShift, g.yShift);
    gl.uniform1f(u.uFloor, g.floor);
    gl.uniform1f(u.uRadius, g.radius);
    gl.uniform4fv(u.uPlaceholder, cfg.palette.placeholder);
    gl.uniform4fv(u.uBg, cfg.palette.bg);
    gl.uniform1f(u.uDim, clamp(cfg.dim, 0, 1));
    gl.uniform1f(u.uReflection, clamp(cfg.reflection, 0, 1));

    const halfSpan = g.D * g.aspect / g.f;
    const maxArc = g.kappa > 1e-5 ? Math.PI / g.kappa : Infinity;
    const range = Math.min(80, Math.ceil(Math.min(halfSpan * 1.6, maxArc) / g.P) + 2);
    const base = Math.floor(state.pos);
    const panels: { i: number; sc: number }[] = [];
    for (let k = -range; k <= range + 1; k++) {
      const i = base + k;
      const sc = (i - state.pos) * g.P;
      if (g.kappa > 1e-5 && Math.abs(sc * g.kappa) > Math.PI * 0.96) continue;
      panels.push({ i, sc });
    }
    // Desenha dos extremos para o centro, para o painel central ficar por cima.
    panels.sort((a, b) => Math.abs(a.sc) - Math.abs(b.sc));

    let fadingIn = false;
    const passes = cfg.reflection > 0 ? [1, 0] : [0];
    for (const mirror of passes) {
      gl.uniform1f(u.uMirror, mirror);
      for (const { i, sc } of panels) {
        const src = srcs[mod(i, cfg.count)];
        const entry = src ? cache.get(src) : undefined;
        const hasTex = !!entry?.tex;
        const opacity = hasTex ? clamp((now - entry!.readyAt) / 450, 0, 1) : 0;
        if (hasTex && opacity < 1) fadingIn = true;
        gl.bindTexture(gl.TEXTURE_2D, hasTex ? entry!.tex : ctx.white);
        gl.uniform1f(u.uHasTex, hasTex ? 1 : 0);
        gl.uniform1f(u.uOpacity, opacity);
        if (hasTex) {
          const imgAspect = entry!.w / entry!.h;
          const panelAspect = g.W / g.H;
          if (imgAspect > panelAspect) gl.uniform2f(u.uUvScale, panelAspect / imgAspect, 1);
          else gl.uniform2f(u.uUvScale, 1, imgAspect / panelAspect);
        } else {
          gl.uniform2f(u.uUvScale, 1, 1);
        }
        gl.uniform1f(u.uS, sc);
        gl.drawElements(gl.TRIANGLES, ctx.indexCount, gl.UNSIGNED_SHORT, 0);
      }
    }
    gl.bindVertexArray(null);
    return fadingIn;
  }

  function frame(now: number): void {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    const cfg = cb.getConfig();
    if (!cfg.count) {
      if (ctx && dirty) {
        ctx.gl.clearColor(0, 0, 0, 0);
        ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT);
        dirty = false;
      }
      return;
    }
    advance(dt, cfg);
    const active = mod(Math.round(state.pos), cfg.count);
    if (active !== state.active) {
      const first = Number.isNaN(state.active);
      state.active = active;
      if (!first) cb.onActive(active);
    }
    if (!visible || !ctx || !viewW || !viewH) return;
    const ratio = Math.min(window.devicePixelRatio || 1, Math.max(0.5, cfg.dpr));
    const w = Math.max(1, Math.round(viewW * ratio));
    const h = Math.max(1, Math.round(viewH * ratio));
    if (needsResize || canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      needsResize = false;
      dirty = true;
    }
    geom = computeGeometry(cfg, viewW, viewH);
    const sig = `${state.pos.toFixed(5)}|${w}x${h}|${cfg.aspect}|${cfg.size}|${cfg.curvature}|${cfg.distance}|${cfg.tilt}|${cfg.gap}|${cfg.radius}|${cfg.reflection}|${cfg.dim}|${cfg.palette?.bg}|${cfg.palette?.placeholder}|${cfg.count}`;
    if (sig !== signature || dirty) {
      signature = sig;
      dirty = render(cfg, now);
    }
  }

  rafId = requestAnimationFrame(frame);

  return {
    setItems,
    next,
    previous,
    goTo,
    selectCurrent,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerLeave,
    invalidate: () => {
      dirty = true;
    },
    destroy() {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      host.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (ctx) {
        for (const entry of cache.values()) if (entry.tex) ctx.gl.deleteTexture(entry.tex);
        ctx.gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      for (const entry of cache.values()) entry.img.onload = entry.img.onerror = null;
      cache.clear();
      ctx = null;
    },
  };
}
