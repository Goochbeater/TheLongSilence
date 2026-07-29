import * as THREE from 'three';
import { device, prefs, savePrefs, resetPrefs, goImmersive } from './device.js';

/* ============================================================================
   The touch control layer.

   The old one was two fixed rings and five buttons with fixed labels, written
   so that the touch UI could be *tested* from a desktop rather than so that it
   could be played on a phone. This one is built the other way round.

   Four decisions everything else follows from:

   1. Pointer events, not touch events. `touchstart`/`touchmove` do not fire for
      the Fold's S Pen, do not fire for a mouse, and hand you a global
      `changedTouches` list you have to filter by identifier in every handler.
      Pointer events give per-pointer capture, which means a thumb that slides
      off a button keeps holding it — and holding SCAN while the horizon moves
      is the single most common thing a thumb does in this game.

   2. The sticks float. A fixed ring makes you look down to find it. A floating
      stick puts its origin wherever the thumb lands inside a generous zone, so
      the player's eyes never leave the canopy. The zone, not the ring, is the
      real control; the ring is just feedback.

   3. Throttle is a lever, not a pair of buttons. `+`/`-` buttons are a rate
      control pretending to be a setting: you cannot ask for 40% with them, you
      can only hold until it looks about right, and on a 411px-tall screen the
      number you are watching is 9px high. The rail is absolute — where you put
      it is what the drive does.

   4. The button set is contextual and comes from the game's own mode. The
      previous version relabelled five buttons in the HUD and then remapped the
      actions behind them in Game.update, in two places, which is how "SCAN
      opens the star map when you are standing up" happens. Buttons are declared
      once, with the action they actually fire.
   ========================================================================== */

/* ------------------------------------------------------------------ layout
   Sizes per layout class, in CSS pixels before the player's scale multiplier.

   `compact` is the Pixel 9a sideways (923x411) and the Fold's cover panel
   (882x344). Height is the scarce axis: a 118px stick plus a 28px margin plus
   any bottom safe-area eats a third of a 344px screen, so the sticks shrink and
   the button stack goes to the top edge where nothing is happening.

   `roomy` is the Fold unfolded (1104x884). The temptation is to keep phone
   sizes and centre everything; the reality is that the device is 130mm wide
   held in two hands and the thumbs reach the *corners*, not the middle. Bigger
   controls, pushed further out.

   `portrait` is playable rather than recommended: the canopy is a wide frame
   and portrait crops it to a letterbox. Controls take the bottom third, which
   is dead screen in portrait anyway.

   `aux` never goes below 40. Forty CSS pixels is roughly 7mm on both panels,
   which is the floor under which a thumb starts missing — and a control layer
   whose least-used buttons are the ones you cannot hit is one that teaches
   players not to use them. It is also why the aux buttons are a row along the
   top edge rather than a column down the side: seven at 40px is 320px, which
   does not fit in 411px of height next to a stick, and shrinking them until it
   does is solving the wrong problem. */
const METRICS = {
  compact:  { stick: 92,  knob: 34, btn: 48, aux: 40, gap: 7,  rail: 138, pad: 12 },
  roomy:    { stick: 138, knob: 52, btn: 68, aux: 54, gap: 12, rail: 250, pad: 26 },
  portrait: { stick: 108, knob: 40, btn: 56, aux: 44, gap: 8,  rail: 170, pad: 14 },
};

/* ----------------------------------------------------------------- buttons
   `act` is the action name the game asks for by that exact name. `hold` means
   the button reports as held for as long as it is down (and taps still
   register, so a quick jab at SCAN works); everything else is a tap.

   `when` gates a button on live game state — LAND only exists within landing
   range of a solid world, and a button that is present but inert is worse than
   one that is absent, because the player concludes the mechanic is broken
   rather than unavailable. */
const SETS = {
  flight: {
    main: [
      { act: 'scan',  label: 'SCAN',  hold: true, cls: 'hot' },
      { act: 'boost', label: 'BOOST', hold: true },
      { act: 'fold',  label: 'FOLD',  cls: 'fold' },
    ],
    aux: [
      { act: 'land',   label: 'LAND', cls: 'ok', when: (g) => !g.landed && g.canLand && !!g.canLand() },
      { act: 'auto',   label: 'AUTO' },
      { act: 'target', label: 'TGT' },
      { act: 'stop',   label: 'STOP' },
      { act: 'view',   label: 'VIEW' },
      // Standing up is the only way out of the seat and into the rest of the
      // ship. It has no key cap on screen at this size and it was reachable on
      // the old touch layer only by a button labelled FOLD, in one mode.
      { act: 'use',    label: 'STAND' },
      { act: 'map',    label: 'MAP' },
      { act: 'archive', label: 'ARC' },
    ],
    look: true,
    throttle: true,
  },
  /* On foot there is no roll and no throttle, so the right stick has nothing to
     compete for and is simply the head. `lookAlways` says so; the LOOK toggle
     disappears with it, because a toggle with one reachable state is furniture. */
  walk: {
    main: [
      { act: 'use',   label: 'USE', cls: 'hot' },
      { act: 'boost', label: 'RUN', hold: true },
    ],
    aux: [
      { act: 'view',    label: 'VIEW' },
      { act: 'map',     label: 'MAP' },
      { act: 'archive', label: 'ARC' },
    ],
    lookAlways: true,
  },
  landed: {
    main: [
      { act: 'use',     label: 'STEP\nOUT', cls: 'hot' },
      { act: 'liftoff', label: 'LIFT\nOFF', cls: 'fold' },
    ],
    aux: [
      { act: 'map',     label: 'MAP' },
      { act: 'archive', label: 'ARC' },
    ],
    lookAlways: true,
  },
  ground: {
    main: [
      { act: 'use',   label: 'BOARD', cls: 'hot' },
      { act: 'boost', label: 'RUN', hold: true },
    ],
    aux: [
      { act: 'liftoff', label: 'LIFT\nOFF', cls: 'fold' },
      { act: 'map',     label: 'MAP' },
      { act: 'archive', label: 'ARC' },
    ],
    lookAlways: true,
  },
  /* The chart is a thing in the room, not a panel over the world, so it keeps
     the sticks — you are still standing at the nav table and can still look
     around it. What it adds is a way to move the selection without a head that
     can turn far enough to do it by gaze. */
  map: {
    main: [
      { act: 'jump',  label: 'FOLD\nTO', cls: 'fold' },
      { act: 'close', label: 'CLOSE' },
    ],
    aux: [
      { act: 'prev', label: '◀ SYS' },
      { act: 'next', label: 'SYS ▶' },
    ],
    lookAlways: true,
  },
  /* A cutscene is skippable with Escape or Space, and a touchscreen has
     neither. Hiding the whole layer during a sequence — which is right, the
     frame belongs to the camera — took the only way out with it, so one button
     stays. It is the same action the keys fire. */
  cine: { main: [{ act: 'skip', label: 'SKIP' }], aux: [] },
  // The archive is full-screen scrolling DOM with its own close button; the
  // control layer gets out of its way entirely.
  codex: { main: [], aux: [] },
};

/**
 * Pointer capture, which is the whole reason this layer uses pointer events:
 * a thumb that slides off a button keeps holding it, and a thumb that slides
 * out of a stick's zone keeps steering. It throws if the pointer is already
 * gone — a fast tap can release before the handler runs, and synthetic events
 * from the verification tool have no active pointer at all — and there is
 * nothing useful to do about that but carry on without the capture.
 */
function capture(el, e) {
  try { el.setPointerCapture?.(e.pointerId); } catch { /* pointer already up */ }
}

/** Response curve. Linear thumbsticks feel twitchy at the top and dead at the
 *  bottom; this keeps unity at full deflection and softens the first third,
 *  which is where a ship in a stable orbit spends its whole life. */
function curve(v, expo = 0.55) {
  const a = Math.abs(v);
  return Math.sign(v) * (a * (1 - expo) + a * a * a * expo);
}

export class TouchControls {
  /**
   * @param {Input} input  the unified input object; this writes into its
   *                       `touchL` / `touchR` / `touchBtn` / `touchTapped`
   *                       fields, so no downstream code changes.
   */
  constructor(input) {
    this.input = input;
    this.root = document.getElementById('touchUI');
    this.context = null;
    this.visible = true;
    this.lookMode = false;          // right stick drives the head, not the ship
    this.throttleSet = null;        // non-null only while the rail is held
    this.throttleShown = 0;
    this._ctxKey = '';
    this._built = false;

    // Head-look delta accumulated by the right stick in look mode, consumed by
    // the game once per frame in the same place the mouse delta is consumed.
    this.lookDX = 0;
    this.lookDY = 0;
  }

  /* ------------------------------------------------------------------ mount */

  mount() {
    if (this._built) return;
    this._built = true;
    this.root.innerHTML = '';
    // Built, not shown. The boot overlay owns the screen until WAKE is pressed
    // and a set of controls glowing through its backdrop reads as a UI that has
    // leaked. HUD.show() calls reveal().

    const mk = (cls, parent = this.root, html = '') => {
      const d = document.createElement('div');
      d.className = cls;
      if (html) d.innerHTML = html;
      parent.appendChild(d);
      return d;
    };

    /* Zones first, so every button and the rail sit above them in paint order
       and therefore win the hit test. A stick that starts under a button you
       meant to press is the classic touch-UI bug and it is entirely a z-order
       question. */
    this.zoneL = mk('tc-zone tc-zone-l');
    this.zoneR = mk('tc-zone tc-zone-r');
    this.stickL = mk('tc-stick', this.root, '<b></b><i></i>');
    this.stickR = mk('tc-stick', this.root, '<b></b><i></i>');

    this.rail = mk('tc-rail', this.root,
      '<span class="tc-rail-track"><i class="tc-rail-fill"></i><u class="tc-rail-grip"></u></span>'
      + '<em class="tc-rail-num">0</em><label>THR</label>');
    this.railFill = this.rail.querySelector('.tc-rail-fill');
    this.railGrip = this.rail.querySelector('.tc-rail-grip');
    this.railNum = this.rail.querySelector('.tc-rail-num');

    this.padMain = mk('tc-pad tc-pad-main');
    this.padAux = mk('tc-pad tc-pad-aux');
    this.sys = mk('tc-sys');

    this._bindZone(this.zoneL, this.stickL, this.input.touchL, 'L');
    this._bindZone(this.zoneR, this.stickR, this.input.touchR, 'R');
    this._bindRail();
    this._buildSys();
    this._buildSettings();

    device.onChange(() => this.relayout());
    this.relayout();
    if (prefs.gyro) this._gyro(true);
  }

  /** Bring the controls on screen. Called once, when the game actually starts. */
  reveal() { if (this._built) this.root.classList.remove('hidden'); }

  /* -------------------------------------------------------------- geometry */

  relayout() {
    if (!this._built) return;
    const L = device.layout;
    const m = METRICS[L] || METRICS.compact;
    const s = THREE.MathUtils.clamp(prefs.scale, 0.75, 1.5);
    const r = this.root.style;

    r.setProperty('--tc-stick', `${Math.round(m.stick * s)}px`);
    r.setProperty('--tc-knob', `${Math.round(m.knob * s)}px`);
    r.setProperty('--tc-btn', `${Math.round(m.btn * s)}px`);
    r.setProperty('--tc-aux', `${Math.round(m.aux * s)}px`);
    r.setProperty('--tc-gap', `${Math.round(m.gap * s)}px`);
    r.setProperty('--tc-rail', `${Math.round(m.rail * s)}px`);
    r.setProperty('--tc-pad', `${m.pad}px`);
    r.setProperty('--tc-op', String(THREE.MathUtils.clamp(prefs.opacity, 0.25, 1)));
    this.radius = (m.stick * s) * 0.5;

    this.root.dataset.layout = L;
    this.root.dataset.gyro = prefs.gyro ? '1' : '0';
    this.root.classList.toggle('mirror', !!prefs.mirror);
    // The two settings Input owns rather than this class. Pushed from here so
    // there is one place they are applied, and so RESET TO DEFAULTS — which
    // rewrites `prefs` wholesale and then relayouts — cannot miss them.
    this.input.invertY = prefs.invertY;
    this.input.lookSens = prefs.lookSens;

    /* Hinge avoidance.
     *
     * Only when the browser reports a genuinely split viewport — a flat Fold
     * has a crease you can see and not feel, and inseting the controls for it
     * would be throwing away 40px of reach for a cosmetic line. When the band
     * is real, nothing interactive may overlap it: touches inside the fold
     * arrive late, arrive at the wrong coordinate, or do not arrive. */
    const hb = device.hinge;
    if (hb && hb.axis === 'x') {
      r.setProperty('--tc-hinge-l', `${Math.max(0, window.innerWidth - hb.start)}px`);
      r.setProperty('--tc-hinge-r', `${Math.max(0, hb.end)}px`);
      this.root.classList.add('hinged');
    } else if (hb && hb.axis === 'y') {
      // Half-open, screen split top/bottom. The lower half is the flat one and
      // is where a thumb naturally rests, so keep everything below the band.
      r.setProperty('--tc-hinge-b', `${Math.max(0, hb.end)}px`);
      this.root.classList.add('hinged-v');
    } else {
      this.root.classList.remove('hinged', 'hinged-v');
      r.setProperty('--tc-hinge-l', '0px');
      r.setProperty('--tc-hinge-r', '0px');
      r.setProperty('--tc-hinge-b', '0px');
    }

    // Anything mid-drag is now measured against a stale origin. Drop it rather
    // than let the ship snap: an unfold should not roll you inverted.
    this._releaseAll();
  }

  /* ---------------------------------------------------------------- sticks */

  _bindZone(zone, stick, vec, side) {
    const state = { id: null, ox: 0, oy: 0 };
    stick.style.display = 'none';

    const place = (x, y) => {
      stick.style.left = `${x}px`;
      stick.style.top = `${y}px`;
    };

    const down = (e) => {
      if (state.id !== null) return;           // one finger per stick
      if (!this.visible) return;
      state.id = e.pointerId;
      capture(zone, e);

      if (prefs.floating) {
        state.ox = e.clientX; state.oy = e.clientY;
      } else {
        const rc = zone.getBoundingClientRect();
        const inset = this.radius + 16;
        state.ox = side === 'L' ? rc.left + inset : rc.right - inset;
        state.oy = rc.bottom - inset;
      }
      place(state.ox, state.oy);
      stick.style.display = '';
      stick.classList.add('act');
      device.buzz(6);
      move(e);
      e.preventDefault();
    };

    const move = (e) => {
      if (e.pointerId !== state.id) return;
      let dx = (e.clientX - state.ox) / this.radius;
      let dy = (e.clientY - state.oy) / this.radius;
      const l = Math.hypot(dx, dy);

      /* Drag the origin along rather than clamping at the rim.
       *
       * Clamping means that once the thumb has travelled past full deflection
       * — which it does constantly, because the thumb pivots at the knuckle and
       * arcs — the *only* way back to centre is to travel all the way back. The
       * ship stays pinned at full pitch while the player's thumb is visibly
       * moving. Following the origin keeps "stop moving my thumb" and "stop
       * turning" the same gesture, which is what everybody expects. */
      if (l > 1) {
        // Slide the origin along the thumb's own vector by exactly the excess,
        // so the remaining offset is one radius. `1 - 1/l` is that fraction of
        // the *pixel* delta; scaling by the radius as well would move the
        // origin by radius² and throw the ring off the screen.
        const k = 1 - 1 / l;
        state.ox += (e.clientX - state.ox) * k;
        state.oy += (e.clientY - state.oy) * k;
        dx /= l; dy /= l;
        place(state.ox, state.oy);
      }

      // Deadzone last, so it is measured against the final normalised value and
      // not against a raw pixel distance that changes with `scale`.
      const DZ = 0.09;
      const mag = Math.hypot(dx, dy);
      if (mag < DZ) { dx = 0; dy = 0; }
      else {
        const k = (mag - DZ) / (1 - DZ) / mag;
        dx *= k; dy *= k;
      }

      const sens = side === 'L' ? prefs.stickSens : 1;
      vec.set(curve(dx) * sens, curve(dy) * sens);
      const knob = stick.querySelector('i');
      if (knob) knob.style.transform =
        `translate(${dx * this.radius}px, ${dy * this.radius}px)`;
      this.input.touch = true;
      e.preventDefault();
    };

    const up = (e) => {
      if (e.pointerId !== state.id) return;
      state.id = null;
      vec.set(0, 0);
      stick.classList.remove('act');
      stick.style.display = 'none';
      const knob = stick.querySelector('i');
      if (knob) knob.style.transform = '';
    };

    zone.addEventListener('pointerdown', down);
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', up);
    zone.addEventListener('pointercancel', up);
    zone._release = () => { if (state.id !== null) up({ pointerId: state.id }); };
  }

  /* --------------------------------------------------------------- throttle
     Absolute, and it grabs from anywhere on the rail rather than only on the
     grip — a 24px grip is a 24px target, and the whole point of the rail is
     that you can slam it to zero without aiming. */

  _bindRail() {
    const track = this.rail.querySelector('.tc-rail-track');
    let id = null;

    const set = (e) => {
      const rc = track.getBoundingClientRect();
      let v = 1 - (e.clientY - rc.top) / rc.height;
      v = THREE.MathUtils.clamp(v, 0, 1);
      // Detents at the quarters. Not a snap — a 3% magnet, so a deliberate 38%
      // stays 38% and a rough grab at "about half" lands exactly on half.
      for (const d of [0, 0.25, 0.5, 0.75, 1]) if (Math.abs(v - d) < 0.03) v = d;
      if (this.throttleSet !== null && Math.abs(v - this.throttleSet) > 0.001
          && [0, 0.25, 0.5, 0.75, 1].includes(v)) device.buzz(5);
      this.throttleSet = v;
      e.preventDefault();
    };

    this.rail.addEventListener('pointerdown', (e) => {
      if (id !== null || !this.visible) return;
      id = e.pointerId;
      capture(this.rail, e);
      this.rail.classList.add('act');
      device.buzz(8);
      set(e);
    });
    this.rail.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    /* Hold the last commanded value for exactly one more frame.
     *
     * A finger can move and lift inside a single task — a fast slam to zero is
     * one `pointermove` and one `pointerup` with no frame between them — and
     * clearing the command on lift means the frame loop never sees the final
     * position. The throttle then keeps whatever it had halfway through the
     * gesture, which on a slam to idle is the worst possible answer. The flag
     * is cleared in `applyTo`, which runs once per frame *after* Input has read
     * the value, so the last thing the player asked for always lands. */
    const up = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this._railDone = true;
      this.rail.classList.remove('act');
    };
    this.rail.addEventListener('pointerup', up);
    this.rail.addEventListener('pointercancel', up);
    this.rail._release = () => { if (id !== null) up({ pointerId: id }); };
  }

  /** Draw the rail from the ship's real throttle whenever nobody is holding it,
   *  so the autopilot moving the drive moves the lever the player can see. */
  showThrottle(v) {
    if (!this._built) return;
    const t = this.throttleSet !== null ? this.throttleSet : v;
    if (Math.abs(t - this.throttleShown) < 0.002) return;
    this.throttleShown = t;
    this.railFill.style.height = `${(t * 100).toFixed(1)}%`;
    this.railGrip.style.bottom = `${(t * 100).toFixed(1)}%`;
    this.railNum.textContent = Math.round(t * 100);
  }

  /* ---------------------------------------------------------------- buttons */

  _button(def, cls) {
    const b = document.createElement('button');
    b.className = `tc-b ${cls}${def.cls ? ' ' + def.cls : ''}`;
    b.dataset.act = def.act;
    // \n in a label is a deliberate two-line button — "LIFT OFF" does not fit
    // on one line at 46px and "LIFT" alone is ambiguous next to LAND.
    b.innerHTML = def.label.split('\n').map((s) => `<span>${s}</span>`).join('');

    const on = (e) => {
      if (!this.visible) return;
      capture(b, e);
      this.input.touch = true;
      this.input.touchTapped.add(def.act);
      if (def.hold) this.input.touchBtn.add(def.act);
      b.classList.add('on');
      device.buzz(def.cls === 'fold' || def.cls === 'ok' ? 16 : 9);
      e.preventDefault();
      e.stopPropagation();
    };
    const off = (e) => {
      this.input.touchBtn.delete(def.act);
      b.classList.remove('on');
      if (e) e.preventDefault();
    };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b._release = off;
    return b;
  }

  /**
   * Swap the button set. `key` is a mode name from SETS; `game` is read for the
   * conditional buttons. Rebuilds only when the resulting set actually differs,
   * because rebuilding while a finger is down drops the finger.
   */
  setContext(key, game) {
    if (!this._built) return;
    const set = SETS[key] || SETS.flight;
    const aux = set.aux.filter((d) => !d.when || d.when(game));
    const sig = key + '|' + aux.map((d) => d.act).join(',');
    if (sig === this._ctxKey) return;
    this._ctxKey = sig;
    this.context = key;
    this._set = set;

    this.padMain.innerHTML = '';
    this.padAux.innerHTML = '';
    for (const d of set.main) this.padMain.appendChild(this._button(d, 'tc-b-main'));
    for (const d of aux) this.padAux.appendChild(this._button(d, 'tc-b-aux'));

    // LOOK is a mode, not an action, so it lives with the sticks rather than in
    // the action set: while it is on the right stick turns your head instead of
    // rolling the ship, and the label has to show which of those is true.
    this.rail.classList.toggle('hidden', !set.throttle);
    this.lookBtn.classList.toggle('hidden', !set.look);
    if (!set.look) this.setLook(false);
    this.stickR.classList.toggle('look', this.rightIsLook);
    this.root.dataset.ctx = key;
  }

  /** Does the right stick currently turn the head rather than the ship? */
  get rightIsLook() { return !!(this._set && this._set.lookAlways) || this.lookMode; }

  setLook(on) {
    this.lookMode = !!on;
    this.lookBtn.classList.toggle('on', this.lookMode);
    this.stickR.classList.toggle('look', this.rightIsLook);
    if (this.lookBtn) this.lookBtn.firstChild.textContent = this.lookMode ? 'ROLL' : 'LOOK';
  }

  /* ------------------------------------------------------------------- sys */

  _buildSys() {
    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = `tc-sysb ${cls}`;
      b.innerHTML = `<span>${label}</span>`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); device.buzz(9); fn(b); });
      this.sys.appendChild(b);
      return b;
    };

    this.lookBtn = mk('LOOK', 'tc-look', () => this.setLook(!this.lookMode));
    mk('RECENTRE', 'tc-recentre', () => { this._recentre?.(); device.buzz(18); });
    mk('⚙', 'tc-gear', () => this.toggleSettings());
    mk('⛶', 'tc-fs', () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else goImmersive();
    });
  }

  /* -------------------------------------------------------------- settings
     A panel rather than a menu screen. Every row here is something a player
     discovers they want within the first two minutes and cannot get any other
     way: the stick is too small for their hands, the buttons are on the wrong
     side, the look speed is wrong, the phone is too hot. */

  _buildSettings() {
    const p = document.createElement('div');
    p.id = 'tcSettings';
    p.className = 'tc-settings hidden';
    p.innerHTML = `
      <div class="tc-s-head"><h3>CONTROLS</h3><button class="tc-s-x">✕</button></div>
      <div class="tc-s-body">
        <label class="tc-s-row"><span>SIZE</span>
          <input type="range" data-k="scale" min="0.75" max="1.5" step="0.05"><b></b></label>
        <label class="tc-s-row"><span>OPACITY</span>
          <input type="range" data-k="opacity" min="0.25" max="1" step="0.02"><b></b></label>
        <label class="tc-s-row"><span>STICK SENS</span>
          <input type="range" data-k="stickSens" min="0.5" max="1.8" step="0.05"><b></b></label>
        <label class="tc-s-row"><span>LOOK SENS</span>
          <input type="range" data-k="lookSens" min="0.4" max="2.4" step="0.05"><b></b></label>
        <label class="tc-s-row tc-s-t"><span>FLOATING STICKS</span>
          <input type="checkbox" data-k="floating"><i></i></label>
        <label class="tc-s-row tc-s-t"><span>LEFT HANDED</span>
          <input type="checkbox" data-k="mirror"><i></i></label>
        <label class="tc-s-row tc-s-t"><span>INVERT PITCH</span>
          <input type="checkbox" data-k="invertY"><i></i></label>
        <label class="tc-s-row tc-s-t"><span>HAPTICS</span>
          <input type="checkbox" data-k="haptics"><i></i></label>
        <label class="tc-s-row tc-s-t"><span>TILT TO STEER</span>
          <input type="checkbox" data-k="gyro"><i></i></label>
        <div class="tc-s-row tc-s-seg"><span>QUALITY</span>
          <div data-k="quality">
            <button value="auto">AUTO</button><button value="low">LOW</button>
            <button value="medium">MED</button><button value="high">HIGH</button>
          </div></div>
        <div class="tc-s-note">Quality takes effect on reload. The renderer also
          scales resolution on its own to hold the frame rate.</div>
        <button class="tc-s-reset">RESET TO DEFAULTS</button>
      </div>`;
    document.body.appendChild(p);
    this.settings = p;

    const sync = () => {
      for (const el of p.querySelectorAll('input[data-k]')) {
        const k = el.dataset.k;
        if (el.type === 'checkbox') el.checked = !!prefs[k];
        else { el.value = prefs[k]; el.nextElementSibling.textContent = (+prefs[k]).toFixed(2); }
      }
      for (const b of p.querySelectorAll('[data-k="quality"] button')) {
        b.classList.toggle('on', b.value === prefs.quality);
      }
    };

    p.addEventListener('input', (e) => {
      const el = e.target;
      if (!el.dataset.k) return;
      const k = el.dataset.k;
      if (el.type === 'checkbox') prefs[k] = el.checked;
      else { prefs[k] = +el.value; el.nextElementSibling.textContent = (+el.value).toFixed(2); }
      savePrefs();
      this.relayout();
      if (k === 'gyro') this._gyro(prefs.gyro);
    });
    p.querySelector('[data-k="quality"]').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      prefs.quality = b.value; savePrefs(); sync(); device.buzz(9);
    });
    p.querySelector('.tc-s-x').addEventListener('pointerdown', () => this.toggleSettings(false));
    p.querySelector('.tc-s-reset').addEventListener('pointerdown', () => {
      resetPrefs(); sync(); this.relayout(); device.buzz(18);
    });
    this._syncSettings = sync;
    sync();
  }

  toggleSettings(force) {
    const open = force === undefined ? this.settings.classList.contains('hidden') : force;
    this.settings.classList.toggle('hidden', !open);
    if (open) this._syncSettings();
    // Nothing may be held while a modal is up, or SCAN stays down behind it.
    this._releaseAll();
  }

  /* ------------------------------------------------------------------ gyro
     Tilt to steer, off by default and worth having on.

     Calibrated to wherever the device is pointing when it is switched on, not
     to flat — nobody holds a phone flat, and an uncalibrated tilt control puts
     the ship in a permanent turn the moment it is enabled. The contribution is
     *added* to the stick rather than replacing it, so a thumb always wins. */
  _gyro(on) {
    if (!on) {
      if (this._gyroFn) window.removeEventListener('deviceorientation', this._gyroFn);
      this._gyroFn = null;
      this.gyro = null;
      return;
    }
    const start = async () => {
      // iOS gates this behind a permission prompt that must come from a gesture;
      // this is only ever called from the settings toggle, which is one.
      const R = window.DeviceOrientationEvent?.requestPermission;
      if (R) { try { if (await R() !== 'granted') { prefs.gyro = false; savePrefs(); return; } } catch { return; } }
      let zeroB = null, zeroG = null;
      this._recentre = () => { zeroB = null; };
      this._gyroFn = (e) => {
        if (e.beta == null) return;
        if (zeroB === null) { zeroB = e.beta; zeroG = e.gamma; }
        // 22 degrees of travel to full deflection: enough that a hand tremor is
        // nothing and a deliberate lean is everything.
        this.gyro = {
          x: THREE.MathUtils.clamp((e.beta - zeroB) / 22, -1, 1),
          y: THREE.MathUtils.clamp((e.gamma - zeroG) / 22, -1, 1),
        };
      };
      window.addEventListener('deviceorientation', this._gyroFn);
    };
    start();
  }

  /* ----------------------------------------------------------------- frame */

  /**
   * Called once per frame from Input.update, after the sticks have been read.
   * Turns the right stick into either roll+throttle or a head-look delta, and
   * folds the gyro in.
   */
  applyTo(state, dt) {
    if (!this._built) return;
    // Input has already read `throttleSet` for this frame; releasing it here
    // guarantees the final rail position was delivered exactly once.
    if (this._railDone) { this._railDone = false; this.throttleSet = null; }
    if (!this.visible) return;
    const R = this.input.touchR;

    if (this.rightIsLook) {
      /* Rate control, not position: a stick held right keeps turning the head.
         The unit is mouse pixels, because that is what Player.look takes and
         going through the same door means one sensitivity setting governs both.
         520 px/s at full deflection is about 72 degrees a second — a little
         over two seconds to sweep the canopy, which is the speed a head turns.
         No `lookSens` here: the caller applies it, exactly as it does for the
         mouse, and applying it in both places squares it. */
      this.lookDX += R.x * 520 * dt;
      this.lookDY += R.y * 520 * dt * (prefs.invertY ? -1 : 1);
    }

    if (this.gyro) {
      state.pitch = THREE.MathUtils.clamp(state.pitch - curve(this.gyro.x, 0.35), -1, 1);
      state.roll = THREE.MathUtils.clamp(state.roll + curve(this.gyro.y, 0.35), -1, 1);
    }
  }

  consumeLook() {
    const d = { x: this.lookDX, y: this.lookDY };
    this.lookDX = 0; this.lookDY = 0;
    return d;
  }

  /** Hide during cutscenes: the frame belongs to the camera. */
  setVisible(v) {
    if (this.visible === v || !this._built) return;
    this.visible = v;
    this.root.classList.toggle('tc-out', !v);
    if (!v) this._releaseAll();
  }

  _releaseAll() {
    if (!this._built) return;
    this.zoneL?._release?.();
    this.zoneR?._release?.();
    this.rail?._release?.();
    for (const b of this.root.querySelectorAll('.tc-b')) b._release?.();
    this.input.touchBtn.clear();
    this.input.touchL.set(0, 0);
    this.input.touchR.set(0, 0);
  }
}
