// The little world above the chat: KNOX in wood blocks that tumble onto the grass, a tree
// that grows, and a few creatures going about their business. Purely decorative — the
// whole header is pointer-events: none except the title, and nothing here touches the
// chat layout.

const NS = 'http://www.w3.org/2000/svg';
const COL = 760;

function svg(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  parent?.appendChild(node);
  return node;
}

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const f1 = (n) => Math.round(n * 10) / 10;
const DEG = 180 / Math.PI;

function quad(b, t) {
  const u = 1 - t;
  return { x: u * u * b.x + 2 * u * t * b.cx + t * t * b.x2, y: u * u * b.y + 2 * u * t * b.cy + t * t * b.y2 };
}

// ---------- tree ----------

function buildTree(parent, seed) {
  const r = seeded(seed);
  const branchLayer = svg('g', {}, parent);
  const leafLayer = svg('g', {}, parent);
  const tips = [];
  const clusters = [];
  const leafColors = ['#2c4529', '#365532', '#43663c', '#517a48', '#628e55'];

  function cluster(x, y, t) {
    const count = 3 + Math.floor(r() * 3);
    clusters.push({ x, y, t });
    for (let i = 0; i < count; i++) {
      const leaf = svg('circle', {
        class: 'leaf',
        cx: f1(x + (r() - 0.5) * 13),
        cy: f1(y + (r() - 0.5) * 10 - 2),
        r: f1(3.4 + r() * 4.6),
        fill: leafColors[Math.floor(r() * leafColors.length)],
        'fill-opacity': f1(0.55 + r() * 0.4),
      }, leafLayer);
      leaf.style.setProperty('--delay', `${(t + i * 0.06).toFixed(2)}s`);
    }
  }

  function grow(x, y, ang, len, w, depth, t0) {
    const x2 = x + Math.sin(ang) * len;
    const y2 = y - Math.cos(ang) * len;
    const bend = (r() - 0.5) * len * 0.3;
    const b = {
      depth, x, y, x2, y2, children: [],
      cx: (x + x2) / 2 + Math.cos(ang) * bend,
      cy: (y + y2) / 2 + Math.sin(ang) * bend,
    };
    const dur = 0.26 + len / 110;
    const path = svg('path', {
      class: `branch d${depth}`,
      d: `M${f1(x)} ${f1(y)}Q${f1(b.cx)} ${f1(b.cy)} ${f1(x2)} ${f1(y2)}`,
      'stroke-width': f1(w),
      pathLength: 1,
    }, branchLayer);
    path.style.setProperty('--dur', `${dur.toFixed(2)}s`);
    path.style.setProperty('--delay', `${t0.toFixed(2)}s`);
    const tEnd = t0 + dur * 0.8;
    if (depth >= 5 || len < 7) {
      tips.push({ x: x2, y: y2, depth });
      cluster(x2, y2, tEnd);
      return b;
    }
    const n = depth === 0 ? 3 : r() < 0.28 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const spread = 0.34 + r() * 0.26;
      const off = n === 2 ? (i ? spread : -spread) : (i - 1) * spread * 1.15;
      const a = ang * 0.82 + off + (r() - 0.5) * 0.2;
      const k = (n === 3 && i === 1 ? 0.8 : 0.7) + r() * 0.08;
      b.children.push(grow(x2, y2, a, len * k, Math.max(0.9, w * 0.66), depth + 1, tEnd + r() * 0.08));
    }
    if (depth >= 3 && r() < 0.45) cluster(x2, y2, tEnd + 0.15);
    return b;
  }

  const trunk = grow(0, 0, (r() - 0.5) * 0.06, 40, 7.5, 0, 0.35);
  const top = Math.min(...clusters.map((c) => c.y)) - 12;
  return { trunk, tips, clusters, leafLayer, height: -top };
}

// A climbing route for the squirrel: up the trunk and out along two branches.
function routeFrom(trunk) {
  const segs = [trunk];
  let b = trunk;
  for (let d = 0; d < 2 && b.children.length; d++) {
    b = pick(b.children);
    segs.push(b);
  }
  const pts = [];
  segs.forEach((s, i) => {
    const end = i === segs.length - 1 ? 0.8 : 1;
    for (let k = i ? 1 : 0; k <= 10; k++) pts.push(quad(s, (k / 10) * end));
  });
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, dist, total: dist[dist.length - 1] };
}

function along(route, d) {
  const { pts, dist } = route;
  let i = 1;
  while (i < dist.length - 1 && dist[i] < d) i++;
  const span = dist[i] - dist[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (d - dist[i - 1]) / span));
  const a = pts[i - 1];
  const b = pts[i];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: b.x - a.x, dy: b.y - a.y };
}

// ---------- grass ----------

function buildGrass(group, W, ground, { spacing, hMin, hMax }) {
  group.replaceChildren();
  const sways = Array.from({ length: 5 }, () => {
    const g = svg('g', { class: 'sway' }, group);
    g.style.setProperty('--dur', `${rand(3.6, 6.4).toFixed(2)}s`);
    g.style.setProperty('--delay', `${(-rand(0, 6)).toFixed(2)}s`);
    g.style.setProperty('--amp', `${rand(3, 7).toFixed(1)}deg`);
    return g;
  });
  for (let x = rand(0, spacing); x < W + 4; x += spacing * rand(0.5, 1.5)) {
    const h = rand(hMin, hMax);
    const w = rand(1.4, 2.6);
    const lean = rand(-0.35, 0.35) * h;
    svg('path', {
      d: `M${f1(x - w / 2)} ${ground}Q${f1(x + lean * 0.3)} ${f1(ground - h * 0.55)} ${f1(x + lean)} ${f1(ground - h)}Q${f1(x + lean * 0.25 + w * 0.2)} ${f1(ground - h * 0.5)} ${f1(x + w / 2)} ${ground}Z`,
      'fill-opacity': rand(0.55, 1).toFixed(2),
    }, pick(sways));
  }
}

// ---------- creature sprites (all face right, origin at the feet) ----------

function makeMouse(layer) {
  const g = svg('g', { class: 'critter mouse', visibility: 'hidden' }, layer);
  const tail = svg('path', { class: 'tail-line', d: 'M-7.5 -3.2C-12 -2.6 -14 -6.8 -19 -5.4' }, g);
  const legB = svg('rect', { class: 'leg', x: -4.8, y: -2.4, width: 1.8, height: 2.6, rx: 0.9 }, g);
  const legF = svg('rect', { class: 'leg', x: 3, y: -2.4, width: 1.8, height: 2.6, rx: 0.9 }, g);
  const body = svg('g', {}, g);
  svg('ellipse', { cx: -1, cy: -4.8, rx: 7.4, ry: 4.3 }, body);
  const head = svg('g', {}, body);
  svg('path', { d: 'M3.2 -8.4Q8 -8.4 10.8 -5.2Q8.4 -2.9 3.6 -2.5Z' }, head);
  svg('circle', { class: 'ear', cx: 4.4, cy: -8.8, r: 2.4 }, head);
  svg('circle', { class: 'eye', cx: 7.3, cy: -6.4, r: 0.7 }, head);
  svg('circle', { class: 'nose', cx: 10.6, cy: -5.2, r: 0.75 }, head);
  return { g, tail, legB, legF, body, head };
}

function makeSquirrel(layer) {
  const g = svg('g', { class: 'critter squirrel', visibility: 'hidden' }, layer);
  const tail = svg('path', { class: 'tail-line', d: 'M-4 -5C-11 -5 -14 -11 -12 -16C-10 -21 -3.5 -20.5 -4.5 -15.5' }, g);
  const legB = svg('rect', { class: 'leg', x: -4, y: -2.6, width: 2.4, height: 2.8, rx: 1 }, g);
  const legF = svg('rect', { class: 'leg', x: 2.8, y: -2.4, width: 1.8, height: 2.6, rx: 0.9 }, g);
  const body = svg('g', {}, g);
  svg('ellipse', { cx: 0.5, cy: -5.2, rx: 5.8, ry: 4.2 }, body);
  svg('ellipse', { class: 'belly', cx: 2.6, cy: -4, rx: 2.5, ry: 2.3 }, body);
  svg('circle', { cx: 6, cy: -8.4, r: 3.2 }, body);
  svg('path', { d: 'M4.4 -10.4L5 -14.2L7 -11Z' }, body);
  svg('circle', { class: 'eye', cx: 7.3, cy: -8.9, r: 0.65 }, body);
  return { g, tail, legB, legF, body };
}

function makeBird(layer) {
  const g = svg('g', { class: 'critter bird', visibility: 'hidden' }, layer);
  const legs = svg('path', { class: 'leg-line', d: 'M-.6 -1.9V0M1.2 -1.9V0', fill: 'none' }, g);
  const body = svg('g', {}, g);
  svg('path', { d: 'M-3.4 -4.6L-8.6 -6.6L-8 -3.4Z' }, body);
  svg('ellipse', { cx: 0, cy: -4.4, rx: 4.6, ry: 3.3 }, body);
  svg('ellipse', { class: 'breast', cx: 2, cy: -3.5, rx: 2.5, ry: 1.9 }, body);
  svg('circle', { cx: 3.7, cy: -7, r: 2.4 }, body);
  svg('path', { class: 'beak', d: 'M5.8 -7.6L8.4 -6.9L5.8 -6.2Z' }, body);
  svg('circle', { class: 'eye', cx: 4.6, cy: -7.5, r: 0.55 }, body);
  const wing = svg('path', { class: 'wing', d: 'M-3.2 -5.4Q0 -9 2.8 -5.2Q0 -3.8 -3.2 -5.4Z' }, g);
  return { g, body, wing, legs };
}

function makeSnail(layer) {
  const g = svg('g', { class: 'critter snail', visibility: 'hidden' }, layer);
  const foot = svg('path', { class: 'foot', d: 'M-6.5 0Q-6.8 -2 -3 -2L5 -2Q7.2 -2 7.8 -4.2L8.8 -2.2Q8.8 0 6 0Z' }, g);
  svg('path', { class: 'stalk', d: 'M7.6 -3.8L9.4 -7.6M6.8 -3.9L7.4 -8' }, g);
  svg('circle', { class: 'shell', cx: -0.6, cy: -5.6, r: 4.5 }, g);
  svg('path', { class: 'spiral', d: 'M-.6 -5.6m-1.2 0a1.2 1.2 0 1 0 2.4 0a2.4 2.4 0 1 0 -3.4 2' }, g);
  return { g, foot };
}

const place = (s, x, y, rot, flip, scale) =>
  s.g.setAttribute('transform', `translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)}) scale(${f1(flip * scale)} ${f1(scale)})`);
const show = (s, on) => s.g.setAttribute('visibility', on ? 'visible' : 'hidden');

// ---------- scene ----------

export function createScene(root) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.replaceChildren();

  const back = svg('svg', { class: 'scene-layer scene-back', 'aria-hidden': 'true' });
  const title = document.createElement('div');
  const mid = svg('svg', { class: 'scene-layer scene-critters', 'aria-hidden': 'true' });
  const front = svg('svg', { class: 'scene-layer scene-front', 'aria-hidden': 'true' });
  root.append(back, title, mid, front);

  const defs = svg('defs', {}, mid);
  const glow = svg('filter', { id: 'firefly-glow', x: '-400%', y: '-400%', width: '900%', height: '900%' }, defs);
  svg('feGaussianBlur', { stdDeviation: '2.4', result: 'b' }, glow);
  const merge = svg('feMerge', {}, glow);
  svg('feMergeNode', { in: 'b' }, merge);
  svg('feMergeNode', { in: 'b' }, merge);
  svg('feMergeNode', { in: 'SourceGraphic' }, merge);

  const grassBack = svg('g', { class: 'grass grass-back' }, back);
  const treeRoot = svg('g', {}, back);
  const treeSway = svg('g', {}, treeRoot);
  const tree = buildTree(treeSway, 20251008);
  const grassFront = svg('g', { class: 'grass grass-front' }, front);

  // title blocks
  title.className = 'knox-title';
  title.setAttribute('role', 'img');
  title.setAttribute('aria-label', 'Knox');
  title.title = 'Knock the blocks over';
  const woods = [
    ['#d9a467', '#b67c45', '#925f37'],
    ['#cf9a5d', '#ab723f', '#895731'],
    ['#ddab70', '#ba844f', '#98663d'],
    ['#d39d61', '#b07643', '#8c5933'],
  ];
  const tilt = [-3.5, 2, -1.2, 4.5];
  const blocks = [...'KNOX'].map((ch, i) => {
    const b = document.createElement('span');
    b.className = 'block';
    b.textContent = ch;
    b.setAttribute('aria-hidden', 'true');
    const st = b.style;
    st.setProperty('--i', i);
    st.setProperty('--r1', `${tilt[i]}deg`);
    st.setProperty('--wood-hi', woods[i][0]);
    st.setProperty('--wood', woods[i][1]);
    st.setProperty('--wood-lo', woods[i][2]);
    st.setProperty('--grain', `${rand(174, 181).toFixed(1)}deg`);
    st.setProperty('--knot-x', `${rand(20, 78).toFixed(0)}%`);
    st.setProperty('--knot-y', `${rand(18, 82).toFixed(0)}%`);
    title.append(b);
    return b;
  });

  let W = 0;
  let H = 0;
  let ground = 0;
  let treeX = 0;
  let treeScale = 1;
  let cs = 1;
  let sway = 0;
  let time = 0;
  let mood = 'idle';
  let swirlUntil = 0;
  const drops = [];

  function toWorld(p) {
    const a = sway / DEG;
    const x = p.x * Math.cos(a) - p.y * Math.sin(a);
    const y = p.x * Math.sin(a) + p.y * Math.cos(a);
    return { x: treeX + x * treeScale, y: ground + y * treeScale };
  }

  function layout() {
    const rect = root.getBoundingClientRect();
    if (rect.height < 60 || rect.width < 200) return false;
    if (Math.abs(rect.width - W) < 1 && Math.abs(rect.height - H) < 1) return true;
    W = rect.width;
    H = rect.height;
    ground = H - 12;
    const colLeft = Math.max(0, (W - COL) / 2) + 16;
    const colRight = Math.min(W, (W + COL) / 2) - 16;
    treeScale = Math.min(H < 160 ? 0.8 : 0.92, (ground - 10) / tree.height);
    cs = H < 160 ? 0.85 : 1;
    treeX = colRight - 66 * treeScale;
    for (const layer of [back, mid, front]) layer.setAttribute('viewBox', `0 0 ${f1(W)} ${f1(H)}`);
    treeRoot.setAttribute('transform', `translate(${f1(treeX)} ${ground}) scale(${treeScale})`);
    buildGrass(grassBack, W, ground, { spacing: 5, hMin: 5, hMax: 18 });
    buildGrass(grassFront, W, ground + 1, { spacing: 12, hMin: 3, hMax: 10 });
    root.style.setProperty('--col-left', `${colLeft}px`);
    root.style.setProperty('--ground', `${H - ground}px`);
    root.style.setProperty('--tree-x', `${((treeX / W) * 100).toFixed(1)}%`);
    return true;
  }

  // ---------- title ----------

  function land(b) {
    const left = b.offsetLeft;
    const w = b.offsetWidth;
    for (let k = 0; k < 6; k++) {
      const side = k < 3 ? -1 : 1;
      const d = document.createElement('span');
      d.className = 'dust';
      d.style.left = `${left + w * (side < 0 ? 0.12 : 0.88) - 2}px`;
      d.style.setProperty('--dx', `${side * rand(8, 24)}px`);
      d.style.setProperty('--dy', `${-rand(2, 12)}px`);
      title.append(d);
      setTimeout(() => d.remove(), 800);
    }
    root.classList.remove('thud');
    void root.offsetWidth;
    root.classList.add('thud');
  }

  function drop() {
    if (reduced) return;
    drops.splice(0).forEach(clearTimeout);
    title.classList.remove('drop', 'hop');
    for (const b of blocks) b.style.setProperty('--r0', `${rand(-55, 55).toFixed(0)}deg`);
    void title.offsetWidth;
    title.classList.add('drop');
    blocks.forEach((b, i) => drops.push(setTimeout(() => land(b), (0.2 + i * 0.14 + 1.15 * 0.52) * 1000)));
  }

  function hop() {
    if (reduced) return;
    title.classList.remove('drop', 'hop');
    void title.offsetWidth;
    title.classList.add('hop');
  }

  title.addEventListener('click', () => {
    drop();
    startle();
  });

  // ---------- creatures ----------

  function Mouse() {
    const s = makeMouse(mid);
    let state = 'away';
    let timer = rand(3.5, 6);
    let x = 0;
    let dir = 1;
    let speed = 0;
    let phase = 0;
    let runLeft = 0;
    let fleeing = false;

    function spawn() {
      dir = Math.random() < 0.5 ? 1 : -1;
      x = dir > 0 ? -26 : W + 26;
      state = 'run';
      speed = rand(70, 120);
      runLeft = rand(120, 420);
      fleeing = false;
      show(s, true);
    }

    return {
      update(dt) {
        if (state === 'away') {
          timer -= dt;
          if (timer <= 0) spawn();
          return;
        }
        let bob = 0;
        let sniff = 0;
        if (state === 'run') {
          x += dir * speed * dt;
          phase += dt * speed * 0.42;
          runLeft -= speed * dt;
          bob = Math.abs(Math.sin(phase)) * 1.1;
          if (runLeft <= 0 && !fleeing) {
            state = 'pause';
            timer = rand(0.7, 2.2);
          }
          if (x < -40 || x > W + 40) {
            state = 'away';
            timer = rand(7, 18);
            show(s, false);
            return;
          }
        } else {
          timer -= dt;
          phase += dt * 9;
          sniff = Math.sin(phase) * 7;
          if (timer <= 0) {
            if (Math.random() < 0.3) dir *= -1;
            state = 'run';
            speed = rand(70, 120);
            runLeft = rand(80, 380);
          }
        }
        const leg = state === 'run' ? Math.sin(phase) * 1.6 : 0;
        s.legB.setAttribute('transform', `translate(${f1(leg)} 0)`);
        s.legF.setAttribute('transform', `translate(${f1(-leg)} 0)`);
        s.head.setAttribute('transform', `rotate(${f1(sniff)} 4 -5)`);
        s.tail.setAttribute('transform', `rotate(${f1(Math.sin(time * 5) * 6)} -7.5 -3.2)`);
        place(s, x, ground + 1 - bob, 0, dir, cs);
      },
      startle() {
        if (state === 'away') return;
        fleeing = true;
        state = 'run';
        speed = 300;
        dir = x < W / 2 ? -1 : 1;
      },
      summon() {
        if (state === 'away') timer = Math.min(timer, rand(0.2, 1.2));
      },
    };
  }

  function Squirrel() {
    const s = makeSquirrel(mid);
    let state = 'away';
    let timer = rand(7, 12);
    let x = 0;
    let dir = 1;
    let phase = 0;
    let route = null;
    let dist = 0;
    let flip = 1;
    let speed = 0;

    function spawn() {
      const fromLeft = Math.random() < 0.5;
      x = fromLeft ? -26 : W + 26;
      dir = treeX > x ? 1 : -1;
      speed = rand(110, 150);
      state = 'toTree';
      show(s, true);
    }

    function orient(dx, dy) {
      if (dx > 0.15) flip = 1;
      else if (dx < -0.15) flip = -1;
      return flip > 0 ? Math.atan2(dy, dx) * DEG : Math.atan2(-dy, -dx) * DEG;
    }

    return {
      update(dt) {
        if (state === 'away') {
          timer -= dt;
          if (timer <= 0) spawn();
          return;
        }
        phase += dt * 14;
        let px;
        let py;
        let rot = 0;
        let bob = 0;
        let tail = Math.sin(time * 3) * 4;
        if (state === 'toTree' || state === 'leave') {
          x += dir * speed * dt;
          bob = Math.abs(Math.sin(phase * 0.8)) * 3.2;
          flip = dir;
          px = x;
          py = ground + 1 - bob;
          if (state === 'toTree' && (dir > 0 ? x >= treeX : x <= treeX)) {
            state = 'climb';
            route = routeFrom(tree.trunk);
            dist = 0;
          } else if (state === 'leave' && (x < -40 || x > W + 40)) {
            state = 'away';
            timer = rand(16, 34);
            show(s, false);
            return;
          }
        } else {
          if (state === 'climb') {
            dist += 58 * dt;
            if (dist >= route.total) {
              dist = route.total;
              state = 'sit';
              timer = rand(2.5, 6);
            }
          } else if (state === 'descend') {
            dist -= 78 * dt;
            if (dist <= 0) {
              dist = 0;
              state = 'leave';
              dir = Math.random() < 0.5 ? -1 : 1;
              speed = rand(120, 160);
              x = treeX;
            }
          } else if (state === 'sit') {
            timer -= dt;
            tail = Math.sin(time * 9) * (Math.sin(time * 1.7) > 0.6 ? 14 : 2);
            if (timer <= 0) state = 'descend';
          }
          const p = along(route, Math.max(0.01, dist));
          const w = toWorld(p);
          px = w.x;
          py = w.y;
          if (state === 'sit') {
            flip = p.x >= 0 ? 1 : -1;
            rot = 0;
          } else {
            const going = state === 'descend' ? -1 : 1;
            rot = orient(p.dx * going, p.dy * going);
          }
        }
        const leg = state === 'sit' ? 0 : Math.sin(phase) * 1.6;
        s.legB.setAttribute('transform', `translate(${f1(leg)} 0)`);
        s.legF.setAttribute('transform', `translate(${f1(-leg)} 0)`);
        s.tail.setAttribute('transform', `rotate(${f1(tail)} -4 -5)`);
        place(s, px, py, rot, flip, cs);
      },
      startle() {
        if (state === 'toTree' || state === 'leave') {
          state = 'leave';
          speed = 300;
          dir = x < W / 2 ? -1 : 1;
        } else if (state === 'sit') {
          timer = Math.max(timer, 4);
        }
      },
      summon() {
        if (state === 'away') timer = Math.min(timer, rand(0.5, 1.5));
      },
    };
  }

  function Bird() {
    const s = makeBird(mid);
    let state = 'away';
    let timer = rand(5, 9);
    let tip = null;
    let from = null;
    let to = null;
    let t = 0;
    let dur = 1;
    let flip = 1;
    let actT = 0;
    let act = null;
    let actDur = 0;

    function perches() {
      return tree.tips.filter((p) => p.y < -55);
    }

    function spawn() {
      const options = perches();
      if (!options.length) {
        timer = 5;
        return;
      }
      tip = pick(options);
      const side = Math.random() < 0.5 ? -1 : 1;
      from = { x: side < 0 ? -20 : W + 20, y: rand(4, 30) };
      t = 0;
      state = 'flyIn';
      const end = toWorld(tip);
      dur = Math.max(1.2, Math.hypot(end.x - from.x, end.y - from.y) / 170);
      show(s, true);
    }

    function flyOut() {
      const here = toWorld(tip);
      const side = Math.random() < 0.5 ? -1 : 1;
      from = here;
      to = { x: side < 0 ? -30 : W + 30, y: -20 };
      t = 0;
      dur = Math.max(1, Math.hypot(to.x - here.x, to.y - here.y) / 200);
      state = 'flyOut';
    }

    return {
      update(dt) {
        if (state === 'away') {
          timer -= dt;
          if (timer <= 0) spawn();
          return;
        }
        let x;
        let y;
        let rot = 0;
        let wing = 1;
        let lift = 0;
        let peck = 0;
        if (state === 'flyIn' || state === 'flyOut') {
          t = Math.min(1, t + dt / dur);
          const end = state === 'flyIn' ? toWorld(tip) : to;
          const c = { x: (from.x + end.x) / 2, y: Math.min(from.y, end.y) - 26 };
          const e = state === 'flyIn' ? 1 - (1 - t) * (1 - t) : t * t;
          const u = 1 - e;
          x = u * u * from.x + 2 * u * e * c.x + e * e * end.x;
          y = u * u * from.y + 2 * u * e * c.y + e * e * end.y;
          flip = end.x >= from.x ? 1 : -1;
          wing = Math.sin(time * 30);
          rot = state === 'flyOut' ? -12 : 4;
          if (t >= 1) {
            if (state === 'flyIn') {
              state = 'perch';
              timer = rand(3, 8);
              actT = rand(0.5, 1.4);
            } else {
              state = 'away';
              timer = rand(9, 22);
              show(s, false);
              return;
            }
          }
        } else {
          const p = toWorld(tip);
          x = p.x;
          y = p.y;
          timer -= dt;
          actT -= dt;
          if (actT <= 0 && !act) {
            act = pick(['hop', 'peck', 'peck', 'turn']);
            actDur = act === 'hop' ? 0.3 : 0.24;
            if (act === 'turn') {
              flip *= -1;
              act = null;
            }
            actT = rand(0.6, 1.6);
          }
          if (act) {
            actDur -= dt;
            const k = Math.sin(Math.max(0, actDur) / 0.3 * Math.PI);
            if (act === 'hop') lift = k * 4;
            else peck = k * 30;
            if (actDur <= 0) act = null;
          }
          if (timer <= 0) flyOut();
        }
        s.wing.setAttribute('transform', `translate(0 -5.3) scale(1 ${f1(wing)}) translate(0 5.3)`);
        s.body.setAttribute('transform', `rotate(${f1(peck)} 1 -3)`);
        s.legs.setAttribute('visibility', state === 'perch' ? 'visible' : 'hidden');
        place(s, x, y - lift, rot, flip, cs);
      },
      startle() {
        if (state === 'perch') flyOut();
      },
      summon() {
        if (state === 'away') timer = Math.min(timer, rand(0.5, 2));
      },
    };
  }

  function Snail() {
    const s = makeSnail(mid);
    let state = 'away';
    let timer = rand(14, 26);
    let x = 0;
    let dir = 1;
    let life = 0;
    let lifeMax = 1;

    return {
      update(dt) {
        if (state === 'away') {
          timer -= dt;
          if (timer <= 0) {
            dir = Math.random() < 0.5 ? 1 : -1;
            x = rand(W * 0.1, W * 0.9);
            life = 0;
            lifeMax = rand(10, 16);
            state = 'crawl';
            show(s, true);
          }
          return;
        }
        life += dt;
        x += dir * 6 * dt;
        const fade = Math.min(1, life / 1.2, (lifeMax - life) / 1.2);
        s.g.setAttribute('opacity', Math.max(0, fade).toFixed(2));
        s.foot.setAttribute('transform', `scale(${f1(1 + Math.sin(time * 2.4) * 0.06)} 1)`);
        place(s, x, ground + 1, 0, dir, cs);
        if (life >= lifeMax) {
          state = 'away';
          timer = rand(25, 50);
          show(s, false);
        }
      },
      startle() {},
      summon() {},
    };
  }

  function Fireflies(n) {
    const g = svg('g', { filter: 'url(#firefly-glow)', opacity: '0' }, mid);
    const flies = Array.from({ length: n }, (_, i) => ({
      dot: svg('circle', { class: 'firefly', r: 1.4 }, g),
      x: 0, y: 0, vx: 0, vy: 0,
      ax: 0, ay: 0, retarget: 0,
      phase: rand(0, Math.PI * 2), rate: rand(1.2, 2.4), i,
      placed: false,
    }));
    let shown = 0;

    function anchor(fl) {
      if (Math.random() < 0.65) {
        fl.ax = treeX + rand(-95, 95) * treeScale;
        fl.ay = ground - rand(30, 125) * treeScale;
      } else {
        fl.ax = rand(W * 0.05, W * 0.95);
        fl.ay = ground - rand(8, 40);
      }
      fl.retarget = rand(3, 7);
    }

    return {
      update(dt) {
        shown = Math.min(1, shown + dt * 0.4 * (time > 3 ? 1 : 0));
        g.setAttribute('opacity', shown.toFixed(2));
        const swirling = time < swirlUntil;
        const busy = mood === 'thinking';
        for (const fl of flies) {
          if (!fl.placed) {
            anchor(fl);
            fl.x = fl.ax;
            fl.y = fl.ay;
            fl.placed = true;
          }
          fl.retarget -= dt;
          if (fl.retarget <= 0) anchor(fl);
          let tx = fl.ax;
          let ty = fl.ay;
          if (swirling) {
            const a = time * 1.8 + (fl.i / flies.length) * Math.PI * 2;
            tx = treeX + Math.cos(a) * 70 * treeScale;
            ty = ground - 75 * treeScale + Math.sin(a) * 38 * treeScale;
          }
          const pull = swirling ? 3.2 : busy ? 0.9 : 0.45;
          fl.vx += ((tx - fl.x) * pull + Math.sin(time * 1.3 + fl.phase) * 14) * dt;
          fl.vy += ((ty - fl.y) * pull + Math.cos(time * 1.1 + fl.phase) * 10) * dt;
          const damp = Math.pow(0.35, dt);
          fl.vx *= damp;
          fl.vy *= damp;
          fl.x += fl.vx * dt;
          fl.y += fl.vy * dt;
          const rate = busy ? fl.rate * 2.2 : fl.rate;
          const blink = Math.max(0, Math.sin(time * rate + fl.phase));
          const lit = busy || swirling ? 0.45 + 0.55 * blink : 0.12 + 0.88 * blink * blink;
          fl.dot.setAttribute('cx', f1(fl.x));
          fl.dot.setAttribute('cy', f1(fl.y));
          fl.dot.setAttribute('opacity', lit.toFixed(2));
          fl.dot.setAttribute('r', busy || swirling ? 1.7 : 1.4);
        }
      },
      startle() {
        for (const fl of flies) {
          fl.vx += rand(-120, 120);
          fl.vy += rand(-80, 40);
        }
      },
      summon() {},
    };
  }

  const critters = reduced ? [] : [Mouse(), Squirrel(), Bird(), Snail(), Fireflies(7)];

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (H >= 60 || layout()) {
      time += dt;
      sway = Math.sin(time * 0.55) * 0.7 + Math.sin(time * 1.37) * 0.25;
      treeSway.setAttribute('transform', `rotate(${sway.toFixed(3)})`);
      for (const c of critters) c.update(dt);
    }
    requestAnimationFrame(frame);
  }

  function startle() {
    for (const c of critters) c.startle();
  }

  let bloomed = false;
  function celebrate() {
    hop();
    swirlUntil = time + 7;
    for (const c of critters) c.summon();
    if (bloomed) return;
    bloomed = true;
    tree.clusters.forEach((c, i) => {
      if (Math.random() < 0.35) return;
      for (let k = 0; k < 2; k++) {
        const bl = svg('circle', {
          class: `leaf blossom${Math.random() < 0.4 ? ' w' : ''}`,
          cx: f1(c.x + rand(-6, 6)),
          cy: f1(c.y + rand(-6, 4)),
          r: f1(rand(1.6, 2.6)),
        }, tree.leafLayer);
        bl.style.setProperty('--delay', `${(i * 0.025 + k * 0.1).toFixed(2)}s`);
      }
    });
  }

  new ResizeObserver(() => {
    W = 0;
    layout();
  }).observe(root);
  layout();
  if (!reduced) {
    drop();
    requestAnimationFrame(frame);
  }

  return {
    drop,
    startle,
    celebrate,
    setMood(next) {
      mood = next;
    },
  };
}
