// A small, characterful tree: tapered filled limbs with root flare and a knothole,
// branches that curve upward, three-tone foliage clumps lit from the moon side. It grows
// from the ground on load (each limb scaling out from its own base, nested so children
// ride their parents), then breathes in the wind and lets the odd leaf go.
import { around, blob, chance, clamp, ease, el, leaf, limb, pick, qPoint, qTangent, r2, rand, seeded } from './util.js';

const BACK = ['#0f2016', '#14291b', '#1a3421', '#24432a'];
const FRONT = ['#16301d', '#1e3f25', '#2a5530', '#3f7240'];
const LEAF_COLORS = ['#3c6a3a', '#4f7f45', '#2f5a31', '#6b8f4a'];
const MAX_DEPTH = 4;

export function createTree(layer, leafLayer, { seed = 11, light = [-0.8, -0.6] } = {}) {
  const rng = seeded(seed);
  const root = el('g', { class: 'tree' }, layer);
  const sway = el('g', {}, root);
  const backFoliage = el('g', {}, sway);
  const wood = el('g', { class: 'wood' }, sway);
  const frontFoliage = el('g', {}, sway);
  const growers = [];
  const clumps = [];
  const limbs = [];

  function addClump(x, y, t0, size, preferFront) {
    const r = size * (0.85 + rng() * 0.3);
    const front = preferFront ? rng() < 0.62 : rng() < 0.25;
    const pal = front ? FRONT : BACK;
    const outer = el('g', {}, front ? frontFoliage : backFoliage);
    const inner = el('g', {}, outer);
    el('path', { d: blob(rng, x, y, r * 1.14, r * 0.84, 10, 0.17), fill: pal[0] }, inner);
    el('path', { d: blob(rng, x + light[0] * r * 0.14, y + light[1] * r * 0.17, r * 0.9, r * 0.64, 9, 0.2), fill: pal[1] }, inner);
    el('path', { d: blob(rng, x + light[0] * r * 0.34, y + light[1] * r * 0.36, r * 0.55, r * 0.38, 8, 0.24), fill: pal[2] }, inner);
    if (front) {
      let marks = '';
      const base = Math.atan2(light[1], light[0]);
      for (let i = 0; i < 7; i++) {
        const a = base + (rng() - 0.5) * 2.2;
        const rr = r * (0.82 + rng() * 0.28);
        marks += leaf(x + Math.cos(a) * rr * 1.08, y + Math.sin(a) * rr * 0.8, a + (rng() - 0.5) * 0.8, 3.4 + rng() * 1.4, 0.95);
      }
      el('path', { d: marks, fill: pal[3], 'fill-opacity': '0.9' }, inner);
    }
    growers.push({ node: outer, cx: x, cy: y + r * 0.5, t0, dur: 0.75, kind: 'clump' });
    clumps.push({ x, y, r, front, inner });
  }

  function branch(parent, p0, ang, len, w0, depth, t0) {
    const side = depth === 0 ? (rng() - 0.5) * 0.4 : Math.sign(Math.sin(ang)) || 1;
    const p1 = [p0[0] + Math.sin(ang) * len, p0[1] - Math.cos(ang) * len];
    const ca = ang + side * (depth === 0 ? 0.12 : 0.32);
    const c = [p0[0] + Math.sin(ca) * len * 0.55, p0[1] - Math.cos(ca) * len * 0.55];
    const w1 = Math.max(0.75, w0 * (depth === 0 ? 0.62 : 0.6));
    const g = el('g', {}, parent);
    const shape = limb(p0, c, p1, w0, w1, light, depth === 0 ? 20 : 12);
    if (depth === 0) {
      // root flare and surface roots, grown with the trunk
      el('path', { class: 'bark', d: 'M-15.5 1.8C-9.5 0.8 -7.2 -2.8 -6.4 -10L6.2 -10C6.8 -3 9.4 0.6 16 1.8Z' }, g);
      el('path', { class: 'bark', d: limb([-5.5, -0.8], [-12, -0.6], [-20, 1.8], 3, 0.5, null, 8).d }, g);
      el('path', { class: 'bark', d: limb([5.5, -0.8], [12, -0.3], [19, 1.9], 2.8, 0.5, null, 8).d }, g);
      el('path', { class: 'bark-lit', d: 'M-14 1.2C-9 0.2 -7 -3 -6.3 -9.5', 'stroke-width': '0.6' }, g);
    }
    el('path', { class: `bark d${depth}`, d: shape.d }, g);
    if (shape.lit && w0 > 1.1) el('path', { class: 'bark-lit', d: shape.lit, 'stroke-width': r2(Math.max(0.35, w0 * 0.13)) }, g);
    if (depth === 0) {
      el('path', { class: 'bark-crack', d: 'M-2.4 -3C-3.2 -10 -1.8 -16 -2.8 -24M2.6 -6C3.2 -12 2 -18 2.8 -27M-0.2 -21C0.4 -25 -0.6 -28 0 -31' }, g);
      el('ellipse', { class: 'knothole', cx: '1', cy: '-14.5', rx: '1.9', ry: '2.7' }, g);
      el('path', { class: 'knothole-rim', d: 'M-1.1 -15.8Q1 -18.1 3 -15.6' }, g);
    }
    const dur = 0.55 + len / 62;
    growers.push({ node: g, cx: p0[0], cy: p0[1], t0, dur, kind: 'limb' });
    const rec = { p0, c, p1, w0, w1, depth, ang };
    limbs.push(rec);
    const tEnd = t0 + dur * 0.72;

    if (depth >= MAX_DEPTH || len < 8) {
      addClump(p1[0], p1[1] - 1.5, tEnd + 0.1 + rng() * 0.25, 10.5 - depth * 0.4, true);
      return rec;
    }

    let kids;
    if (depth === 0) {
      kids = [
        { a: -0.82 + (rng() - 0.5) * 0.12, k: 0.8, at: 0.86 },
        { a: 0.04 + (rng() - 0.5) * 0.1, k: 0.74, at: 1 },
        { a: 0.74 + (rng() - 0.5) * 0.12, k: 0.78, at: 0.93 },
      ];
    } else {
      const spread = 0.42 + rng() * 0.22;
      const lean = ang * 0.72;
      kids = [
        { a: lean - spread + (rng() - 0.5) * 0.15, k: 0.7 + rng() * 0.1, at: 1 },
        { a: lean + spread + (rng() - 0.5) * 0.15, k: 0.7 + rng() * 0.1, at: 1 },
      ];
      if (rng() < 0.4) kids.push({ a: ang + (rng() - 0.5) * 0.3, k: 0.55, at: 0.6 });
    }
    for (const kid of kids) {
      const base = qPoint(p0, c, p1, kid.at);
      const wAt = w0 + (w1 - w0) * kid.at;
      branch(g, base, kid.a, len * kid.k, wAt * (kid.at < 1 ? 0.78 : 0.95), depth + 1, t0 + dur * 0.62 * kid.at + rng() * 0.1);
    }
    if (depth >= 2 && rng() < 0.55) {
      const m = qPoint(p0, c, p1, 0.55);
      addClump(m[0] + (rng() - 0.5) * 4, m[1] - 3, tEnd + 0.25, 8.5, false);
    }
    return rec;
  }

  const trunk = branch(wood, [0, 0], (rng() - 0.5) * 0.05, 38, 13.5, 0, 0.25);

  // Fill gaps in the crown so it reads as one canopy rather than separate puffs.
  const xs = clumps.map((c) => c.x);
  const ys = clumps.map((c) => c.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng();
    addClump(cx + Math.cos(a) * 18, cy + 2 + Math.sin(a) * 10, 2.9 + i * 0.1, 12.5, false);
  }

  const top = Math.min(...clumps.map((c) => c.y - c.r));
  const span = [Math.min(...clumps.map((c) => c.x - c.r * 1.1)), Math.max(...clumps.map((c) => c.x + c.r * 1.1))];

  // Perch for the owl: a sturdy first-order limb on the moon side, on its top surface.
  const firsts = limbs.filter((l) => l.depth === 1);
  const owlLimb = firsts.reduce((best, l) => (Math.sign(Math.sin(l.ang)) === Math.sign(light[0]) && (!best || Math.abs(Math.sin(l.ang)) > Math.abs(Math.sin(best.ang))) ? l : best), null) || firsts[0];
  const perchT = 0.6;
  const pp = qPoint(owlLimb.p0, owlLimb.c, owlLimb.p1, perchT);
  const pw = (owlLimb.w0 + (owlLimb.w1 - owlLimb.w0) * perchT) / 2;
  const owlPerch = [pp[0], pp[1] - pw + 0.4];

  // Climbing route for the squirrel: up the trunk and out along the far first limb.
  const climbLimb = firsts.find((l) => l !== owlLimb && Math.sign(Math.sin(l.ang)) !== Math.sign(light[0])) || firsts.find((l) => l !== owlLimb);
  const route = [];
  for (let i = 0; i <= 12; i++) route.push(qPoint(trunk.p0, trunk.c, trunk.p1, (i / 12) * 0.86));
  for (let i = 1; i <= 10; i++) {
    const t = (i / 10) * 0.84;
    const p = qPoint(climbLimb.p0, climbLimb.c, climbLimb.p1, t);
    const [tx, ty] = qTangent(climbLimb.p0, climbLimb.c, climbLimb.p1, t);
    const len = Math.hypot(tx, ty) || 1;
    const w = (climbLimb.w0 + (climbLimb.w1 - climbLimb.w0) * t) / 2;
    // ride on the upper surface of the limb
    const nx = -ty / len;
    const ny = tx / len;
    const s = ny < 0 ? 1 : -1;
    route.push([p[0] + nx * w * s, p[1] + ny * w * s]);
  }

  // ---------- runtime ----------
  let growing = false;
  let growT = 0;
  let swayAngle = 0;
  let x = 0;
  let y = 0;
  let scale = 1;
  const falling = [];

  function setGrowth(t) {
    let busy = false;
    for (const g of growers) {
      const p = clamp((t - g.t0) / g.dur, 0, 1);
      if (p >= 1) {
        if (g.s !== 1) {
          g.node.removeAttribute('transform');
          g.s = 1;
        }
        continue;
      }
      busy = true;
      const s = g.kind === 'limb' ? ease.outCubic(p) : ease.outBack(p);
      const q = Math.round(s * 1000) / 1000;
      if (q !== g.s) {
        g.s = q;
        around(g.node, g.cx, g.cy, 0, Math.max(0.0001, q));
      }
    }
    return busy;
  }

  function toWorld(p) {
    const a = swayAngle / (180 / Math.PI);
    const px = p[0] * Math.cos(a) - p[1] * Math.sin(a);
    const py = p[0] * Math.sin(a) + p[1] * Math.cos(a);
    return [x + px * scale, y + py * scale];
  }

  function dropLeaf(groundY, fromClump) {
    const c = fromClump || pick(clumps);
    if (!c || falling.length > 6) return;
    const [wx, wy] = toWorld([c.x + (Math.random() - 0.5) * c.r, c.y + c.r * 0.3]);
    const node = el('path', { class: 'falling-leaf', d: leaf(0, 0, 0, 3.6, 1.1), fill: pick(LEAF_COLORS) }, leafLayer);
    falling.push({ node, x: wx, y: wy, x0: wx, t: 0, phase: rand(0, 6), spin: rand(2, 3.4), drift: rand(-14, 6), rest: 0, groundY });
  }

  return {
    height: -top + 2,
    span,
    get clumps() { return clumps; },
    place(nx, ny, s) {
      x = nx;
      y = ny;
      scale = s;
      root.setAttribute('transform', `translate(${r2(nx)} ${r2(ny)}) scale(${r2(s)})`);
    },
    toWorld,
    owlPerch: () => toWorld(owlPerch),
    routeLocal: route,
    grow() {
      growT = 0;
      growing = true;
      for (const g of growers) g.s = -1;
      setGrowth(0);
    },
    finish() {
      growing = false;
      for (const g of growers) {
        g.node.removeAttribute('transform');
        g.s = 1;
      }
    },
    get grown() { return !growing; },
    update(dt, time, groundY) {
      if (growing) {
        growT += dt;
        growing = setGrowth(growT);
      }
      swayAngle = Math.sin(time * 0.6) * 0.55 + Math.sin(time * 1.45 + 1) * 0.2;
      sway.setAttribute('transform', `rotate(${r2(swayAngle)})`);
      // the two foliage layers drift slightly out of step, so the crown rustles
      backFoliage.setAttribute('transform', `translate(${r2(Math.sin(time * 1.1) * 0.35)} ${r2(Math.cos(time * 0.9) * 0.15)})`);
      frontFoliage.setAttribute('transform', `translate(${r2(Math.sin(time * 1.37 + 1) * 0.55)} ${r2(Math.cos(time * 1.2 + 2) * 0.22)})`);
      if (!growing && chance(dt * 0.05)) dropLeaf(groundY);
      for (let i = falling.length - 1; i >= 0; i--) {
        const f = falling[i];
        f.t += dt;
        if (!f.rest) {
          f.y += dt * 9;
          f.x0 += dt * f.drift * 0.4;
          f.x = f.x0 + Math.sin(f.t * 2.2 + f.phase) * 5;
          const gy = f.groundY(f.x) + 0.6;
          const rot = Math.sin(f.t * f.spin + f.phase) * 55;
          if (f.y >= gy) {
            f.y = gy;
            f.rest = f.t;
          }
          f.node.setAttribute('transform', `translate(${r2(f.x)} ${r2(f.y)}) rotate(${r2(f.rest ? 8 : rot)})`);
        } else {
          const fade = 1 - (f.t - f.rest) / 3;
          if (fade <= 0) {
            f.node.remove();
            falling.splice(i, 1);
          } else f.node.setAttribute('opacity', r2(fade));
        }
      }
    },
    shed(groundY, n = 3) {
      for (let i = 0; i < n; i++) dropLeaf(groundY);
    },
    blossom() {
      if (root.dataset.bloomed) return;
      root.dataset.bloomed = '1';
      const petals = ['#f3c9d3', '#f7dce2', '#fff1e6'];
      clumps.forEach((c, i) => {
        const count = c.front ? 3 : 1;
        for (let k = 0; k < count; k++) {
          const a = rand(0, Math.PI * 2);
          const rr = rand(0.15, 0.85) * c.r;
          const fx = c.x + Math.cos(a) * rr;
          const fy = c.y + Math.sin(a) * rr * 0.7;
          const f = el('g', { class: 'blossom' }, c.inner);
          f.style.setProperty('--dl', `${r2(i * 0.03 + k * 0.12)}s`);
          const color = pick(petals);
          for (let p = 0; p < 5; p++) {
            const pa = (p / 5) * Math.PI * 2;
            el('circle', { cx: r2(fx + Math.cos(pa) * 0.95), cy: r2(fy + Math.sin(pa) * 0.95), r: '0.9', fill: color }, f);
          }
          el('circle', { cx: r2(fx), cy: r2(fy), r: '0.5', fill: '#e8b85a' }, f);
        }
      });
    },
  };
}
