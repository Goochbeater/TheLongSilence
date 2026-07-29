// Drive the touch control layer at the geometries it was built for, with real
// touch events, and assert that the ship actually responds.
//
//   node tools/mobile.mjs              all profiles against the dev server
//   node tools/mobile.mjs --url http://localhost:4173/     the built bundle
//   node tools/mobile.mjs --only pixel-9a
//   node tools/mobile.mjs --shots shots/mobile             write a frame each
//
// Why this exists rather than a resize of the desktop suite: every mobile bug
// in this layer has been a *geometry* bug — a button under the gesture bar, a
// stick whose zone the aux column was sitting on top of, a layout class latched
// during an unfold — and none of them are visible at 1280x720 with a mouse.
// Emulating the two real panels of a Fold 4 and a Pixel 9a, with touch, is the
// only way any of that gets caught before a handset does.
import { chromium, devices } from 'playwright';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { bootGame } from './boot.mjs';

/* Playwright pins a browser build number to the npm version and refuses to run
   against any other. CI images and dev containers routinely carry a Chromium a
   few builds off, and "npx playwright install" is a 150MB download to run a
   layout assertion. If there is a Chromium sitting in the browsers directory,
   use it. $PW_CHROME overrides. */
function chromePath() {
  if (process.env.PW_CHROME) return process.env.PW_CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dir = readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => +b.split('-')[1] - +a.split('-')[1])[0];
  const bin = dir && `${root}/${dir}/chrome-linux/chrome`;
  return bin && existsSync(bin) ? bin : undefined;
}

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const URL = arg('--url', 'http://localhost:5173/');
const ONLY = arg('--only', null);
const SHOTS = arg('--shots', null);

/* The four geometries that matter. CSS pixels and device ratios are the values
   Chrome reports on the real hardware, not the marketing resolution: a Pixel 9a
   is 1080x2424 at dpr 2.625, which is 411x923 CSS, and it is the CSS number
   every layout decision here is made against. */
const PROFILES = [
  {
    id: 'pixel-9a',
    note: 'Pixel 9a, landscape — 6.3", Tensor G4 / Mali-G715',
    viewport: { width: 923, height: 411 }, dpr: 2.625,
    expect: 'compact',
  },
  {
    id: 'fold4-cover',
    note: 'Z Fold 4 cover panel, landscape — the narrowest thing that ships',
    viewport: { width: 882, height: 344 }, dpr: 2.625,
    expect: 'compact',
  },
  {
    id: 'fold4-inner',
    note: 'Z Fold 4 unfolded — near square, and larger than some laptops',
    viewport: { width: 1104, height: 884 }, dpr: 2.0,
    expect: 'roomy',
  },
  {
    id: 'pixel-9a-portrait',
    note: 'Pixel 9a held upright — playable, and the rotate nudge should show',
    viewport: { width: 411, height: 923 }, dpr: 2.625,
    expect: 'portrait',
  },
];

const pass = [], fail = [];
const ok = (p, name, extra = '') => {
  (p ? pass : fail).push(name);
  console.log(`  ${p ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`);
};

const browser = await chromium.launch({
  executablePath: chromePath(),
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
});

if (SHOTS) mkdirSync(SHOTS, { recursive: true });

for (const p of PROFILES) {
  if (ONLY && p.id !== ONLY) continue;
  console.log(`\n── ${p.id}  ${p.viewport.width}x${p.viewport.height} @${p.dpr}x`);
  console.log(`   ${p.note}`);

  const ctx = await browser.newContext({
    ...devices['Pixel 7'],                    // touch + mobile UA, geometry below
    viewport: p.viewport,
    deviceScaleFactor: p.dpr,
    isMobile: true,
    hasTouch: true,
    // Against a production build the page registers sw.js, which would then
    // serve the rest of the run from its own cache and quietly test the cache
    // rather than the build. The worker has its own checks; see docs/HOSTING.md.
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await bootGame(page);

  /* ------------------------------------------------------------- geometry */
  const geo = await page.evaluate(() => ({
    layout: document.documentElement.dataset.layout,
    handheld: document.documentElement.dataset.handheld === '1',
    mounted: !document.getElementById('touchUI').classList.contains('hidden'),
    ctx: document.getElementById('touchUI').dataset.ctx,
    quality: window.__game.quality,
    prCeil: window.__game.engine.prCeil,
    rotate: document.getElementById('rotate').classList.contains('on'),
  }));
  ok(geo.handheld, 'detected as a handheld');
  ok(geo.layout === p.expect, `layout class = ${p.expect}`, `got ${geo.layout}`);
  ok(geo.mounted, 'touch layer mounted');
  ok(geo.quality === 'low', 'quality tier forced to low', `got ${geo.quality}`);
  ok(geo.prCeil <= 0.9, 'pixel-ratio ceiling capped below native', `${geo.prCeil}`);
  if (p.expect === 'portrait') ok(geo.rotate, 'rotate nudge shown in portrait');

  /* --------------------------------------------------- nothing overlapping
     The control layer is the only thing on screen a thumb can hit, so any two
     interactive rects that intersect are a bug you cannot see in a screenshot
     — the top one silently eats the other. */
  const overlaps = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#touchUI .tc-b, #touchUI .tc-sysb, #touchUI .tc-rail')];
    const r = els.map((e) => ({ n: e.dataset.act || e.className, b: e.getBoundingClientRect() }))
      .filter((x) => x.b.width > 0);
    const hits = [];
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        const a = r[i].b, b = r[j].b;
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
          hits.push(`${r[i].n} / ${r[j].n}`);
        }
      }
    }
    return hits;
  });
  ok(overlaps.length === 0, 'no two controls overlap', overlaps.join(', '));

  const offscreen = await page.evaluate(() => {
    const W = innerWidth, H = innerHeight;
    return [...document.querySelectorAll('#touchUI .tc-b, #touchUI .tc-sysb, #touchUI .tc-rail')]
      .map((e) => ({ n: e.dataset.act || e.className, b: e.getBoundingClientRect() }))
      .filter((x) => x.b.width > 0
        && (x.b.left < 0 || x.b.top < 0 || x.b.right > W + 0.5 || x.b.bottom > H + 0.5))
      .map((x) => x.n);
  });
  ok(offscreen.length === 0, 'every control is fully on screen', offscreen.join(', '));

  const tiny = await page.evaluate(() =>
    [...document.querySelectorAll('#touchUI .tc-b')]
      .map((e) => ({ n: e.dataset.act, b: e.getBoundingClientRect() }))
      // 40 CSS px is the floor below which a thumb starts missing. The aux row
      // is allowed to be the smallest thing here and still has to clear it.
      .filter((x) => x.b.width > 0 && Math.min(x.b.width, x.b.height) < 40)
      .map((x) => `${x.n} ${Math.round(x.b.height)}px`));
  ok(tiny.length === 0, 'no touch target under 40px', tiny.join(', '));

  /* ------------------------------------------------------------- the stick
     Sit in the seat, drag the left stick, and check the ship is turning. This
     is the assertion the whole file exists for: everything above is layout,
     and layout that does not fly the ship is decoration. */
  // Take the helm through the game's own path. Writing `player.mode = 'seated'`
  // by hand leaves `seatedAt` null and the very next frame throws inside
  // Player.update — a failure that looks like a control bug and is a test bug.
  await page.evaluate(() => {
    const g = window.__game;
    const seat = g.interior.stations.find((s) => s.id === 'seat');
    g.player.sit(seat);
    g.player.mode = 'seated'; g.player._t = 1;
    g.mode = 'pilot';
    g.ship.angVel.set(0, 0, 0);
  });
  const zone = await page.evaluate(() => {
    const r = document.querySelector('.tc-zone-l').getBoundingClientRect();
    return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.62 };
  });
  await page.touchscreen.tap(zone.x, zone.y);            // wake the layer
  // A real drag: press, move in steps, hold. `tap` alone never produces a
  // pointermove and therefore never deflects anything.
  await page.evaluate(({ x, y }) => {
    const z = document.querySelector('.tc-zone-l');
    const ev = (t, cx, cy) => z.dispatchEvent(new PointerEvent(t, {
      pointerId: 1, pointerType: 'touch', isPrimary: true,
      clientX: cx, clientY: cy, bubbles: true, cancelable: true,
    }));
    ev('pointerdown', x, y);
    for (let i = 1; i <= 6; i++) ev('pointermove', x + i * 6, y - i * 6);
  }, zone);
  await page.waitForTimeout(700);
  const flown = await page.evaluate(() => {
    const a = window.__game.ship.angVel;
    return { l: Math.hypot(a.x, a.y, a.z), sx: window.__game.input.touchL.x, sy: window.__game.input.touchL.y };
  });
  ok(Math.abs(flown.sx) > 0.05 && Math.abs(flown.sy) > 0.05,
    'left stick deflects', `x=${flown.sx.toFixed(2)} y=${flown.sy.toFixed(2)}`);
  ok(flown.l > 1e-4, 'ship responds to the stick', `|angVel|=${flown.l.toExponential(2)}`);
  await page.evaluate(() => {
    document.querySelector('.tc-zone-l').dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 1, pointerType: 'touch', bubbles: true }));
  });
  await page.waitForTimeout(200);
  const released = await page.evaluate(() => window.__game.input.touchL.length());
  ok(released === 0, 'stick recentres on release');

  /* ----------------------------------------------------------- the throttle
     Absolute, so dragging the grip to the top must put the drive at exactly
     full — not "climbing towards full", which is what the rate control the old
     +/- buttons drove would have done. */
  const railTop = await page.evaluate(() => {
    const r = document.querySelector('.tc-rail-track').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 3, bot: r.bottom - 3 };
  });
  await page.evaluate(({ x, y }) => {
    const el = document.querySelector('.tc-rail');
    const ev = (t, cy) => el.dispatchEvent(new PointerEvent(t, {
      pointerId: 2, pointerType: 'touch', isPrimary: true,
      clientX: x, clientY: cy, bubbles: true, cancelable: true }));
    ev('pointerdown', y); ev('pointermove', y);
  }, railTop);
  await page.waitForTimeout(300);
  const thr = await page.evaluate(() => window.__game.ship.throttle);
  ok(thr > 0.98, 'throttle rail commands absolute full', thr.toFixed(3));
  await page.evaluate(({ x, bot }) => {
    const el = document.querySelector('.tc-rail');
    const ev = (t, cy) => el.dispatchEvent(new PointerEvent(t, {
      pointerId: 2, pointerType: 'touch', clientX: x, clientY: cy, bubbles: true, cancelable: true }));
    ev('pointermove', bot);
    // Move and lift in one task, which is what a real slam to idle looks like:
    // there is no frame in between for the loop to sample the final position.
    ev('pointerup', bot);
  }, railTop);
  await page.waitForTimeout(300);
  const thr0 = await page.evaluate(() => window.__game.ship.throttle);
  ok(thr0 < 0.02, 'and slams to zero', thr0.toFixed(3));

  /* -------------------------------------------------------------- contexts
     The button set has to follow the crew. Standing up must replace SCAN and
     the throttle with USE and RUN, and it must do it without anything left
     behind holding an action down. */
  const ctxs = await page.evaluate(async () => {
    const g = window.__game;
    const read = () => ({
      ctx: document.getElementById('touchUI').dataset.ctx,
      acts: [...document.querySelectorAll('#touchUI .tc-b')].map((b) => b.dataset.act),
      rail: !document.querySelector('.tc-rail').classList.contains('hidden'),
    });
    const step = () => new Promise((r) => setTimeout(r, 120));
    const out = { flight: read() };
    g.mode = 'walk'; g.player.mode = 'walk'; g.player.seatedAt = null;
    await step(); await step();
    out.walk = read();
    g.starmap.show(); await step(); await step();
    out.map = read();
    g.starmap.close();
    g.player.sit(g.interior.stations.find((s) => s.id === 'seat'));
    g.player.mode = 'seated'; g.player._t = 1; g.mode = 'pilot';
    await step(); await step();
    out.back = read();
    return out;
  });
  ok(ctxs.flight.ctx === 'flight' && ctxs.flight.acts.includes('scan') && ctxs.flight.rail,
    'flight set has SCAN and the throttle');
  ok(ctxs.walk.ctx === 'walk' && ctxs.walk.acts.includes('use') && !ctxs.walk.acts.includes('scan')
    && !ctxs.walk.rail, 'walking swaps to USE and drops the throttle');
  ok(ctxs.map.ctx === 'map' && ctxs.map.acts.includes('jump') && ctxs.map.acts.includes('next'),
    'the chart offers FOLD TO and a way to change system');
  ok(ctxs.back.ctx === 'flight', 'and comes back');

  /* Stepping the chart selection has to actually move it — the map is aimed by
     gaze, and gaze cannot move a camera that has eased onto a fixed pose. */
  const stepped = await page.evaluate(() => {
    const g = window.__game;
    g.starmap.show();
    const before = g.starmap.sel;
    g.starmap.step(1);
    const after = g.starmap.sel;
    g.starmap.close();
    return { before, after, n: g.galaxy.length };
  });
  ok(stepped.before !== stepped.after, 'system selection steps',
    `${stepped.before} -> ${stepped.after} of ${stepped.n}`);

  /* ------------------------------------------------------------ the unfold
     The Fold's whole trick, and the one thing no other device does: the page
     goes from 882x344 to 1104x884 with no navigation. The layout class must
     follow, and nothing may be left holding a stick against a stale origin. */
  if (p.id === 'fold4-cover') {
    await page.evaluate(() => {
      const z = document.querySelector('.tc-zone-l');
      const r = z.getBoundingClientRect();
      z.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch',
        isPrimary: true, clientX: r.left + 60, clientY: r.top + 60, bubbles: true, cancelable: true }));
      z.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, pointerType: 'touch',
        clientX: r.left + 120, clientY: r.top + 20, bubbles: true, cancelable: true }));
    });
    await page.setViewportSize({ width: 1104, height: 884 });
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => ({
      layout: document.documentElement.dataset.layout,
      held: window.__game.input.touchL.length(),
      w: window.__game.engine.width, h: window.__game.engine.height,
      err: null,
    }));
    ok(after.layout === 'roomy', 'unfold relayouts to roomy', `got ${after.layout}`);
    ok(after.held === 0, 'and drops any stick held against the old origin');
    ok(after.w === 1104 && after.h === 884, 'renderer resized', `${after.w}x${after.h}`);
    await page.setViewportSize(p.viewport);
    await page.waitForTimeout(700);
    const back = await page.evaluate(() => document.documentElement.dataset.layout);
    ok(back === 'compact', 'and folding back returns to compact', `got ${back}`);
  }

  /* ------------------------------------------------------------ settings */
  const settings = await page.evaluate(async () => {
    const g = window.__game;
    const before = getComputedStyle(document.getElementById('touchUI'))
      .getPropertyValue('--tc-stick');
    g.input.controls.toggleSettings(true);
    const open = !document.getElementById('tcSettings').classList.contains('hidden');
    const el = document.querySelector('#tcSettings input[data-k="scale"]');
    el.value = '1.5';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    const after = getComputedStyle(document.getElementById('touchUI'))
      .getPropertyValue('--tc-stick');
    const stored = JSON.parse(localStorage.getItem('tls.device') || '{}').scale;
    g.input.controls.toggleSettings(false);
    return { open, before, after, stored };
  });
  ok(settings.open, 'settings panel opens');
  ok(settings.before !== settings.after, 'size setting resizes the controls live',
    `${settings.before.trim()} -> ${settings.after.trim()}`);
  ok(settings.stored === 1.5, 'and persists');

  /* ------------------------------------------------------------ the frame */
  await page.evaluate(() => {
    const g = window.__game;
    g.input.controls.toggleSettings(false);
    g.mode = 'pilot';
  });
  await page.waitForTimeout(4000);
  const perf = await page.evaluate(() => ({
    fps: +window.__game.engine.fps.toFixed(1),
    pr: +window.__game.engine.pixelRatio.toFixed(2),
    draws: window.__game.engine.drawCalls,
    tris: window.__game.engine.triangles,
  }));
  console.log(`  · ${perf.fps} fps @ ${perf.pr}x  ${perf.draws} draws  `
    + `${(perf.tris / 1000).toFixed(0)}k tris   (software raster — not a device number)`);

  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));

  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/${p.id}.png` });
    console.log(`  · ${SHOTS}/${p.id}.png`);
  }
  await ctx.close();
}

await browser.close();
console.log(`\n${pass.length} passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  FAIL  ${f}`); process.exit(1); }
