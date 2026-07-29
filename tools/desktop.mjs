// The desktop path, after the handheld one landed on top of it.
//
//   node tools/desktop.mjs [url]      default http://localhost:4173/
//
// Making the game run on a phone meant branching Engine's constructor and
// Input.update on `device.handheld`, and every one of those branches takes
// something away: the supersampling headroom, the cabin's shadow map, the
// ambient-occlusion chain, the mouse-as-stick. A phone is the one machine that
// will never notice if one of those branches is taken on the wrong hardware.
//
// smoke.mjs already asks whether the built bundle boots and flies. This asks
// the narrower question that the mobile work actually put at risk: on a pointer
// device, is everything still switched on, and does the pointer still fly?
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';

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

const URL = process.argv[2] || 'http://localhost:4173/';
const pass = [], fail = [];
const ok = (p, n, x = '') => {
  (p ? pass : fail).push(n);
  console.log(`  ${p ? '✓' : '✗'} ${n}${x ? '  ' + x : ''}`);
};

const browser = await chromium.launch({
  executablePath: chromePath(),
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
});
// No `devices` spread, no `hasTouch`, no `isMobile`: a plain pointer context is
// the entire point of this file.
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded' });

/* Booted here rather than through boot.mjs, on purpose.
 *
 * boot.mjs exists to survive the dev server hot-reloading a capture out from
 * under itself, and pays for that with a ninety-second budget and four retries.
 * This tool runs against the built bundle, where there is no hot reload to
 * survive — and the desktop tier is the one configuration that does not fit in
 * ninety seconds when there is no GPU: it bakes its sky at 1024 and renders at
 * up to 2.8x device pixels, where a handheld bakes at 256 and renders at 0.85x.
 * Measured on a software rasteriser, WAKE appears between 45 and 90 seconds and
 * the boot is otherwise completely clean. Retrying that is not resilience, it
 * is four consecutive timeouts; waiting longer once is the honest answer.
 */
await page.waitForFunction(
  () => { const b = document.getElementById('bootStart'); return b && !b.hidden; },
  null, { timeout: 300000 });
await page.evaluate(() => document.getElementById('bootStart').click());
await page.waitForFunction(() => window.__game && window.__game.started, null, { timeout: 120000 });
await page.waitForTimeout(1500);

const r = await page.evaluate(async () => {
  const g = window.__game;
  // Through the game's own path — writing `player.mode = 'seated'` by hand
  // leaves `seatedAt` null and the next frame throws inside Player.update.
  g.player.sit(g.interior.stations.find((s) => s.id === 'seat'));
  g.player.mode = 'seated'; g.player._t = 1; g.mode = 'pilot';
  g.ship.angVel.set(0, 0, 0); g.ship.throttle = 0;

  // Exactly what pointer lock feeds the flight stick.
  for (let i = 0; i < 30; i++) g.input.feedStick(12, -8);
  g.input.keys.add('thrUp');
  await new Promise((res) => setTimeout(res, 900));
  g.input.keys.delete('thrUp');

  const a = g.ship.angVel;
  return {
    hasTouch: g.input.hasTouch,
    touchHidden: document.getElementById('touchUI').classList.contains('hidden'),
    handheld: document.documentElement.dataset.handheld === '1',
    quality: g.quality,
    prCeil: g.engine.prCeil,
    prFloor: g.engine.prFloor,
    fpsDown: g.engine.fpsDown,
    shadows: g.engine.renderer.shadowMap.enabled,
    ao: g.engine.post.enabled.ao,
    angVel: Math.hypot(a.x, a.y, a.z),
    throttle: g.ship.throttle,
    hints: document.getElementById('hints').children.length,
  };
});

ok(!r.handheld, 'not classified as a handheld');
ok(!r.hasTouch, 'touch layer not enabled');
ok(r.touchHidden, '#touchUI stays hidden');
ok(r.quality === 'high' || r.quality === 'medium', 'desktop quality tier', r.quality);
ok(r.prCeil >= 1.7, 'supersampling headroom intact', String(r.prCeil));
ok(r.prFloor >= 1.0, 'resolution floor stays at one device pixel', String(r.prFloor));
ok(r.fpsDown === 57, 'still targeting sixty, not the handheld band', String(r.fpsDown));
ok(r.shadows === true, 'cabin shadow map still on');
ok(r.ao === true, 'ambient occlusion still on');
ok(r.angVel > 1e-4, 'mouse-as-stick still flies the ship', r.angVel.toExponential(2));
ok(r.throttle > 0.1, 'W still opens the throttle', r.throttle.toFixed(3));
ok(r.hints > 0, 'the key-hint row still renders', String(r.hints));
ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n${pass.length} passed, ${fail.length} failed`);
if (fail.length) process.exit(1);
