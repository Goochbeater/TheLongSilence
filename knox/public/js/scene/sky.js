// Night sky: twinkling stars, a crescent moon with a soft halo, two ranges of distant
// hills fading into mist, and the occasional shooting star.
import { el, noise1d, openCurve, r2, rand, seeded } from './util.js';

export function createSky(layer, defs) {
  const halo = el('radialGradient', { id: 'kx-halo' }, defs);
  el('stop', { offset: '0', 'stop-color': '#efe7c9', 'stop-opacity': '0.2' }, halo);
  el('stop', { offset: '0.22', 'stop-color': '#efe7c9', 'stop-opacity': '0.07' }, halo);
  el('stop', { offset: '0.55', 'stop-color': '#c9d6cf', 'stop-opacity': '0.025' }, halo);
  el('stop', { offset: '1', 'stop-color': '#c9d6cf', 'stop-opacity': '0' }, halo);

  const mist = el('linearGradient', { id: 'kx-mist', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
  el('stop', { offset: '0', 'stop-color': '#9fbdb2', 'stop-opacity': '0' }, mist);
  el('stop', { offset: '0.55', 'stop-color': '#9fbdb2', 'stop-opacity': '0.05' }, mist);
  el('stop', { offset: '1', 'stop-color': '#9fbdb2', 'stop-opacity': '0' }, mist);

  const streak = el('linearGradient', { id: 'kx-streak', x1: '0', y1: '0', x2: '1', y2: '0' }, defs);
  el('stop', { offset: '0', 'stop-color': '#eef4f2', 'stop-opacity': '0' }, streak);
  el('stop', { offset: '1', 'stop-color': '#eef4f2', 'stop-opacity': '0.95' }, streak);

  const mask = el('mask', { id: 'kx-moon-mask', maskContentUnits: 'userSpaceOnUse' }, defs);
  const maskLit = el('circle', { fill: '#fff' }, mask);
  const maskShade = el('circle', { fill: '#000' }, mask);

  const root = el('g', { class: 'sky' }, layer);
  const stars = el('g', { class: 'stars' }, root);
  const moonG = el('g', { class: 'moon' }, root);
  const hills = el('g', {}, root);
  const shooter = el('g', { class: 'shooter', opacity: '0' }, root);
  el('path', { d: 'M0 -0.7L-46 -0.15L-46 0.15L0 0.7Z', fill: 'url(#kx-streak)' }, shooter);
  el('circle', { r: '0.9', fill: '#f4f8f6' }, shooter);

  let width = 0;
  let shoot = null;
  let nextShoot = rand(18, 40);

  function build({ Wv, moon, horizon }) {
    width = Wv;
    const rng = seeded(911);

    stars.replaceChildren();
    // five twinkle groups instead of one animation per star keeps style recalcs cheap
    const groups = Array.from({ length: 5 }, (_, i) => {
      const g = el('g', { class: 'twinkle' }, stars);
      g.style.setProperty('--d', `${r2(2.6 + i * 0.9)}s`);
      g.style.setProperty('--dl', `${r2(-i * 1.3)}s`);
      return g;
    });
    const count = Math.round(Wv / 15);
    for (let i = 0; i < count; i++) {
      const x = rng() * Wv;
      const y = 4 + rng() ** 1.5 * (horizon - 58);
      if (Math.hypot(x - moon.x, y - moon.y) < moon.r * 3.2) continue;
      const bright = rng();
      const home = groups[Math.floor(rng() * groups.length)];
      el('circle', {
        class: 'star',
        cx: r2(x),
        cy: r2(y),
        r: r2(0.28 + bright ** 3 * 0.75),
        opacity: r2(0.35 + bright * 0.55),
      }, home);
      if (bright > 0.965) {
        el('path', {
          class: 'star sparkle',
          d: `M${r2(x - 2.6)} ${r2(y)}L${r2(x)} ${r2(y - 0.35)}L${r2(x + 2.6)} ${r2(y)}L${r2(x)} ${r2(y + 0.35)}ZM${r2(x)} ${r2(y - 2.6)}L${r2(x + 0.35)} ${r2(y)}L${r2(x)} ${r2(y + 2.6)}L${r2(x - 0.35)} ${r2(y)}Z`,
        }, home);
      }
    }

    moonG.replaceChildren();
    const { x, y, r } = moon;
    el('circle', { cx: r2(x), cy: r2(y), r: r2(r * 7.5), fill: 'url(#kx-halo)' }, moonG);
    el('circle', { cx: r2(x), cy: r2(y), r: r2(r), fill: '#16201d' }, moonG);
    maskLit.setAttribute('cx', r2(x));
    maskLit.setAttribute('cy', r2(y));
    maskLit.setAttribute('r', r2(r + 0.2));
    maskShade.setAttribute('cx', r2(x + r * 0.46));
    maskShade.setAttribute('cy', r2(y - r * 0.2));
    maskShade.setAttribute('r', r2(r * 0.94));
    const lit = el('g', { mask: 'url(#kx-moon-mask)' }, moonG);
    el('circle', { cx: r2(x), cy: r2(y), r: r2(r), fill: '#ebe3c6' }, lit);
    el('circle', { cx: r2(x - r * 0.48), cy: r2(y + r * 0.22), r: r2(r * 0.17), fill: '#d6cdb0' }, lit);
    el('circle', { cx: r2(x - r * 0.2), cy: r2(y + r * 0.62), r: r2(r * 0.11), fill: '#d6cdb0' }, lit);
    el('circle', { cx: r2(x - r * 0.62), cy: r2(y - r * 0.32), r: r2(r * 0.09), fill: '#dcd3b6' }, lit);

    hills.replaceChildren();
    const far = noise1d(rng, 5, 0.0075);
    const near = noise1d(rng, 4, 0.011);
    const ridge = (fn, base, amp, step) => {
      const pts = [];
      for (let px = -40; px <= Wv + 40; px += step) pts.push([px, base - (fn(px) + 1) * 0.5 * amp]);
      return pts;
    };
    const farPts = ridge(far, horizon - 18, 30, 20);
    el('path', { d: `M${farPts[0][0]} ${horizon + 20}L${r2(farPts[0][0])} ${r2(farPts[0][1])}${openCurve(farPts)}L${Wv + 40} ${horizon + 20}Z`, fill: '#0f1917' }, hills);
    // a few far-off conifers on the far ridge, for scale
    const groves = Math.max(1, Math.round(Wv / 420));
    for (let i = 0; i < groves; i++) {
      const gx = 40 + rng() * (Wv - 80);
      if (Math.abs(gx - moon.x) < 40) continue;
      const trees = 2 + Math.floor(rng() * 3);
      for (let j = 0; j < trees; j++) {
        const tx = gx + j * (3.2 + rng() * 2.6);
        const by = horizon - 18 - (far(tx) + 1) * 0.5 * 30 + 1.6;
        const h = 4.5 + rng() * 5;
        el('path', { d: `M${r2(tx - h * 0.3)} ${r2(by)}L${r2(tx - h * 0.12)} ${r2(by - h * 0.62)}L${r2(tx - h * 0.2)} ${r2(by - h * 0.6)}L${r2(tx)} ${r2(by - h * 1.45)}L${r2(tx + h * 0.2)} ${r2(by - h * 0.6)}L${r2(tx + h * 0.12)} ${r2(by - h * 0.62)}L${r2(tx + h * 0.3)} ${r2(by)}Z`, fill: '#0f1917' }, hills);
      }
    }
    const mistBand = el('rect', { class: 'mist', x: r2(-Wv * 0.5), y: r2(horizon - 40), width: r2(Wv * 2), height: 34, fill: 'url(#kx-mist)' }, hills);
    mistBand.style.setProperty('--drift', `${r2(Wv * 0.25)}px`);
    const nearPts = ridge(near, horizon - 6, 14, 22);
    el('path', { d: `M${nearPts[0][0]} ${horizon + 20}L${r2(nearPts[0][0])} ${r2(nearPts[0][1])}${openCurve(nearPts)}L${Wv + 40} ${horizon + 20}Z`, fill: '#0c1411' }, hills);
  }

  function launch() {
    const x0 = rand(width * 0.25, width * 0.95);
    const y0 = rand(6, 30);
    const a = rand(0.28, 0.5);
    shoot = { x0, y0, dx: -Math.cos(a), dy: Math.sin(a), t: 0, dur: rand(0.7, 1) };
  }

  return {
    build,
    launch,
    update(dt) {
      nextShoot -= dt;
      if (nextShoot <= 0 && !shoot) {
        launch();
        nextShoot = rand(35, 80);
      }
      if (!shoot) return;
      shoot.t += dt;
      const p = shoot.t / shoot.dur;
      if (p >= 1) {
        shooter.setAttribute('opacity', '0');
        shoot = null;
        return;
      }
      const dist = p * 150;
      const ang = Math.atan2(shoot.dy, shoot.dx) * (180 / Math.PI);
      shooter.setAttribute('transform', `translate(${r2(shoot.x0 + shoot.dx * dist)} ${r2(shoot.y0 + shoot.dy * dist)}) rotate(${r2(ang)})`);
      shooter.setAttribute('opacity', r2(Math.sin(p * Math.PI) * 0.85));
    },
  };
}
