// The ground: a gentle knoll under the tree, a moonlit ridge line, clumped grass that
// sways, and a few small details (pebbles, glowing mushrooms, night flowers).
import { el, limb, noise1d, openCurve, r2, seeded, smoothstep } from './util.js';

const SWAYS = 7;

export function createLand(back, front, defs, { bottom }) {
  const soil = el('linearGradient', { id: 'kx-soil', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
  el('stop', { offset: '0', 'stop-color': '#101a13' }, soil);
  el('stop', { offset: '0.45', 'stop-color': '#0c120e' }, soil);
  el('stop', { offset: '1', 'stop-color': '#0a0c0b' }, soil);

  const glow = el('radialGradient', { id: 'kx-shroom' }, defs);
  el('stop', { offset: '0', 'stop-color': '#7fe3cc', 'stop-opacity': '0.42' }, glow);
  el('stop', { offset: '0.4', 'stop-color': '#7fe3cc', 'stop-opacity': '0.12' }, glow);
  el('stop', { offset: '1', 'stop-color': '#7fe3cc', 'stop-opacity': '0' }, glow);

  const backG = el('g', { class: 'land' }, back);
  const frontG = el('g', { class: 'land-front' }, front);
  let groundY = () => bottom;

  function swayGroups(parent, rng) {
    return Array.from({ length: SWAYS }, (_, i) => {
      const g = el('g', { class: 'sway' }, parent);
      g.style.setProperty('--dur', `${r2(3.2 + rng() * 3.4)}s`);
      g.style.setProperty('--dl', `${r2(-rng() * 6)}s`);
      g.style.setProperty('--amp', `${r2(2.2 + (i % 3) * 1.4)}deg`);
      return g;
    });
  }

  // A tuft: 3–7 tapered, curving blades fanning out from one root.
  function tuft(rng, x, y, height, dark, lightTone) {
    const n = 3 + Math.floor(rng() * 5);
    let body = '';
    let lit = '';
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      const a = (u - 0.5) * 1.15 + (rng() - 0.5) * 0.28;
      const h = height * (0.55 + (1 - Math.abs(u - 0.5) * 1.3) * 0.45) * (0.8 + rng() * 0.35);
      const bx = x + (u - 0.5) * 2.4;
      const tip = [bx + Math.sin(a) * h * 0.95 + a * h * 0.35, y - Math.cos(a) * h];
      const c = [bx + Math.sin(a) * h * 0.3, y - h * 0.55];
      const { d } = limb([bx, y + 0.6], c, tip, 1.2 + rng() * 0.6, 0.08, null, 6);
      if (rng() < 0.22) lit += d;
      else body += d;
    }
    return { body, lit, dark, lightTone };
  }

  function build({ Wv, treeX, blocks }) {
    const rng = seeded(7331);
    const n = noise1d(rng, 3, 0.014);
    const knoll = (x) => 11 * Math.exp(-(((x - treeX) / 58) ** 2));
    const calm = (x) => smoothstep(blocks[0] - 30, blocks[0] - 6, x) * (1 - smoothstep(blocks[1] + 4, blocks[1] + 30, x));
    groundY = (x) => bottom - knoll(x) - 1.8 * (n(x) + 0.4) * (1 - calm(x));

    backG.replaceChildren();
    frontG.replaceChildren();

    const pts = [];
    for (let x = -12; x <= Wv + 12; x += 6) pts.push([x, groundY(x)]);
    const ridge = `M${r2(pts[0][0])} ${r2(pts[0][1])}${openCurve(pts)}`;
    el('path', { d: `${ridge}L${r2(Wv + 12)} 200L-12 200Z`, fill: 'url(#kx-soil)' }, backG);
    el('path', { d: ridge, class: 'ridge-glow' }, backG);
    el('path', { d: ridge, class: 'ridge' }, backG);

    // Back grass: dense, darker, behind the blocks and creatures.
    const backSway = swayGroups(el('g', { class: 'grass grass-back' }, backG), rng);
    for (let x = rng() * 6; x < Wv; x += 5 + rng() * 9) {
      const nearTree = Math.exp(-(((x - treeX) / 90) ** 2));
      const h = 6 + rng() * 7 + nearTree * 5;
      const t = tuft(rng, x, groundY(x), h);
      const g = backSway[Math.floor(rng() * SWAYS)];
      if (t.body) el('path', { d: t.body, class: 'blade' }, g);
      if (t.lit) el('path', { d: t.lit, class: 'blade lit' }, g);
    }

    // Pebbles
    for (const px of [blocks[1] + 14, treeX - 44, treeX + 38, blocks[0] - 18]) {
      if (px < 4 || px > Wv - 4) continue;
      const y = groundY(px) + 0.4;
      const w = 2 + rng() * 2.4;
      el('ellipse', { cx: r2(px), cy: r2(y), rx: r2(w), ry: r2(w * 0.55), class: 'pebble' }, backG);
      el('path', { d: `M${r2(px - w * 0.7)} ${r2(y - w * 0.3)}Q${r2(px)} ${r2(y - w * 0.75)} ${r2(px + w * 0.6)} ${r2(y - w * 0.35)}`, class: 'pebble-lit' }, backG);
    }

    // Glowing mushrooms near the roots, and a plain cluster beside the blocks.
    mushrooms(backG, rng, treeX - 25, groundY, true);
    if (blocks[1] + 40 < treeX - 80) mushrooms(backG, rng, blocks[1] + 26, groundY, false);

    // Night flowers
    for (const fx of [blocks[1] + 58, treeX + 52, blocks[0] - 34, Wv * 0.08, Wv * 0.92]) {
      if (fx < 6 || fx > Wv - 6 || (fx > blocks[0] - 4 && fx < blocks[1] + 4)) continue;
      const y = groundY(fx);
      const h = 7 + rng() * 5;
      el('path', { d: `M${r2(fx)} ${r2(y)}Q${r2(fx - 1.2)} ${r2(y - h * 0.5)} ${r2(fx + 0.4)} ${r2(y - h)}`, class: 'stem' }, backG);
      const head = el('g', { class: 'flower' }, backG);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        el('circle', { cx: r2(fx + 0.4 + Math.cos(a) * 1.1), cy: r2(y - h + Math.sin(a) * 1.1), r: '0.85' }, head);
      }
      el('circle', { cx: r2(fx + 0.4), cy: r2(y - h), r: '0.55', class: 'flower-eye' }, head);
    }

    // Front grass: sparse, slightly lighter, overlapping creature feet and block bases.
    const frontSway = swayGroups(el('g', { class: 'grass grass-front' }, frontG), rng);
    for (let x = rng() * 12; x < Wv; x += 14 + rng() * 22) {
      const h = 4 + rng() * 5;
      const t = tuft(rng, x, groundY(x) + 1.2, h);
      const g = frontSway[Math.floor(rng() * SWAYS)];
      if (t.body) el('path', { d: t.body, class: 'blade' }, g);
      if (t.lit) el('path', { d: t.lit, class: 'blade lit' }, g);
    }
  }

  function mushrooms(parent, rng, x, ground, glowing) {
    const g = el('g', { class: glowing ? 'shrooms glowing' : 'shrooms' }, parent);
    if (glowing) el('circle', { class: 'shroom-glow', cx: r2(x + 2), cy: r2(ground(x) - 3), r: '13', fill: 'url(#kx-shroom)' }, g);
    const caps = glowing ? [[0, 5.2, 2.6], [4.2, 3.6, 1.9], [-3.4, 2.8, 1.5]] : [[0, 4.4, 2.4], [3.2, 2.8, 1.6]];
    for (const [dx, h, r] of caps) {
      const cx = x + dx;
      const base = ground(cx) + 0.6;
      el('path', { d: `M${r2(cx - 0.55)} ${r2(base)}Q${r2(cx - 0.7)} ${r2(base - h * 0.6)} ${r2(cx - 0.3)} ${r2(base - h)}L${r2(cx + 0.3)} ${r2(base - h)}Q${r2(cx + 0.6)} ${r2(base - h * 0.6)} ${r2(cx + 0.55)} ${r2(base)}Z`, class: 'shroom-stem' }, g);
      el('path', { d: `M${r2(cx - r)} ${r2(base - h + 0.3)}Q${r2(cx - r * 0.9)} ${r2(base - h - r * 1.2)} ${r2(cx)} ${r2(base - h - r * 1.05)}Q${r2(cx + r * 0.9)} ${r2(base - h - r * 1.2)} ${r2(cx + r)} ${r2(base - h + 0.3)}Q${r2(cx)} ${r2(base - h - 0.3)} ${r2(cx - r)} ${r2(base - h + 0.3)}Z`, class: 'shroom-cap' }, g);
      if (!glowing) {
        el('circle', { cx: r2(cx - r * 0.35), cy: r2(base - h - r * 0.55), r: r2(r * 0.16), class: 'shroom-dot' }, g);
        el('circle', { cx: r2(cx + r * 0.3), cy: r2(base - h - r * 0.7), r: r2(r * 0.12), class: 'shroom-dot' }, g);
      }
    }
  }

  return { build, groundY: (x) => groundY(x) };
}
