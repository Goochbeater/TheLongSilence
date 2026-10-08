// The night scene above the chat. Purely decorative: the header is pointer-events:none
// except the KNOX blocks, and collapsing it only changes its height.
//
// Everything is drawn in "world units": the scene is always 176 units tall and as wide
// as it needs to be, so proportions hold whether the header is 176px, 136px or 112px.
import { clamp, el, lerp, r2 } from './scene/util.js';
import { createSky } from './scene/sky.js';
import { createLand } from './scene/land.js';
import { createTree } from './scene/tree.js';
import { createTitle } from './scene/title.js';
import { createCritters } from './scene/critters.js';

const WORLD_H = 176;
const GROUND = 160;
const COL = 760;
const BLOCK = 50;
const LIGHT = [-0.8, -0.6];

export function createScene(root, { collapsed: startCollapsed = false } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.replaceChildren();
  const stage = document.createElement('div');
  stage.className = 'scene-stage';
  root.append(stage);

  const svgLayer = (cls) => el('svg', { class: `scene-layer ${cls}`, 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMinYMax meet' });
  const back = svgLayer('scene-back');
  const mid = svgLayer('scene-mid');
  const front = svgLayer('scene-front');
  const defs = el('defs', {}, back);

  let W = 0;
  let H = 0;
  let k = 1;
  let Wv = 1000;
  let treeX = 800;
  let blocksSpan = [16, 260];
  let laidOut = false;

  const sky = createSky(back, defs);
  const land = createLand(back, front, defs, { bottom: GROUND });
  const tree = createTree(el('g', {}, back), mid, { light: LIGHT });
  const world = {
    width: () => Wv,
    groundY: (x) => land.groundY(x),
    treeX: () => treeX,
    blocks: () => blocksSpan,
    tree,
  };
  const critters = createCritters(mid, defs, world);
  const title = createTitle({
    onImpact: (i, bump) => {
      const kb = title.blocks[i];
      const cx = (title.node.offsetLeft + kb.offsetLeft + kb.offsetWidth / 2) / k;
      critters.impact(cx, bump ? 70 : 120);
    },
  });
  stage.append(back, title.node, mid, front);

  function layout() {
    const rect = root.getBoundingClientRect();
    if (rect.height < 60 || rect.width < 200) return false;
    if (laidOut && Math.abs(rect.width - W) < 0.5 && Math.abs(rect.height - H) < 0.5) return true;
    W = rect.width;
    H = rect.height;
    k = H / WORLD_H;
    Wv = W / k;
    stage.style.height = `${H}px`;
    for (const svg of [back, mid, front]) svg.setAttribute('viewBox', `0 0 ${r2(Wv)} ${WORLD_H}`);

    const colLeft = (Math.max(0, (W - COL) / 2) + 16) / k;
    const colRight = (Math.min(W, (W + COL) / 2) - 16) / k;
    const narrow = W < 640;
    const treeScale = narrow ? 0.88 : 1;
    treeX = Math.min(colRight - (narrow ? 44 : 66), Wv - tree.span[1] * treeScale - 6);
    title.layout({ block: (narrow ? BLOCK * 0.88 : BLOCK) * k, left: colLeft * k, bottom: (WORLD_H - GROUND - 0.8) * k });
    blocksSpan = [colLeft, colLeft + title.width() / k];

    land.build({ Wv, treeX, blocks: blocksSpan });
    tree.place(treeX, land.groundY(treeX) + 1.4, treeScale);
    const crownLeft = treeX + tree.span[0] * treeScale;
    sky.build({
      Wv,
      moon: { x: clamp(lerp(blocksSpan[1], crownLeft, 0.6), blocksSpan[1] + 14, crownLeft - 14), y: 30, r: 8.5 },
      horizon: GROUND,
    });
    laidOut = true;
    if (reduced && introDone) critters.pose();
    return true;
  }

  // ---------- loop ----------

  let raf = 0;
  let last = 0;
  let time = 0;
  let collapsed = startCollapsed;
  let introDone = false;

  function frame(now) {
    raf = 0;
    if (collapsed || !laidOut) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    tree.update(dt, time, land.groundY);
    critters.update(dt, time);
    sky.update(dt);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (reduced || raf || collapsed || !laidOut) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function begin() {
    introDone = true;
    if (reduced) {
      tree.finish();
      title.rest();
      critters.pose();
      return;
    }
    stage.classList.remove('lit');
    void stage.offsetWidth;
    stage.classList.add('lit');
    tree.grow();
    title.drop(H + BLOCK * k * 2.2);
    start();
  }

  let settle = 0;
  new ResizeObserver(() => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      if (collapsed || !layout()) return;
      if (!introDone) begin();
      else start();
    }, 160);
  }).observe(root);

  root.classList.toggle('paused', collapsed);
  if (!collapsed && layout()) begin();

  return {
    drop() {
      if (laidOut && !reduced) title.drop(H + BLOCK * k * 2.2);
    },
    startle() {
      critters.startle();
      if (laidOut && !reduced) tree.shed(land.groundY, 3);
    },
    celebrate() {
      tree.blossom();
      if (reduced) return;
      critters.celebrate();
      title.hop();
      sky.launch();
    },
    setMood(mood) {
      critters.setMood(mood);
      stage.classList.toggle('thinking', mood === 'thinking');
    },
    setCollapsed(next) {
      collapsed = next;
      root.classList.toggle('paused', next);
      if (next) stop();
      else if (laidOut && introDone) start();
    },
  };
}
