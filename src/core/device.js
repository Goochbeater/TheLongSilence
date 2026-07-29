/* ============================================================================
   What kind of machine is this, and what shape is its screen right now?

   Everything mobile in this codebase reads from here rather than sniffing the
   user agent at the point of use, because the two devices this was built
   against disagree with every rule of thumb you would otherwise write:

     Pixel 9a          1080x2424 at dpr 2.625 -> 411x923 CSS. Ordinary phone,
                       Tensor G4 / Mali-G715. In landscape it is 923x411, so
                       *every* "is this a phone" test based on width says no
                       and every test based on height says yes.

     Galaxy Z Fold 4   two screens, one device, and it swaps between them while
                       the page is running.
                         cover  2316x904  -> ~882x344 CSS landscape. Narrower
                                than most phones and shorter than all of them.
                         inner  2176x1812 -> ~1104x884 CSS. Near square, larger
                                than plenty of laptops, and reached by
                                unfolding *mid-frame* with no navigation.

   So: no user-agent strings, no width thresholds standing in for hardware, and
   the layout class is recomputed on every geometry change rather than latched
   at boot. The one thing worth latching is the GPU tier, because that genuinely
   does not change when you open the hinge.
   ========================================================================== */

const LS = 'tls.device';

/**
 * Is this a handheld — something held in the hands, with a battery and a
 * tile-based GPU — as opposed to a laptop with a touchscreen?
 *
 * `(pointer: coarse)` alone catches touchscreen laptops. `maxTouchPoints` alone
 * catches them too. What a laptop does not have is a *primary* input that is
 * coarse with no hover at all, and what a desktop browser does not report is a
 * screen whose smaller dimension is under ~950 CSS px. The Fold's inner screen
 * is 884, which is why the threshold is not the usual 820 — that number would
 * have shipped the desktop build to the one handheld least able to be honest
 * about it, since an unfolded Fold looks like a small tablet to every metric
 * except the thermal envelope it actually has.
 */
export function isHandheld() {
  const noHover = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const touch = (navigator.maxTouchPoints || 0) > 0;
  /* The discriminator that actually separates a phone from a touchscreen
     laptop. A Surface has a trackpad, so *some* pointer it can reach is fine
     even while a finger is on the glass; a handset has no such pointer at all.
     Without this, any laptop with a touchscreen and a 1366x768 panel is short
     enough and touch-capable enough to be served the phone build. */
  const finePointer = window.matchMedia('(any-pointer: fine)').matches;
  // screen.width/height are the *device* screen and do not change with the
  // window, which is what we want: a small browser window on a desktop is not
  // a phone. On the Fold they DO change, because the two panels are physically
  // different screens — which is also correct.
  const short = Math.min(screen.width, screen.height) <= 950;
  return short && (noHover || (touch && !finePointer));
}

/**
 * A renderer string, when the browser will admit to one.
 *
 * WEBGL_debug_renderer_info is being wound down for fingerprinting reasons and
 * unmasked strings are increasingly redacted, so this is a *bonus* signal only:
 * present, it separates "Adreno 730" from "Mali-G57" and is worth a tier;
 * absent, nothing downstream may depend on it.
 */
function gpuString() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return '';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const s = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    // Drop the context immediately. Handsets cap live WebGL contexts far lower
    // than desktops do (as few as eight), and the one the game actually renders
    // with is created seconds later.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(s || '');
  } catch { return ''; }
}

/**
 * Coarse GPU class for a handheld, 0 (weak) to 2 (flagship-ish).
 *
 * The families below are the ones that matter for this game specifically: it is
 * bound on fragment work and on full-screen post passes, both of which scale
 * with fill rate and with how badly the part hates `gl_FragDepth`. Anything
 * unrecognised gets the middle tier rather than the bottom one — the dynamic
 * resolution controller finds the truth within a few seconds anyway, and
 * starting a good device at the floor is a worse first impression than starting
 * a bad one one step high.
 */
function gpuTier(str) {
  const s = str.toLowerCase();
  if (/apple\s*[am]\d\d?/.test(s)) return 2;               // A-series / M-series
  if (/adreno.*?(7[3-9]\d|8\d\d)/.test(s)) return 2;       // 730+ — Fold 4 is 730
  if (/mali-g(7[1-9]\d|[89]\d\d)/.test(s)) return 2;       // G715 — Pixel 9a is here
  if (/adreno.*?(6[4-9]\d|7[0-2]\d)/.test(s)) return 1;
  if (/mali-g(5\d|6\d|7\d)\b/.test(s)) return 1;
  if (/adreno|mali|powervr|xclipse/.test(s)) return 0;
  return 1;
}

/**
 * Layout class for the *current* geometry.
 *
 * Three shapes, and the names are about how much room a thumb has rather than
 * about any device:
 *
 *   compact   short landscape. Pixel 9a held sideways (923x411) and the Fold's
 *             cover screen (882x344). The scarce axis is height: a stick and a
 *             button stack have to share ~380px with the horizon.
 *   roomy     the Fold unfolded (1104x884). Nearly square, physically large,
 *             and both thumbs are a long way from the centre — controls want to
 *             be bigger AND further into the corners, not just bigger.
 *   portrait  taller than wide. Playable, but the game is framed for a wide
 *             canopy, so this earns a one-time nudge to rotate.
 */
export function layoutClass(w = window.innerWidth, h = window.innerHeight) {
  if (h > w * 1.06) return 'portrait';
  if (h >= 620 && w >= 900) return 'roomy';
  return 'compact';
}

/**
 * Device posture, where the browser knows it.
 *
 * The Fold's inner display is one continuous panel with a soft crease, so it
 * reports `continuous` when flat — the interesting value is `folded`, which is
 * the half-open "laptop"/tabletop pose. In that pose the lower half of the
 * screen is lying flat on a table pointing at the ceiling and is a fine place
 * for controls, while the upper half is standing up and is a terrible one. That
 * is a real layout, and it is the one thing the posture API is worth reading
 * for. Everywhere it is unsupported this returns 'continuous', which is also
 * the right default.
 */
export function posture() {
  return navigator.devicePosture?.type || 'continuous';
}

/**
 * Where the hinge is, in CSS pixels, when the browser splits the viewport.
 *
 * Chrome exposes `env(viewport-segment-*)` and the `horizontal-viewport-segments`
 * media feature when a foldable is posed such that the viewport is genuinely
 * divided. On a flat Fold there is one segment and this returns null, which is
 * correct — a flat Fold has no dead band, only a crease you can see and not
 * feel. When it does return a band, nothing interactive may be placed inside
 * it: a button under the crease is a button that reports touches late and
 * sometimes not at all.
 */
export function hingeBand() {
  if (!document.body) return null;               // called before the body exists
  const two = window.matchMedia('(horizontal-viewport-segments: 2)').matches;
  const twoV = window.matchMedia('(vertical-viewport-segments: 2)').matches;
  if (!two && !twoV) return null;
  // Read the segment rectangles the only way CSS env() is readable from script:
  // set them on a probe element and measure what the engine resolved.
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;'
    + 'left:env(viewport-segment-right 0 0);top:env(viewport-segment-bottom 0 0);'
    + 'width:env(viewport-segment-left 1 0);height:env(viewport-segment-top 1 0)';
  document.body.appendChild(probe);
  const r = probe.getBoundingClientRect();
  probe.remove();
  if (two) {
    const x0 = r.left, x1 = r.width;
    if (!(x1 > x0)) return null;
    return { axis: 'x', start: x0, end: x1 };
  }
  const y0 = r.top, y1 = r.height;
  if (!(y1 > y0)) return null;
  return { axis: 'y', start: y0, end: y1 };
}

/* -------------------------------------------------------------- preferences
   Everything a player can change about the controls, in one object, persisted.
   Defaults are chosen for the harder of the two target devices (a compact
   landscape phone), because a control layout that fits a Pixel 9a fits a Fold
   with room to spare and the reverse is not true. */

const DEFAULTS = {
  scale: 1,            // 0.8 .. 1.4 multiplier on every control's size
  opacity: 0.62,       // resting opacity; controls go solid while touched
  floating: true,      // stick origin follows the thumb down, vs a fixed ring
  mirror: false,       // swap the two halves for left-handed play
  invertY: false,
  lookSens: 1,
  stickSens: 1,
  haptics: true,
  quality: 'auto',     // auto | low | medium | high
  gyro: false,         // tilt to steer, off until asked for
};

export const prefs = load();

function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS) || '{}'); } catch { /* corrupt */ }
  return { ...DEFAULTS, ...saved };
}

export function savePrefs() {
  try { localStorage.setItem(LS, JSON.stringify(prefs)); } catch { /* private mode */ }
}

export function resetPrefs() {
  Object.assign(prefs, DEFAULTS);
  savePrefs();
}

/* ------------------------------------------------------------------ device
   One live object the rest of the game reads, plus a subscription for the
   things that have to *react* — the renderer, which rebuilds a dozen targets,
   and the control layer, which relays itself out. */

class DeviceInfo {
  constructor() {
    this.handheld = isHandheld();
    this.gpu = this.handheld ? gpuString() : '';
    this.gpuTier = this.handheld ? gpuTier(this.gpu) : 2;
    this.cores = navigator.hardwareConcurrency || 4;
    this.memory = navigator.deviceMemory || 0;
    this.layout = layoutClass();
    this.posture = posture();
    this.hinge = null;
    this._subs = new Set();

    /* Why not just listen to `resize`.
     *
     * Unfolding a Fold 4 fires resize while the browser is still mid-animation
     * between the two panels, and `innerWidth/innerHeight` during that window
     * are a blend of the old screen and the new one — measured 884x1104 arriving
     * as 884x344 for two frames, which is a completely different layout class.
     * Latching on that gives you a compact layout on an unfolded device that
     * then never corrects, because no further resize arrives.
     *
     * So every geometry signal goes through the same debounce and the same
     * double-rAF re-measure, and the value is only published once it has been
     * the same for two consecutive animation frames.
     */
    const settle = () => {
      clearTimeout(this._t);
      this._t = setTimeout(() => this._measure(0), 60);
    };
    window.addEventListener('resize', settle);
    window.addEventListener('orientationchange', () => setTimeout(settle, 120));
    window.visualViewport?.addEventListener('resize', settle);
    navigator.devicePosture?.addEventListener?.('change', settle);
    // Segment changes have no event of their own; the media query does.
    window.matchMedia('(horizontal-viewport-segments: 2)').addEventListener?.('change', settle);

    this._measure(0);
  }

  _measure(pass) {
    const w = window.innerWidth, h = window.innerHeight;
    if (pass < 2 && (w !== this._lw || h !== this._lh)) {
      this._lw = w; this._lh = h;
      requestAnimationFrame(() => this._measure(pass + 1));
      return;
    }
    this._lw = w; this._lh = h;

    const layout = layoutClass(w, h);
    const post = posture();
    const hinge = this.handheld ? hingeBand() : null;
    const same = layout === this.layout && post === this.posture
      && JSON.stringify(hinge) === JSON.stringify(this.hinge);

    this.layout = layout;
    this.posture = post;
    this.hinge = hinge;
    this.width = w; this.height = h;
    // The Fold swaps physical panels, so the *screen* changes too. Re-read it:
    // the GPU is the same, but everything that keys off screen size is not.
    this.handheld = this.handheld || isHandheld();

    document.documentElement.dataset.layout = layout;
    document.documentElement.dataset.posture = post;
    document.documentElement.dataset.handheld = this.handheld ? '1' : '0';

    if (!same || pass === 0) for (const fn of this._subs) fn(this);
  }

  /** Subscribe to geometry/posture changes. Returns an unsubscribe. */
  onChange(fn) { this._subs.add(fn); return () => this._subs.delete(fn); }

  /** Short haptic tick, if the player left them on and the platform has them. */
  buzz(ms = 8) {
    if (!prefs.haptics) return;
    try { navigator.vibrate?.(ms); } catch { /* iOS, and Android with it off */ }
  }
}

export const device = new DeviceInfo();

/**
 * Fullscreen + orientation lock + wake lock, all of which require a user
 * gesture and all of which are optional. Called from the WAKE button.
 *
 * Fullscreen is not cosmetic here: without it Chrome on Android keeps the URL
 * bar in the layout viewport and then removes it on the first scroll-ish
 * gesture, which fires a resize, which rebuilds every render target mid-flight.
 * Taking the whole screen up front means the game is sized once.
 */
export async function goImmersive(el = document.documentElement) {
  if (!device.handheld) return;
  try { await el.requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* denied */ }
  try {
    // Landscape is the framing the game is built for, but a Fold's inner screen
    // is near square and plays fine either way — locking it there would be
    // taking something away. Only the narrow panels get pinned.
    if (layoutClass() !== 'roomy') await screen.orientation?.lock?.('landscape');
  } catch { /* not permitted outside fullscreen, or unsupported */ }
  try {
    device._wake = await navigator.wakeLock?.request('screen');
    // Android releases the lock whenever the tab is hidden and never restores
    // it, so a player who takes a call comes back to a screen that dims in
    // thirty seconds. Re-take it on the way back.
    if (device._wake) {
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState !== 'visible') return;
        if (device._wake && !device._wake.released) return;
        try { device._wake = await navigator.wakeLock.request('screen'); } catch { /* denied */ }
      });
    }
  } catch { /* unsupported, or not visible */ }
}
