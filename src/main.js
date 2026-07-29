import './ui/style.css';
import { Game } from './game/Game.js';
import { INTRO_LINES } from './game/lore.js';
import { device, goImmersive } from './core/device.js';

const bootEl = document.getElementById('boot');
const fill = document.getElementById('bootFill');
const status = document.getElementById('bootStatus');
const startBtn = document.getElementById('bootStart');

function progress(p, text) {
  fill.style.right = `${Math.max(0, (1 - p) * 100)}%`;
  if (text) status.textContent = text;
}

function fatal(msg, err) {
  status.innerHTML = `<span style="color:#ff6b5e">${msg}</span>`;
  if (err) console.error(err);
}

/**
 * Phones used to be turned away at the door.
 *
 * The argument was that this game spends its whole budget on how it looks at
 * full resolution on a discrete GPU — the raymarched atmospheres, the
 * volumetric decks, the terrain self-shadowing, the twenty-pass post chain —
 * and that a phone build would misrepresent it. That was true of a phone build
 * that shipped desktop settings and hoped. It is not true of one that starts at
 * the low tier, renders at a fraction of a 2.6x device ratio, and lets the
 * dynamic resolution controller find the ceiling: the features all survive,
 * because the thing being traded is pixels, which is what that controller has
 * always traded. A Tensor G4 has more fill rate than the laptops this was
 * prototyped on.
 *
 * What actually made a handset a bad experience was the controls, and those are
 * now built for one rather than adapted from a mouse. See core/TouchControls.js.
 */
function portraitNudge() {
  // Not a gate — the game plays in portrait, it is just framed for a canopy.
  // A Fold's inner screen is near-square and this never appears there.
  if (!device.handheld) return;
  const el = document.getElementById('rotate');
  const sync = () => el.classList.toggle('on',
    device.layout === 'portrait' && window.innerWidth < 620);
  device.onChange(sync);
  sync();
}

(async () => {
  const canvas = document.getElementById('scene');

  // WebGL2 gate
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) { fatal('WebGL2 unavailable on this device'); return; }
  probe.getExtension('WEBGL_lose_context')?.loseContext();

  if (device.handheld) {
    document.getElementById('bootStart').textContent = 'TAP TO WAKE';
    document.querySelector('.boot-legal').textContent =
      'best in landscape · headphones recommended';
  }
  portraitNudge();

  let game;
  try {
    game = new Game(canvas, progress);
    window.__game = game;
    await game.boot();
  } catch (e) {
    fatal('initialisation failed — see console', e);
    return;
  }

  status.textContent = 'systems nominal';
  startBtn.hidden = false;

  const begin = async () => {
    startBtn.hidden = true;
    bootEl.classList.add('out');
    setTimeout(() => bootEl.style.display = 'none', 1000);
    game.hud.show();
    game.started = true;
    try { await game.audio.resume(); } catch { /* autoplay policy */ }
    /* Fullscreen, orientation and the wake lock all need a user gesture, and
       this is the only one the game gets. Fullscreen is not cosmetic on
       Android: leave the URL bar in the layout and Chrome removes it on the
       first gesture that looks like a scroll, which fires a resize, which
       rebuilds a dozen render targets in the middle of the opening shot. */
    goImmersive();

    // opening beats
    INTRO_LINES.forEach((l, i) => {
      setTimeout(() => game.hud.narrate(l.text, l.who), 1200 + i * 5200);
    });
    setTimeout(() => {
      game.hud.log('SCANNER ONLINE', 'ok');
      game.hud.log(`SYSTEM · ${game.system.star.name.toUpperCase()}`);
    }, 900);
  };

  startBtn.addEventListener('click', begin);
  window.addEventListener('keydown', (e) => {
    if (!game.started && (e.code === 'Enter' || e.code === 'Space')) begin();
  });

  /* ---------------------------------------------------------------- loop
     ?record=N drives the loop by hand at a fixed 1/N second step instead of
     from the wall clock. Capture is far slower than real time, so a recorder
     that samples a free-running loop gets uneven, stuttering motion; stepping
     one frame per captured image means the footage plays back at exactly the
     intended speed however long the grab took. */
  const RECORD = +(new URLSearchParams(location.search).get('record') || 0);
  let last = performance.now();
  const MAX_DT = 1 / 15;

  /* The GPU took the context back. See Engine's constructor for why this is a
     message rather than a recovery: every cubemap in the world was baked by
     rendering into it, and a restored context comes back with those blank. */
  game.engine.onContextLost = () => {
    game.started = false;
    bootEl.style.display = '';
    bootEl.classList.remove('out');
    bootEl.innerHTML = `
      <div class="boot-inner">
        <h1 class="boot-title">THE LONG SILENCE</h1>
        <div class="boot-sub">DEEP SURVEY VESSEL &middot; <span class="accent">PALE SEEKER</span></div>
        <p class="boot-gate">
          The graphics context was reclaimed while the game was in the
          background.<br>The world has to be built again.
        </p>
        <button id="bootReload" class="boot-start">REBOOT</button>
      </div>`;
    document.getElementById('bootReload').addEventListener('click', () => location.reload());
  };

  function step(dt) {
    try {
      if (game.engine.contextLost) return;
      if (game.started) game.update(dt);
      else game.updateIdle?.(dt);
      game.engine.time = game.time;
      game.engine.dt = dt;
      // the cabin is a second pass with its own camera; see Engine.render
      game.engine.render(
        game.interiorRig && game.interiorRig.visible ? game.interiorScene : null,
        game.interiorCam);
      if (!RECORD) game.engine.adapt(dt);
    } catch (e) {
      console.error(e);
      fatal('runtime error — see console', e);
      throw e;
    }
  }

  function tick(now) {
    requestAnimationFrame(tick);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_DT) dt = MAX_DT;
    if (document.hidden) return;
    step(dt);
  }

  if (RECORD) {
    // one frame per call, so the capture tool controls time exactly
    window.__step = (n = 1) => { for (let i = 0; i < n; i++) step(1 / RECORD); };
    step(1 / RECORD);
  } else {
    requestAnimationFrame(tick);
  }

  /* Register the worker last, and only in a real build.
   *
   * Last, because installing it kicks off a second pass over the whole 8.6 MB
   * payload and the first launch has better things to do with the radio. Only
   * in a build, because a worker sitting in front of the dev server serves the
   * previous copy of a file you just edited, which is a long afternoon.
   *
   * See src/sw.js — it is about the *second* launch, which is the one that
   * decides whether a phone player comes back. */
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* http, or blocked */ });
  }
})();
