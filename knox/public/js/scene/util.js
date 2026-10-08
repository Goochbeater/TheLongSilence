export const NS = 'http://www.w3.org/2000/svg';
export const TAU = Math.PI * 2;
export const DEG = 180 / Math.PI;

export function el(tag, attrs, parent) {
  const node = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(node);
  return node;
}

export function seeded(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const chance = (p) => Math.random() < p;
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const r2 = (n) => Math.round(n * 100) / 100;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const ease = {
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
};

const pt = (p) => `${r2(p[0])} ${r2(p[1])}`;

// Smooth closed outline through points (Catmull-Rom → cubic Bézier).
export function closedCurve(pts) {
  const n = pts.length;
  let d = `M${pt(pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += `C${pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${pt(p2)}`;
  }
  return `${d}Z`;
}

// Smooth open polyline (Catmull-Rom → cubic Bézier), without the leading M.
export function openCurve(pts) {
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += `C${pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${pt(p2)}`;
  }
  return d;
}

// Irregular rounded blob, for foliage clumps.
export function blob(rng, cx, cy, rx, ry, lobes = 9, jitter = 0.16) {
  const pts = [];
  const phase = rng() * TAU;
  for (let i = 0; i < lobes; i++) {
    const a = phase + (i / lobes) * TAU;
    const k = 1 + (rng() - 0.5) * 2 * jitter;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return closedCurve(pts);
}

export function qPoint(p0, c, p1, t) {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
}

export function qTangent(p0, c, p1, t) {
  return [2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]), 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1])];
}

// A tapered limb along a quadratic curve, as a filled outline with a rounded tip.
// Also returns the edge facing `light` (a unit vector) for rim highlights.
export function limb(p0, c, p1, w0, w1, light, steps = 12) {
  const left = [];
  const right = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, y] = qPoint(p0, c, p1, t);
    const [tx, ty] = qTangent(p0, c, p1, t);
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    const w = lerp(w0, w1, t) / 2;
    left.push([x + nx * w, y + ny * w]);
    right.push([x - nx * w, y - ny * w]);
  }
  const tip = Math.max(0.2, w1 / 2);
  const d = `M${left.map(pt).join('L')}A${r2(tip)} ${r2(tip)} 0 0 0 ${pt(right[steps])}L${right.slice().reverse().map(pt).join('L')}Z`;
  let lit = null;
  if (light) {
    const [tx, ty] = qTangent(p0, c, p1, 0.5);
    const side = -ty * light[0] + tx * light[1] > 0 ? left : right;
    const from = Math.round(steps * 0.08);
    const pts = side.slice(from, steps);
    lit = `M${pts.map(pt).join('L')}`;
  }
  return { d, lit };
}

// Almond leaf shape centred on (cx, cy) pointing along angle a.
export function leaf(cx, cy, a, len, wid) {
  const ux = Math.cos(a) * len / 2;
  const uy = Math.sin(a) * len / 2;
  const nx = -Math.sin(a) * wid;
  const ny = Math.cos(a) * wid;
  return `M${r2(cx - ux)} ${r2(cy - uy)}Q${r2(cx + nx)} ${r2(cy + ny)} ${r2(cx + ux)} ${r2(cy + uy)}Q${r2(cx - nx)} ${r2(cy - ny)} ${r2(cx - ux)} ${r2(cy - uy)}Z`;
}

// Sum-of-sines 1D noise in roughly [-1, 1].
export function noise1d(rng, octaves = 4, base = 0.006) {
  const waves = Array.from({ length: octaves }, (_, i) => ({
    f: base * (i + 1) * (1.6 + rng() * 0.8),
    p: rng() * TAU,
    a: 1 / (i + 1.4),
  }));
  const norm = waves.reduce((s, w) => s + w.a, 0);
  return (x) => waves.reduce((s, w) => s + Math.sin(x * w.f + w.p) * w.a, 0) / norm;
}

export const setT = (node, x, y, rot = 0, sx = 1, sy = sx) =>
  node.setAttribute('transform', `translate(${r2(x)} ${r2(y)})${rot ? ` rotate(${r2(rot)})` : ''}${sx !== 1 || sy !== 1 ? ` scale(${r2(sx)} ${r2(sy)})` : ''}`);

export const around = (node, cx, cy, rot = 0, sx = 1, sy = sx) =>
  node.setAttribute('transform', `translate(${r2(cx)} ${r2(cy)})${rot ? ` rotate(${r2(rot)})` : ''}${sx !== 1 || sy !== 1 ? ` scale(${r2(sx)} ${r2(sy)})` : ''} translate(${r2(-cx)} ${r2(-cy)})`);
