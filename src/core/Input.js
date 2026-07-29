import * as THREE from 'three';
import { TouchControls } from './TouchControls.js';
import { device, prefs } from './device.js';

/* ============================================================================
   Unified input: keyboard + mouse-as-stick, gamepad, and touch.
   Everything funnels into one normalised state object the flight model reads,
   so no downstream code cares which device is driving.

   The touch half lives in TouchControls.js — it owns its own DOM, its own
   layout and its own settings — and writes into the same `touchL` / `touchR` /
   `touchBtn` fields this class has always exposed. What is left here is the
   arbitration: which device is allowed to contribute to which axis, and when.
   ========================================================================== */

const KEYMAP = {
  KeyW: 'thrUp', KeyS: 'thrDn',
  KeyA: 'yawL', KeyD: 'yawR',
  KeyQ: 'rollL', KeyE: 'rollR',
  ArrowUp: 'pitchU', ArrowDown: 'pitchD', ArrowLeft: 'yawL', ArrowRight: 'yawR',
  Space: 'up', ControlLeft: 'down', KeyC: 'down',
  ShiftLeft: 'boost', ShiftRight: 'boost',
  KeyF: 'scan', KeyJ: 'fold', KeyX: 'stop',
  KeyR: 'align', KeyV: 'view', KeyT: 'target',
  AltLeft: 'look', AltRight: 'look',
};

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.pressed = new Set();
    this.stick = new THREE.Vector2(0, 0);
    this.sensitivity = 0.0022;
    this.autoCenter = 0.85;
    this.locked = false;
    this.touch = false;
    this.touchL = new THREE.Vector2();
    this.touchR = new THREE.Vector2();
    this.touchBtn = new Set();
    this.touchTapped = new Set();
    this.invertY = prefs.invertY;
    this.uiOpen = false;
    this.lookSens = prefs.lookSens;
    // Set by the throttle rail while it is held; null the rest of the time, so
    // the autopilot keeps the drive the moment the player lets go.
    this.throttleSet = null;
    // raw pointer deltas, consumed once per frame by the first-person camera
    this._mdx = 0; this._mdy = 0;

    this.state = {
      pitch: 0, yaw: 0, roll: 0,
      throttleDelta: 0, strafeX: 0, strafeY: 0,
      boost: 0,
    };

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      const a = KEYMAP[e.code];
      if (a) { this.keys.add(a); this.pressed.add(a); }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      this.pressed.add('code:' + e.code);
    };
    this._onKeyUp = (e) => { const a = KEYMAP[e.code]; if (a) this.keys.delete(a); };
    this._onBlur = () => { this.keys.clear(); };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);

    // --------------------------------------------------------- mouse stick
    dom.addEventListener('mousedown', (e) => {
      if (this.uiOpen || this.touch) return;
      if (e.button === 0 && !this.locked && dom.requestPointerLock) {
        dom.requestPointerLock();
      }
      if (e.button === 2) { this.pressed.add('scanClick'); this.rmb = true; }
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mouseup', (e) => { if (e.button === 2) this.rmb = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this._mdx += e.movementX;
      this._mdy += e.movementY * (this.invertY ? -1 : 1);
    });
    dom.addEventListener('wheel', (e) => {
      this._wheel = (this._wheel || 0) + Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });

    this._initTouch();
  }

  /**
   * Stand the touch layer up.
   *
   * `?touch=1` forces it on a desktop. That is not a debug nicety — it is the
   * only way the layout and the contextual button sets get verified, since the
   * capture tools drive a headless Chromium that reports a mouse. Pointer
   * events mean the same code path serves both, so what is tested is what
   * ships rather than a mouse-only fallback nailed on beside it.
   */
  _initTouch() {
    const forced = new URLSearchParams(location.search).get('touch');
    this.hasTouch = forced === '1' || (forced !== '0' && device.handheld);
    this.controls = new TouchControls(this);
    if (this.hasTouch) this.controls.mount();

    // A stray tap anywhere still counts as "this player is on a touchscreen",
    // which is what switches the on-screen prompts from key caps to labels.
    window.addEventListener('touchstart', () => { this.touch = true; }, { once: true, passive: true });
  }

  /* One-shot presses stay queued until something consumes them. Clearing the
     queue at the end of update() dropped any tap that landed between the input
     poll and the game's own check — which is most of them. */

  /** Consume a one-shot press. */
  tapped(action) {
    if (this.pressed.has(action)) { this.pressed.delete(action); return true; }
    if (this.touchTapped.has(action)) { this.touchTapped.delete(action); return true; }
    return false;
  }
  tappedCode(code) {
    const k = 'code:' + code;
    if (this.pressed.has(k)) { this.pressed.delete(k); return true; }
    return false;
  }
  held(action) { return this.keys.has(action) || this.touchBtn.has(action); }

  wheel() { const w = this._wheel || 0; this._wheel = 0; return w; }

  /** Push a pointer delta into the flight stick. */
  feedStick(dx, dy) {
    this.stick.x += dx * this.sensitivity;
    this.stick.y += dy * this.sensitivity;
    const l = this.stick.length();
    if (l > 1) this.stick.multiplyScalar(1 / l);
  }

  /** Pointer delta since the last call, in pixels. */
  consumeMouse() {
    const d = { x: this._mdx, y: this._mdy };
    this._mdx = 0; this._mdy = 0;
    return d;
  }

  update(dt) {
    const s = this.state;
    const k = (a) => (this.keys.has(a) ? 1 : 0);

    // the stick self-centres slowly, so you can fly hands-off
    if (!this.touch) this.stick.multiplyScalar(Math.max(0, 1 - this.autoCenter * dt));
    else this.stick.set(0, 0);

    let pitch = 0, yaw = 0, roll = 0;
    // the virtual stick is only fed while piloting; on foot it decays unused
    pitch = -this.stick.y;
    yaw = -this.stick.x;
    pitch += (k('pitchU') - k('pitchD')) * 0.9;
    yaw += (k('yawL') - k('yawR')) * 0.9;
    roll += (k('rollL') - k('rollR'));

    /* ---- touch sticks
       Left is always the ship's attitude. Right is roll and throttle *unless*
       it has been handed to the head — on foot always, and at the helm while
       LOOK is lit. Reading it for both at once is how the old layer let a
       glance out of the side window roll the ship ninety degrees. */
    const rightIsLook = this.controls ? this.controls.rightIsLook : false;
    if (this.touch) {
      pitch += -this.touchL.y * (this.invertY ? -1 : 1);
      yaw += -this.touchL.x;
      if (!rightIsLook) roll += this.touchR.x;
    }

    // ---- gamepad
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    let gpThrottle = 0;
    for (const gp of gps) {
      if (!gp) continue;
      const dz = (v) => (Math.abs(v) < 0.14 ? 0 : (v - Math.sign(v) * 0.14) / 0.86);
      pitch += -dz(gp.axes[1] || 0);
      yaw += -dz(gp.axes[0] || 0);
      roll += dz(gp.axes[2] || 0);
      gpThrottle += -dz(gp.axes[3] || 0);
      if (gp.buttons[7]?.pressed) s.boost = 1;
      if (gp.buttons[0]?.pressed) this.pressed.add('scan');
      break;
    }

    s.pitch = THREE.MathUtils.clamp(pitch, -1, 1);
    s.yaw = THREE.MathUtils.clamp(yaw, -1, 1);
    s.roll = THREE.MathUtils.clamp(roll, -1, 1);
    s.boost = this.held('boost') ? 1 : 0;

    let td = k('thrUp') - k('thrDn');
    if (this.touch && !rightIsLook) td += -this.touchR.y;
    if (this.touchBtn.has('thrUp')) td += 1;
    if (this.touchBtn.has('thrDn')) td -= 1;
    td += gpThrottle;
    const w = this.wheel();
    s.throttleDelta = td + (-w * 6);

    /* The rail is a lever: while a thumb is on it, its position *is* the
       throttle, and the rate control above is ignored for that frame. Handing
       an absolute value up rather than converting it to a delta here matters,
       because a delta large enough to cover the whole range in one frame would
       be clamped by the same integrator the autopilot shares. */
    this.throttleSet = this.controls ? this.controls.throttleSet : null;

    s.strafeY = k('up') - k('down');
    s.strafeX = 0;

    // Gyro contribution and the head-look accumulator, last, so both see the
    // final stick values.
    if (this.controls) this.controls.applyTo(s, dt);
  }
}
