/**
 * <neon-reveal> — custom element que revela o conteúdo filho com uma varredura
 * de "tubo de neon" desenhada em WebGL por trás (o conteúdo é mascarado por CSS
 * e vai aparecendo conforme a luz passa).
 *
 * Já era agnóstico de framework (Web Component puro); aqui ele só foi tipado e
 * exposto via `defineNeonReveal()`. Sem dependências. Sem WebGL, o conteúdo
 * aparece normalmente (degrada para "aceso"); `prefers-reduced-motion` idem.
 *
 * Configuração via atributo `data-config` (JSON). Ver NeonReveal.astro.
 */

export type NeonDirection = 'down' | 'up' | 'left' | 'right';
export type NeonExpand = 'center' | 'left' | 'right';
export type NeonTrigger = 'mount' | 'inView' | 'manual';
export type NeonEasing = 'out' | 'smooth' | 'gentle' | 'linear';

export interface NeonConfig {
  colors: [string, string];
  backgroundColor: string;
  direction: NeonDirection;
  expandFrom: NeonExpand;
  trigger: NeonTrigger;
  revealDelay: number;
  revealDuration: number;
  easing: NeonEasing;
  thickness: number;
  glow: number;
  spill: number;
  reach: number;
  intensity: number;
  feather: number;
  inset: number;
  length: number;
  mirrored: boolean;
  hum: number;
  flicker: number;
  interactive: boolean;
  intro: boolean;
  paused: boolean;
  dpr: number;
  scrollThreshold: number;
  /** Força o modo de render, ignorando a detecção pela luminância do fundo.
   *  'dark' mantém o feixe aditivo/reluzente (blend screen) mesmo sobre um fundo
   *  claro; 'light' força o modo pastel. Sem valor = detecta automático. */
  forceMode?: 'light' | 'dark';
}

export const NEON_DEFAULTS: NeonConfig = {
  colors: ['#FF9FFC', '#B163E9'],
  backgroundColor: 'transparent',
  direction: 'down',
  expandFrom: 'center',
  trigger: 'mount',
  revealDelay: 0,
  revealDuration: 2500,
  easing: 'out',
  thickness: 3,
  glow: 1,
  spill: 1,
  reach: 1,
  intensity: 1,
  feather: 0.15,
  inset: 24,
  length: 0.9,
  mirrored: false,
  hum: 1,
  flicker: 1,
  interactive: true,
  intro: true,
  paused: false,
  dpr: 2,
  scrollThreshold: 0.3,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const mix = (a: number[], b: number[], t: number): number[] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE = [1, 1, 1];

const EASINGS: Record<NeonEasing, (t: number) => number> = {
  out: (t) => 1 - (1 - t) ** 3,
  smooth: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  gentle: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  linear: (t) => t,
};

// Rampa de piscada da ignição (tubo de neon acende tremeluzindo).
const FLICKER_RAMP: [number, number][] = [
  [0, 0.85], [0.05, 0.04], [0.11, 0.7], [0.16, 0], [0.27, 0.4], [0.31, 0.06],
  [0.4, 1], [0.47, 0.22], [0.53, 0.95], [0.6, 0.55], [0.68, 1],
];
const flickerAt = (t: number): number => {
  let out = 0;
  for (const [at, value] of FLICKER_RAMP) {
    if (t >= at) out = value;
    else break;
  }
  return out;
};

const smoothstep = (e: number) => {
  const t = clamp(e, 0, 1);
  return t * t * (3 - 2 * t);
};
const hash = (e: number) => {
  const t = Math.sin(e * 91.3458) * 47453.5453;
  return t - Math.floor(t);
};

const CUT_MS = 240;
const BURST_MS = 420;
/** Duração da ignição em função do flicker. */
const igniteMs = (flicker: number) => (flicker > 0 ? 520 + 380 * Math.min(flicker, 1) : 360);

// ─── Cor ─────────────────────────────────────────────────────────────────────
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

/** Resolve uma cor que pode ser uma var/keyword CSS, no contexto do host. */
function resolveColor(host: HTMLElement, css: string): [number, number, number, number] | null {
  const probe = document.createElement('span');
  probe.style.color = css;
  if (!probe.style.color) return null;
  probe.style.cssText += ';position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
  host.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return parseColor(resolved);
}

function rgbToHsl([r, g, b]: number[]): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]: number[]): number[] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const comp = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [comp(h + 1 / 3), comp(h), comp(h - 1 / 3)];
}

/** Cor do "vidro" do tubo — leve variação da cor do neon. */
const glassColor = (rgb: number[]) => {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb([h, Math.min(1, s * 1.1 + 0.08), l * 0.6]);
};
const luma = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// ─── Shaders (WebGL1 / GLSL ES 1.00) ──────────────────────────────────────────
const VERT = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';

const FRAG = `
precision highp float;
uniform vec2 uRes;      // css px
uniform vec2 uScale;    // device px per css px
uniform float uCanvasH; // device px
uniform float uDir;     // 0 down, 1 up, 2 right, 3 left
uniform float uMirror;
uniform float uInset;
uniform float uThick;
uniform float uLen;
uniform float uExpand;  // -1 start, 0 centre, 1 end
uniform float uLit;     // lit share of the tube
uniform float uBright;
uniform float uFront;   // depth of the light front, px from the tube line
uniform float uFeather;
uniform float uGlow;
uniform float uSpill;
uniform float uReach;
uniform float uIntensity;
uniform float uLight;   // 1 = light background
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uCore;

// (along-tube coordinate, distance in front of the tube, frame length along, frame depth)
vec4 frameOf(float dir, vec2 p) {
  if (dir < 0.5) return vec4(p.x, p.y - uInset, uRes.x, uRes.y);
  if (dir < 1.5) return vec4(p.x, uRes.y - p.y - uInset, uRes.x, uRes.y);
  if (dir < 2.5) return vec4(uRes.y - p.y, p.x - uInset, uRes.y, uRes.x);
  return vec4(uRes.y - p.y, uRes.x - p.x - uInset, uRes.y, uRes.x);
}
float opposite(float d) { return d < 0.5 ? 1.0 : (d < 1.5 ? 0.0 : (d < 2.5 ? 3.0 : 2.0)); }

// returns (core, halo, glass, spill); t = position along the colour ramp
vec4 tube(vec4 f, out float t) {
  float u = f.x;
  float v = f.y;
  float A = f.z;
  float D = f.w;
  float L = uLen * A;
  float s0 = (A - L) * 0.5;
  float s1 = (A + L) * 0.5;
  float e = uExpand < -0.5 ? s0 : (uExpand > 0.5 ? s1 : A * 0.5);
  float lo = mix(e, s0, uLit);
  float hi = mix(e, s1, uLit);
  float r = uThick * 0.5;

  float dl = length(vec2(u - clamp(u, lo, hi), v));
  float dt = length(vec2(u - clamp(u, s0, s1), v));
  float core = 1.0 - smoothstep(r - 0.75, r + 0.75, dl);
  float glass = 1.0 - smoothstep(r - 0.75, r + 0.75, dt);

  float g = max(uGlow, 0.0);
  float od = max(dl - r, 0.0);
  float halo = g * (0.9 * exp(-od / (2.5 + 6.0 * g)) + 0.4 * exp(-od / (12.0 + 40.0 * g)));

  float vv = max(v, 0.0);
  float dx = max(max(lo - u, u - hi), 0.0);
  float spread = uFeather * A + vv * 0.45 + 1.0;
  float lateral = exp(-(dx * dx) / (spread * spread));
  float reachPx = max(uReach, 0.02) * D * 0.55;
  float fall = exp(-vv / reachPx);
  float fd = max(uFeather * D, 1.0);
  float front = 1.0 - smoothstep(uFront - fd, uFront, v);
  float ahead = smoothstep(-r, r * 3.0 + 6.0, v);

  t = clamp(vv / (reachPx * 1.4), 0.0, 1.0);
  return vec4(core, halo, glass, lateral * fall * front * ahead);
}

vec3 ramp(float t) { return t < 0.5 ? mix(uC0, uC1, t * 2.0) : mix(uC1, uC2, t * 2.0 - 1.0); }
vec4 over(vec4 top, vec4 base) { return top + base * (1.0 - top.a); }

void main() {
  vec2 p = vec2(gl_FragCoord.x / uScale.x, (uCanvasH - gl_FragCoord.y) / uScale.y);
  float ta = 0.0;
  float tb = 0.0;
  vec4 a = tube(frameOf(uDir, p), ta);
  vec4 b = vec4(0.0);
  if (uMirror > 0.5) b = tube(frameOf(opposite(uDir), p), tb);

  float B = uBright;
  float core = max(a.x, b.x);
  float halo = a.y + b.y;
  float glass = max(a.z, b.z);
  float sp = a.w + b.w;
  vec3 spc = (a.w * ramp(ta) + b.w * ramp(tb)) / max(sp, 1e-4);

  // Dither: soft glows over large areas would band in 8 bits.
  float n = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;

  if (uLight < 0.5) {
    // Additive light; the canvas is screen-blended over the stage.
    vec3 col = glass * uC0 * 0.10
             + B * halo * uC0 * 0.8
             + B * uSpill * 0.32 * sp * spc
             + B * core * uCore * 1.6;
    col = 1.0 - exp(-col * uIntensity * 1.3);
    col = clamp(col + n, 0.0, 1.0);
    gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
  } else {
    // Light stage: pastel washes layered with normal alpha.
    float I = uIntensity;
    vec4 acc = vec4(0.0);
    float aS = clamp(B * uSpill * 0.30 * sp * I, 0.0, 0.9);
    acc = over(vec4(spc * aS, aS), acc);
    float aH = clamp(B * halo * 0.42 * I, 0.0, 0.95);
    acc = over(vec4(uC0 * aH, aH), acc);
    float aG = glass * 0.16;
    acc = over(vec4(uC2 * aG, aG), acc);
    float aC = clamp(B * core * I, 0.0, 1.0);
    acc = over(vec4(uCore * aC, aC), acc);
    acc.a = clamp(acc.a + n, 0.0, 1.0);
    acc.rgb = clamp(acc.rgb + n, vec3(0.0), vec3(acc.a));
    gl_FragColor = acc;
  }
}`;

const UNIFORMS = [
  'uRes', 'uScale', 'uCanvasH', 'uDir', 'uMirror', 'uInset', 'uThick', 'uLen',
  'uExpand', 'uLit', 'uBright', 'uFront', 'uFeather', 'uGlow', 'uSpill', 'uReach',
  'uIntensity', 'uLight', 'uC0', 'uC1', 'uC2', 'uCore',
] as const;

interface GLCtx {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

function initGL(canvas: HTMLCanvasElement): GLCtx | null {
  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
  });
  if (!gl) return null;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
    }
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.bindAttribLocation(program, 0, 'aPos');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'link');
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const name of UNIFORMS) u[name] = gl.getUniformLocation(program, name);
  return { gl, program, u };
}

// Elementos que, se clicados, não disparam o replay (são interativos).
const INTERACTIVE =
  'a, button, input, select, textarea, label, summary, video, audio, [role="button"], [role="link"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

function validateConfig(raw: Partial<NeonConfig> | undefined): NeonConfig {
  const d = NEON_DEFAULTS;
  const r = (raw ?? {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  const colors: [string, string] =
    Array.isArray(r.colors) && r.colors.length >= 2 && typeof r.colors[0] === 'string' && typeof r.colors[1] === 'string'
      ? [r.colors[0], r.colors[1]]
      : d.colors;
  return {
    colors,
    backgroundColor: typeof r.backgroundColor === 'string' ? r.backgroundColor : d.backgroundColor,
    direction: pick(r.direction, ['down', 'up', 'left', 'right'] as const, d.direction),
    expandFrom: pick(r.expandFrom, ['center', 'left', 'right'] as const, d.expandFrom),
    trigger: pick(r.trigger, ['mount', 'inView', 'manual'] as const, d.trigger),
    revealDelay: Math.max(0, num(r.revealDelay, d.revealDelay)),
    revealDuration: Math.max(50, num(r.revealDuration, d.revealDuration)),
    easing: pick(r.easing, ['out', 'smooth', 'gentle', 'linear'] as const, d.easing),
    thickness: Math.max(0.5, num(r.thickness, d.thickness)),
    glow: Math.max(0, num(r.glow, d.glow)),
    spill: Math.max(0, num(r.spill, d.spill)),
    reach: Math.max(0.02, num(r.reach, d.reach)),
    intensity: Math.max(0, num(r.intensity, d.intensity)),
    feather: clamp(num(r.feather, d.feather), 0, 1),
    inset: Math.max(0, num(r.inset, d.inset)),
    length: clamp(num(r.length, d.length), 0, 1),
    mirrored: typeof r.mirrored === 'boolean' ? r.mirrored : d.mirrored,
    hum: Math.max(0, num(r.hum, d.hum)),
    flicker: Math.max(0, num(r.flicker, d.flicker)),
    interactive: typeof r.interactive === 'boolean' ? r.interactive : d.interactive,
    intro: typeof r.intro === 'boolean' ? r.intro : d.intro,
    paused: typeof r.paused === 'boolean' ? r.paused : d.paused,
    dpr: clamp(num(r.dpr, d.dpr), 0.5, 4),
    scrollThreshold: clamp(num(r.scrollThreshold, d.scrollThreshold), 0, 1),
    forceMode: r.forceMode === 'light' || r.forceMode === 'dark' ? r.forceMode : undefined,
  };
}

type NeonState = 'idle' | 'waiting' | 'cut' | 'igniting' | 'sweeping' | 'lit';

interface Palette {
  light: boolean;
  c0: number[];
  c1: number[];
  c2: number[];
  core: number[];
}

/** Define o custom element `<neon-reveal>` (idempotente). */
export function defineNeonReveal(tag = 'neon-reveal'): void {
  if (typeof window === 'undefined' || customElements.get(tag)) return;

  class NeonReveal extends HTMLElement {
    static observedAttributes = ['data-config'];

    private cfg: NeonConfig = { ...NEON_DEFAULTS };
    private canvas!: HTMLCanvasElement;
    private content!: HTMLElement;
    private g: GLCtx | null = null;
    private palette: Palette | null = null;
    private st: NeonState = 'idle';
    private clock = 0;
    private phaseAt = 0;
    private burstAt = -1e9;
    private last = 0;
    private raf = 0;
    private visible = true;
    private reduced = false;
    private lastMask = -1;
    private cssW = 0;
    private cssH = 0;
    private ready = false;
    private cleanups: (() => void)[] = [];
    private triggerIO: IntersectionObserver | null = null;

    private frame = (now: number) => {
      this.raf = 0;
      const dt = Math.min(250, Math.max(0, now - this.last));
      this.last = now;
      if (!this.cfg.paused && this.visible) this.clock += dt;
      this.cssW = Math.max(1, this.clientWidth);
      this.cssH = Math.max(1, this.clientHeight);
      this.advance();
      const v = this.frameValues();
      this.applyMask(v.P);
      if (this.visible) this.draw(v.lit, v.bright, v.P);
      if (this.animating()) this.raf = requestAnimationFrame(this.frame);
    };

    get state(): NeonState {
      return this.st;
    }
    get config(): NeonConfig {
      return { ...this.cfg, colors: [...this.cfg.colors] };
    }
    set config(next: Partial<NeonConfig>) {
      this.dataset.config = JSON.stringify(validateConfig({ ...this.cfg, ...next }));
    }

    connectedCallback(): void {
      this.cfg = this.readConfig();
      this.ensureParts();
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!this.g) {
        try {
          this.g = initGL(this.canvas);
        } catch (e) {
          console.warn('[neon-reveal]', e);
          this.g = null;
        }
      }
      this.applyStageStyle();
      this.observe();
      this.resolvePalette();
      if (!this.ready) {
        this.ready = true;
        if (!this.g || !this.cfg.intro || this.reduced) this.toLit(false);
        else {
          this.st = 'idle';
          this.applyMask(0);
        }
      }
      if (this.st === 'idle') this.armTrigger();
      this.kick();
    }

    disconnectedCallback(): void {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.triggerIO?.disconnect();
      this.triggerIO = null;
      for (const fn of this.cleanups.splice(0)) fn();
    }

    attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void {
      if (oldValue === newValue || !this.ready) return;
      const prev = this.cfg;
      this.cfg = this.readConfig();
      this.applyStageStyle();
      if (prev.colors.join() !== this.cfg.colors.join() || prev.backgroundColor !== this.cfg.backgroundColor) {
        this.resolvePalette();
      }
      if (!this.cfg.intro && this.st !== 'lit') this.toLit(false);
      if (this.st === 'idle' && (prev.trigger !== this.cfg.trigger || prev.scrollThreshold !== this.cfg.scrollThreshold)) {
        this.armTrigger();
      }
      this.lastMask = -1;
      this.kick();
    }

    play(): void {
      if (this.st !== 'idle') return;
      this.triggerIO?.disconnect();
      this.triggerIO = null;
      if (!this.g || this.reduced) {
        this.toLit(true);
        return;
      }
      this.st = 'waiting';
      this.phaseAt = this.clock + this.cfg.revealDelay;
      this.kick();
    }

    replay(): void {
      if (!this.g || this.reduced) return;
      if (this.st === 'idle') {
        this.play();
        return;
      }
      this.st = 'cut';
      this.phaseAt = this.clock;
      this.applyMask(0);
      this.kick();
    }

    private readConfig(): NeonConfig {
      let raw: Partial<NeonConfig> = {};
      try {
        raw = JSON.parse(this.dataset.config || '{}');
      } catch {
        console.warn('[neon-reveal] data-config is not valid JSON');
      }
      return validateConfig(raw);
    }

    private ensureParts(): void {
      let canvas = this.querySelector<HTMLCanvasElement>(':scope > canvas');
      let content = this.querySelector<HTMLElement>(':scope > .nr-content');
      if (!content) {
        content = document.createElement('div');
        content.className = 'nr-content';
        while (this.firstChild) content.appendChild(this.firstChild);
        this.appendChild(content);
      }
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        this.appendChild(canvas);
      }
      canvas.style.cssText += ';position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:1';
      if (!this.style.position) this.style.position = 'relative';
      this.canvas = canvas;
      this.content = content;
    }

    private applyStageStyle(): void {
      this.style.setProperty('--nr-bg', this.cfg.backgroundColor);
      this.style.setProperty('--nr-inset', `${this.cfg.inset}px`);
    }

    private observe(): void {
      for (const fn of this.cleanups.splice(0)) fn();
      const ro = new ResizeObserver(() => {
        this.lastMask = -1;
        this.kick();
      });
      ro.observe(this);
      const io = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        this.kick();
      });
      io.observe(this);
      const onClick = (e: Event) => this.onClick(e as MouseEvent);
      this.addEventListener('click', onClick);
      const onScheme = () => {
        this.resolvePalette();
        this.kick();
      };
      const mo = new MutationObserver(onScheme);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
      const schemeMM = matchMedia('(prefers-color-scheme: dark)');
      schemeMM.addEventListener('change', onScheme);
      const rmMM = matchMedia('(prefers-reduced-motion: reduce)');
      const onReduced = () => {
        this.reduced = rmMM.matches;
        if (this.reduced) this.toLit(false);
        this.kick();
      };
      rmMM.addEventListener('change', onReduced);
      const onLost = (e: Event) => {
        e.preventDefault();
        this.g = null;
      };
      const onRestored = () => {
        try {
          this.g = initGL(this.canvas);
        } catch {
          this.g = null;
        }
        this.kick();
      };
      this.canvas.addEventListener('webglcontextlost', onLost);
      this.canvas.addEventListener('webglcontextrestored', onRestored);
      this.cleanups.push(() => {
        ro.disconnect();
        io.disconnect();
        mo.disconnect();
        this.removeEventListener('click', onClick);
        schemeMM.removeEventListener('change', onScheme);
        rmMM.removeEventListener('change', onReduced);
        this.canvas.removeEventListener('webglcontextlost', onLost);
        this.canvas.removeEventListener('webglcontextrestored', onRestored);
      });
    }

    private armTrigger(): void {
      this.triggerIO?.disconnect();
      this.triggerIO = null;
      const trigger = this.cfg.trigger;
      if (trigger === 'mount') {
        this.play();
        return;
      }
      if (trigger !== 'inView') return;
      const threshold = this.cfg.scrollThreshold;
      const steps = Array.from({ length: 21 }, (_, i) => i / 20);
      this.triggerIO = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting && threshold > 0) return;
          const tall = entry.intersectionRect.height >= (entry.rootBounds?.height ?? innerHeight) * threshold;
          if (entry.intersectionRatio >= threshold - 0.001 || tall) this.play();
        },
        { threshold: steps },
      );
      this.triggerIO.observe(this);
    }

    private resolvePalette(): void {
      if (!this.isConnected) return;
      const own = resolveColor(this, this.cfg.backgroundColor);
      let bg: number[] | null = own && own[3] > 0.5 ? [own[0], own[1], own[2]] : null;
      for (let el = this.parentElement; !bg && el; el = el.parentElement) {
        const c = parseColor(getComputedStyle(el).backgroundColor);
        if (c[3] > 0.5) bg = [c[0], c[1], c[2]];
      }
      if (!bg) {
        const scheme = getComputedStyle(document.documentElement).colorScheme || '';
        bg =
          scheme.includes('dark') && (!scheme.includes('light') || matchMedia('(prefers-color-scheme: dark)').matches)
            ? [0.05, 0.05, 0.06]
            : [1, 1, 1];
      }
      const resolve = (css: string, fallback: number[]) => {
        const c = resolveColor(this, css);
        return c && c[3] > 0 ? [c[0], c[1], c[2]] : fallback;
      };
      const tube = resolve(this.cfg.colors[0], [1, 0.62, 0.99]);
      const light = resolve(this.cfg.colors[1], [0.69, 0.39, 0.91]);
      const glass = glassColor(tube);
      const isLight =
        this.cfg.forceMode === 'dark' ? false : this.cfg.forceMode === 'light' ? true : luma(bg) > 0.5;
      this.palette = isLight
        ? {
            light: isLight,
            c0: mix(tube, WHITE, 0.35),
            c1: mix(light, WHITE, 0.35),
            c2: mix(glass, WHITE, 0.15),
            core: mix(tube, glass, 0.15),
          }
        : { light: isLight, c0: tube, c1: light, c2: glass, core: mix(tube, WHITE, 0.6) };
      this.canvas.style.mixBlendMode = isLight ? 'normal' : 'screen';
    }

    private onClick(e: MouseEvent): void {
      if (!this.cfg.interactive || !this.g || this.reduced) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(INTERACTIVE)) return;
      if (window.getSelection()?.toString()) return;
      switch (this.st) {
        case 'lit':
          this.replay();
          break;
        case 'igniting':
        case 'sweeping':
          this.burstAt = this.clock;
          this.kick();
          break;
        case 'idle':
          if (this.cfg.trigger === 'manual') this.play();
          break;
      }
    }

    private toLit(emitComplete: boolean): void {
      const prev = this.st;
      this.st = 'lit';
      this.applyMask(1);
      if (emitComplete && prev !== 'lit') this.emit('neon:complete');
      this.kick();
    }

    private emit(name: string): void {
      this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
    }

    private advance(): void {
      const cfg = this.cfg;
      for (let i = 0; i < 5; i++) {
        const elapsed = this.clock - this.phaseAt;
        if (this.st === 'waiting' && elapsed >= 0) {
          this.st = 'igniting';
          this.emit('neon:start');
        } else if (this.st === 'cut' && elapsed >= CUT_MS) {
          this.st = 'igniting';
          this.phaseAt += CUT_MS;
          this.emit('neon:start');
        } else if (this.st === 'igniting' && elapsed >= igniteMs(cfg.flicker)) {
          this.st = 'sweeping';
          this.phaseAt += igniteMs(cfg.flicker);
        } else if (this.st === 'sweeping' && elapsed >= cfg.revealDuration) {
          this.toLit(true);
        } else break;
      }
    }

    private frameValues(): { lit: number; bright: number; P: number } {
      const cfg = this.cfg;
      const elapsed = this.clock - this.phaseAt;
      const span = (cfg.direction === 'down' || cfg.direction === 'up' ? this.cssW : this.cssH) * cfg.length;
      const seed = span > 0 ? Math.min(0.2, 36 / span) : 0;
      let lit = 1;
      let bright = 1;
      let progress = 1;
      switch (this.st) {
        case 'idle':
        case 'waiting':
        case 'cut':
          lit = 0;
          bright = 0;
          progress = 0;
          break;
        case 'igniting': {
          const u = elapsed / igniteMs(cfg.flicker);
          bright = smoothstep(u) + (flickerAt(u) - smoothstep(u)) * Math.min(1, cfg.flicker);
          lit = seed;
          progress = 0;
          break;
        }
        case 'sweeping': {
          const u = EASINGS[cfg.easing](clamp(elapsed / cfg.revealDuration, 0, 1));
          lit = seed + (1 - seed) * u;
          progress = u;
          break;
        }
      }
      if ((this.st === 'sweeping' || this.st === 'lit') && !this.reduced && cfg.hum > 0) {
        const u = this.clock / 1000;
        bright *= 1 + cfg.hum * (0.045 * Math.sin(u * 2.1) + 0.02 * Math.sin(u * 5.3 + 1.3) + 0.012 * Math.sin(u * 13.7));
      }
      const sinceBurst = this.clock - this.burstAt;
      if (sinceBurst >= 0 && sinceBurst < BURST_MS) {
        const u = hash(Math.floor(sinceBurst / 45) + Math.floor(this.burstAt));
        bright *= 1 + ((u < 0.45 ? 0.08 : u < 0.7 ? 0.5 : 1) - 1) * Math.min(1, Math.max(cfg.flicker, 0.6));
      }
      return { lit, bright, P: progress };
    }

    private applyMask(progress: number): void {
      const content = this.content;
      if (!content) return;
      const style = content.style;
      if (progress >= 1) {
        if (this.lastMask !== 1) {
          for (const prop of ['mask-image', '-webkit-mask-image', 'mask-composite', '-webkit-mask-composite', 'mask-repeat', '-webkit-mask-repeat']) {
            style.removeProperty(prop);
          }
        }
        this.lastMask = 1;
        return;
      }
      if (Math.abs(progress - this.lastMask) < 1e-4) return;
      this.lastMask = progress;
      const cfg = this.cfg;
      const cw = content.clientWidth;
      const ch = content.clientHeight;
      const horizontal = cfg.direction === 'down' || cfg.direction === 'up';
      const along = horizontal ? cw : ch;
      const depth = horizontal ? ch : cw;
      const len = cfg.length * along;
      const centre = cfg.expandFrom === 'left' ? (along - len) / 2 : cfg.expandFrom === 'right' ? (along + len) / 2 : along / 2;
      const featherAlong = cfg.feather * along;
      const featherDepth = cfg.feather * depth;
      const lo = centre - progress * (centre + featherAlong);
      const hi = centre + progress * (along - centre + featherAlong);
      const px = (v: number) => `${v.toFixed(1)}px`;
      const alongDir = horizontal ? 'to right' : 'to top';
      const depthDir = { down: 'to bottom', up: 'to top', right: 'to right', left: 'to left' }[cfg.direction];
      const depthDirOpp = { down: 'to top', up: 'to bottom', right: 'to left', left: 'to right' }[cfg.direction];
      const reach = progress * (cfg.mirrored ? depth / 2 + featherDepth : depth + featherDepth);
      const alongMask = `linear-gradient(${alongDir}, transparent ${px(lo - featherAlong)}, #000 ${px(lo)}, #000 ${px(hi)}, transparent ${px(hi + featherAlong)})`;
      const depthMask = (dir: string) => `linear-gradient(${dir}, #000 ${px(reach - featherDepth)}, transparent ${px(reach)})`;
      const images = cfg.mirrored ? [alongMask, depthMask(depthDir), depthMask(depthDirOpp)] : [alongMask, depthMask(depthDir)];
      const composite = cfg.mirrored ? 'intersect, add, add' : 'intersect, add';
      const webkitComposite = cfg.mirrored ? 'source-in, source-over, source-over' : 'source-in, source-over';
      style.setProperty('-webkit-mask-image', images.join(', '));
      style.setProperty('mask-image', images.join(', '));
      style.setProperty('-webkit-mask-composite', webkitComposite);
      style.setProperty('mask-composite', composite);
      style.setProperty('-webkit-mask-repeat', 'no-repeat');
      style.setProperty('mask-repeat', 'no-repeat');
    }

    private kick(): void {
      if (!this.raf && this.isConnected) {
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.frame);
      }
    }

    private animating(): boolean {
      const cfg = this.cfg;
      if (!this.visible || cfg.paused || !this.g) return false;
      return (
        this.st === 'waiting' ||
        this.st === 'cut' ||
        this.st === 'igniting' ||
        this.st === 'sweeping' ||
        this.clock - this.burstAt < BURST_MS ||
        (this.st === 'lit' && cfg.hum > 0 && !this.reduced)
      );
    }

    private draw(lit: number, bright: number, progress: number): void {
      const ctx = this.g;
      const palette = this.palette;
      if (!ctx || !palette || ctx.gl.isContextLost()) return;
      const { gl, u } = ctx;
      const cfg = this.cfg;
      const cw = this.cssW;
      const ch = this.cssH;
      const ratio = Math.min(window.devicePixelRatio || 1, cfg.dpr);
      const w = Math.max(1, Math.round(cw * ratio));
      const h = Math.max(1, Math.round(ch * ratio));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      const depth = cfg.direction === 'down' || cfg.direction === 'up' ? ch : cw;
      const featherDepth = cfg.feather * depth;
      const front = progress * (cfg.mirrored ? depth / 2 + featherDepth : depth + featherDepth) - cfg.inset;
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(ctx.program);
      gl.uniform2f(u.uRes, cw, ch);
      gl.uniform2f(u.uScale, w / cw, h / ch);
      gl.uniform1f(u.uCanvasH, h);
      gl.uniform1f(u.uDir, { down: 0, up: 1, right: 2, left: 3 }[cfg.direction]);
      gl.uniform1f(u.uMirror, +cfg.mirrored);
      gl.uniform1f(u.uInset, cfg.inset);
      gl.uniform1f(u.uThick, cfg.thickness);
      gl.uniform1f(u.uLen, cfg.length);
      gl.uniform1f(u.uExpand, cfg.expandFrom === 'left' ? -1 : +(cfg.expandFrom === 'right'));
      gl.uniform1f(u.uLit, lit);
      gl.uniform1f(u.uBright, Math.max(0, bright));
      gl.uniform1f(u.uFront, front);
      gl.uniform1f(u.uFeather, cfg.feather);
      gl.uniform1f(u.uGlow, cfg.glow);
      gl.uniform1f(u.uSpill, cfg.spill);
      gl.uniform1f(u.uReach, cfg.reach);
      gl.uniform1f(u.uIntensity, cfg.intensity);
      gl.uniform1f(u.uLight, +palette.light);
      gl.uniform3fv(u.uC0, palette.c0);
      gl.uniform3fv(u.uC1, palette.c1);
      gl.uniform3fv(u.uC2, palette.c2);
      gl.uniform3fv(u.uCore, palette.core);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  customElements.define(tag, NeonReveal);
}
