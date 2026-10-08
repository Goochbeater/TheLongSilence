// The creatures. Every sprite faces right with its origin at its feet; the outer group
// carries position and facing, inner groups carry poses (rearing, sitting, ruffling).
//   mouse     scurries in bursts, stops to sniff, rears up to look around
//   rabbit    hops in from an edge, sits to nibble and twitch its ears, hops away
//   squirrel  bounds to the tree, climbs out along a limb, sits flicking its tail
//   owl       flies in once the tree has grown, blinks, looks about, watches you type
//   fireflies drift around the crown and over the grass
import { around, chance, clamp, ease, el, lerp, r2, rand, setT } from './util.js';

// ---------- sprites ----------

function drawMouse(layer) {
  const g = el('g', { class: 'critter mouse', visibility: 'hidden' }, layer);
  const pose = el('g', {}, g);
  const tail = el('path', { class: 'tail-line', d: 'M-9.2 -2.6C-13.4 -2.4 -15.8 -5.6 -19.6 -5C-21.8 -4.6 -23.2 -3.2 -24.6 -2.4' }, pose);
  const footB = el('ellipse', { class: 'foot', cx: '-4.6', cy: '-0.45', rx: '2.1', ry: '0.62' }, pose);
  const footF = el('ellipse', { class: 'foot', cx: '5.6', cy: '-0.4', rx: '1.5', ry: '0.52' }, pose);
  el('path', { class: 'fur', d: 'M5.2 -1.2C5.8 -4.8 3.6 -8.8 -1.4 -9C-6.4 -9.2 -9.8 -6.6 -10 -3.8C-10.2 -1.2 -7.8 0 -4.6 0L2.4 0C4 0 5 -0.5 5.2 -1.2Z' }, pose);
  el('path', { class: 'lit', d: 'M-9 -5.4C-7.6 -8 -3.6 -9.2 0.4 -8.8' }, pose);
  const head = el('g', {}, pose);
  el('path', { class: 'fur', d: 'M2.4 -7.6C5.6 -8.6 8.8 -6.8 11.5 -4C11.9 -3.6 11.7 -3.1 11.1 -3C8.4 -2.3 5.2 -1.3 3.1 -1.9C1.2 -2.5 0.6 -7 2.4 -7.6Z' }, head);
  el('path', { class: 'fur', d: 'M3.2 -7.4C2.4 -10.6 4.4 -12.5 6.5 -11.5C7.9 -10.8 7.3 -8.6 5.6 -7.3Z' }, head);
  el('path', { class: 'ear-in', d: 'M3.9 -7.9C3.5 -10 4.8 -11.2 6 -10.6C6.8 -10.1 6.4 -8.8 5.3 -7.9Z' }, head);
  el('path', { class: 'lit', d: 'M3 -7.7C5.6 -8.4 8.2 -7 10.6 -4.6' }, head);
  el('circle', { class: 'eye', cx: '7.7', cy: '-5.6', r: '0.85' }, head);
  el('circle', { class: 'glint', cx: '8', cy: '-5.9', r: '0.3' }, head);
  el('circle', { class: 'nose', cx: '11.3', cy: '-3.55', r: '0.6' }, head);
  el('path', { class: 'whisker', d: 'M10.6 -3.9L14.4 -5.2M10.7 -3.5L14.7 -3.3M10.6 -3.1L14.1 -1.8' }, head);
  return { g, pose, tail, footB, footF, head };
}

function drawRabbit(layer) {
  const g = el('g', { class: 'critter rabbit', visibility: 'hidden' }, layer);
  const pose = el('g', {}, g);
  el('ellipse', { class: 'foot', cx: '-4', cy: '-0.55', rx: '4.8', ry: '1.1' }, pose);
  el('path', { class: 'fur', d: 'M-9.6 -1C-12.2 -5.2 -11 -12.4 -4.6 -14C0.4 -15.2 5.2 -13.4 6.4 -9.6C7.4 -6.4 7 -2.6 5.4 -0.8C3.6 0.4 -6.8 0.6 -9.6 -1Z' }, pose);
  el('circle', { class: 'cotton', cx: '-10.3', cy: '-6.6', r: '2.7' }, pose);
  el('path', { class: 'fur', d: 'M4.2 -0.1C4.4 -2.3 6.8 -2.7 7.7 -1.1C8.1 -0.2 7.2 0.2 6 0.2Z' }, pose);
  el('path', { class: 'lit', d: 'M-10.8 -6.4C-10.8 -11.2 -6.8 -14.5 -1.4 -14.7' }, pose);
  const head = el('g', {}, pose);
  const ears = el('g', {}, head);
  el('path', { class: 'fur shade', d: 'M5.4 -17.8C3.4 -22.4 2.2 -27.8 3.8 -29.4C5.4 -30.8 7.5 -26.2 7.7 -19Z' }, ears);
  const earF = el('g', {}, ears);
  el('path', { class: 'fur', d: 'M7.1 -18.4C6.9 -23.4 8.1 -29.2 9.9 -29.8C11.7 -30.2 11.1 -24.4 9.1 -18Z' }, earF);
  el('path', { class: 'ear-in', d: 'M7.9 -19.4C8.1 -23.6 8.9 -27.4 9.7 -27.8C10.3 -27.2 9.7 -23.6 8.7 -19.4Z' }, earF);
  el('path', { class: 'fur', d: 'M3.1 -14.2C3.3 -18.6 8.1 -20.6 11.3 -18C13.5 -16.2 14.1 -13.2 12.9 -11.6C11.5 -9.8 7.5 -9.6 5.3 -10.6C3.7 -11.3 3 -12.6 3.1 -14.2Z' }, head);
  el('path', { class: 'lit', d: 'M4.1 -16.4C5.5 -18.8 8.7 -19.6 10.9 -18.2' }, head);
  el('circle', { class: 'eye', cx: '10.1', cy: '-15.5', r: '1' }, head);
  el('circle', { class: 'glint', cx: '10.45', cy: '-15.85', r: '0.36' }, head);
  el('circle', { class: 'nose', cx: '13', cy: '-13.1', r: '0.55' }, head);
  el('path', { class: 'whisker', d: 'M12.4 -13L16 -14.2M12.5 -12.6L16.2 -12.3' }, head);
  return { g, pose, head, ears, earF };
}

function drawSquirrel(layer) {
  const g = el('g', { class: 'critter squirrel', visibility: 'hidden' }, layer);
  const pose = el('g', {}, g);
  const tail = el('g', {}, pose);
  el('path', { class: 'fur tail', d: 'M-3.6 -3C-9.6 -2 -14.2 -6 -14.4 -11.6C-14.6 -17.4 -10.4 -21.2 -6.4 -20.2C-3.4 -19.4 -3 -16 -5.4 -14.6C-7.6 -13.4 -9 -11.2 -8.2 -8.6C-7.6 -6.6 -5.6 -5.6 -3.4 -5.8Z' }, tail);
  el('path', { class: 'lit', d: 'M-13.6 -9C-14.4 -14.6 -11.6 -19 -7.4 -19.6' }, tail);
  el('path', { class: 'tail-sheen', d: 'M-11.6 -10.4C-12.4 -14.6 -10.4 -17.8 -7.6 -18.2' }, tail);
  const legB = el('ellipse', { class: 'foot', cx: '-1.6', cy: '-0.5', rx: '2.8', ry: '0.72' }, pose);
  el('ellipse', { class: 'fur shade', cx: '-2', cy: '-3.4', rx: '3.4', ry: '3.1' }, pose);
  el('path', { class: 'fur', d: 'M-5 -2C-6.2 -5.4 -4.4 -9.4 -0.4 -10C3 -10.4 5.6 -8.8 6.2 -6C6.6 -3.6 5.4 -1 3 -0.4C0.4 0.2 -3.8 0.4 -5 -2Z' }, pose);
  el('path', { class: 'belly', d: 'M1 -0.9C3.6 -1 5.4 -3 5.4 -5.6C4 -4 2.4 -2.4 1 -0.9Z' }, pose);
  const legF = el('path', { class: 'foot', d: 'M3.6 -0.2L4 -2.6L5.4 -2.4L5.2 -0.2Z' }, pose);
  el('path', { class: 'lit', d: 'M-4.6 -6C-3.6 -8.8 -0.8 -10 2 -9.8' }, pose);
  const head = el('g', {}, pose);
  el('path', { class: 'fur', d: 'M3.6 -9.6C4 -12.6 7.6 -13.8 9.8 -11.8C11.2 -10.6 11.6 -8.8 10.6 -7.8C9.4 -6.6 6.4 -6.4 4.8 -7.2C3.8 -7.7 3.5 -8.6 3.6 -9.6Z' }, head);
  el('path', { class: 'fur', d: 'M5 -12L5.5 -15.6L7.3 -12.5Z' }, head);
  el('path', { class: 'lit', d: 'M4.4 -11.2C5.6 -12.9 7.9 -13.1 9.4 -12' }, head);
  el('circle', { class: 'eye', cx: '8.2', cy: '-10.3', r: '0.78' }, head);
  el('circle', { class: 'glint', cx: '8.48', cy: '-10.6', r: '0.28' }, head);
  el('circle', { class: 'nose', cx: '10.9', cy: '-8.7', r: '0.45' }, head);
  return { g, pose, tail, legB, legF, head };
}

function drawOwl(layer) {
  const g = el('g', { class: 'critter owl', visibility: 'hidden' }, layer);
  const body = el('g', {}, g);
  const WING = 'M-5.2 -13.6C-9 -17.8 -15.6 -19.6 -21.4 -16.8C-22.8 -16.1 -22.6 -14.7 -21.4 -14.5C-20.6 -12.9 -19 -12.7 -18 -13.3C-17 -11.7 -15.2 -11.5 -14.2 -12.3C-13 -10.7 -11 -10.7 -10 -11.7C-8.8 -10.1 -6.8 -9.9 -5.6 -10.7Z';
  const wingL = el('g', { visibility: 'hidden' }, body);
  el('path', { class: 'wing-open', d: WING }, wingL);
  el('path', { class: 'wing-covert', d: 'M-6.4 -12.6C-10 -15.4 -14.6 -16.4 -18.6 -15.4' }, wingL);
  const wingR = el('g', { visibility: 'hidden' }, body);
  el('path', { class: 'wing-open', d: WING, transform: 'scale(-1 1)' }, wingR);
  el('path', { class: 'wing-covert', d: 'M-6.4 -12.6C-10 -15.4 -14.6 -16.4 -18.6 -15.4', transform: 'scale(-1 1)' }, wingR);
  el('path', { class: 'fur', d: 'M0 -20C5.8 -20 8.2 -15 7.8 -9.4C7.4 -3.8 4.2 -0.6 0 -0.6C-4.2 -0.6 -7.4 -3.8 -7.8 -9.4C-8.2 -15 -5.8 -20 0 -20Z' }, body);
  const folded = el('g', {}, body);
  el('path', { class: 'fur shade', d: 'M-7.6 -12.4C-9.2 -8.4 -8.4 -3.4 -5.2 -0.9C-6.4 -4.8 -6.4 -8.8 -5 -12.6Z' }, folded);
  el('path', { class: 'fur shade', d: 'M7.6 -12.4C9.2 -8.4 8.4 -3.4 5.2 -0.9C6.4 -4.8 6.4 -8.8 5 -12.6Z' }, folded);
  el('path', { class: 'breast', d: 'M0 -12C3.6 -12 5 -8.4 4.6 -5.6C4.2 -2.8 2.4 -1.4 0 -1.4C-2.4 -1.4 -4.2 -2.8 -4.6 -5.6C-5 -8.4 -3.6 -12 0 -12Z' }, body);
  el('path', { class: 'chevrons', d: 'M-2.6 -8.4l1 .9l1 -.9M.6 -8.4l1 .9l1 -.9M-1 -5.8l1 .9l1 -.9M-2.6 -3.4l1 .8l1 -.8M.6 -3.4l1 .8l1 -.8' }, body);
  el('path', { class: 'lit', d: 'M-6.6 -16.2C-8.2 -12 -7.8 -6 -5 -2.4' }, body);
  const feet = el('path', { class: 'talons', d: 'M-3.2 0L-2.6 -1.3L-1.9 0ZM-2 0L-1.6 -1.2L-1 0ZM1 0L1.6 -1.2L2 0ZM1.9 0L2.6 -1.3L3.2 0Z' }, body);
  const head = el('g', {}, body);
  el('path', { class: 'fur', d: 'M-5.4 -18.2L-6.6 -22.6L-3.2 -19.4ZM5.4 -18.2L6.6 -22.6L3.2 -19.4Z' }, head);
  el('circle', { class: 'disc', cx: '-2.6', cy: '-14.6', r: '3.5' }, head);
  el('circle', { class: 'disc', cx: '2.6', cy: '-14.6', r: '3.5' }, head);
  el('path', { class: 'brow', d: 'M-5.6 -17.3Q0 -14.2 5.6 -17.3' }, head);
  const eyes = el('g', {}, head);
  el('circle', { class: 'iris', cx: '-2.6', cy: '-14.6', r: '2.1' }, eyes);
  el('circle', { class: 'iris', cx: '2.6', cy: '-14.6', r: '2.1' }, eyes);
  const pupils = el('g', {}, eyes);
  el('circle', { class: 'eye', cx: '-2.6', cy: '-14.6', r: '1.05' }, pupils);
  el('circle', { class: 'eye', cx: '2.6', cy: '-14.6', r: '1.05' }, pupils);
  el('circle', { class: 'glint', cx: '-2.2', cy: '-15.1', r: '0.38' }, pupils);
  el('circle', { class: 'glint', cx: '3', cy: '-15.1', r: '0.38' }, pupils);
  const lidL = el('ellipse', { class: 'lid', cx: '-2.6', cy: '-14.6', rx: '2.35', ry: '2.35' }, eyes);
  const lidR = el('ellipse', { class: 'lid', cx: '2.6', cy: '-14.6', rx: '2.35', ry: '2.35' }, eyes);
  el('path', { class: 'beak', d: 'M-0.85 -13.4L0 -11.1L0.85 -13.4Z' }, head);
  return { g, body, head, eyes, pupils, lidL, lidR, wingL, wingR, folded, feet };
}

// ---------- behaviours ----------

export function createCritters(layer, defs, world) {
  const ff = el('radialGradient', { id: 'kx-firefly' }, defs);
  el('stop', { offset: '0', 'stop-color': '#ffe9a3', 'stop-opacity': '0.95' }, ff);
  el('stop', { offset: '0.18', 'stop-color': '#ffd779', 'stop-opacity': '0.5' }, ff);
  el('stop', { offset: '0.5', 'stop-color': '#f2c25c', 'stop-opacity': '0.12' }, ff);
  el('stop', { offset: '1', 'stop-color': '#f2c25c', 'stop-opacity': '0' }, ff);

  const W = () => world.width();
  const ground = (x) => world.groundY(x);
  const show = (s, on) => s.g.setAttribute('visibility', on ? 'visible' : 'hidden');
  let mood = 'idle';

  function Mouse() {
    const s = drawMouse(layer);
    let state = 'away';
    let timer = rand(4.5, 7.5);
    let x = -30;
    let dir = 1;
    let speed = 0;
    let target = 0;
    let phase = 0;
    let left = 0;
    let rear = 0;
    let glance = 0;

    function spawn() {
      dir = chance(0.5) ? 1 : -1;
      x = dir > 0 ? -28 : W() + 28;
      state = 'run';
      target = rand(95, 140);
      speed = target * 0.5;
      left = rand(90, 280);
      show(s, true);
    }

    function next() {
      const r = Math.random();
      if (r < 0.48) {
        state = 'run';
        target = rand(85, 150);
        left = rand(50, 240);
        if (chance(0.22)) dir *= -1;
      } else if (r < 0.8) {
        state = 'sniff';
        timer = rand(0.6, 1.7);
      } else {
        state = 'rear';
        timer = rand(1.3, 2.4);
        rear = 0;
        glance = rand(0.5, 1);
      }
    }

    function pose(px) {
      x = px;
      dir = -1;
      state = 'still';
      show(s, true);
      setT(s.g, x, ground(x) + 0.5, 0, dir, 1);
    }

    return {
      get x() { return x; },
      get active() { return state !== 'away'; },
      pose,
      update(dt, t) {
        if (state === 'away') {
          timer -= dt;
          if (timer <= 0) spawn();
          return;
        }
        if (state === 'still') return;
        let bob = 0;
        let head = 0;
        let leg = 0;
        if (state === 'run' || state === 'flee') {
          speed += (target - speed) * Math.min(1, dt * 7);
          x += dir * speed * dt;
          phase += dt * speed * 0.55;
          left -= speed * dt;
          bob = Math.abs(Math.sin(phase)) * 0.9;
          leg = Math.sin(phase);
          if (state === 'run' && left <= 0) {
            speed = 0;
            next();
          }
          if (x < -44 || x > W() + 44) {
            state = 'away';
            timer = rand(8, 20);
            show(s, false);
            return;
          }
        } else if (state === 'sniff') {
          timer -= dt;
          phase += dt * 24;
          head = Math.sin(phase) * 3.5 + Math.sin(phase * 0.31) * 6;
          if (timer <= 0) next();
        } else if (state === 'rear') {
          timer -= dt;
          rear = Math.min(1, rear + dt * 5);
          glance -= dt;
          if (glance <= 0 && glance > -dt * 1.5) dir *= -1;
          head = Math.sin(t * 7) * 3;
          if (timer <= 0) {
            rear = 0;
            next();
          }
        }
        s.footB.setAttribute('transform', `translate(${r2(leg * 1.5)} 0)`);
        s.footF.setAttribute('transform', `translate(${r2(-leg * 1.5)} 0)`);
        around(s.head, 3.6, -5, head);
        around(s.tail, -9.2, -2.6, Math.sin(t * 4 + 1) * 5 + (state === 'run' || state === 'flee' ? -5 : 0));
        if (state === 'rear') around(s.pose, -5, 0, -32 * ease.outBack(rear));
        else s.pose.removeAttribute('transform');
        setT(s.g, x, ground(x) + 0.5 - bob, 0, dir, 1);
      },
      flee(fromX) {
        if (state === 'away' || state === 'still') return;
        state = 'flee';
        dir = x < fromX ? -1 : 1;
        target = 290;
        left = Infinity;
      },
      summon() {
        if (state === 'away') timer = Math.min(timer, rand(0.3, 1.2));
      },
    };
  }

  function Rabbit() {
    const s = drawRabbit(layer);
    let state = 'away';
    let timer = rand(12, 20);
    let x = -30;
    let dir = 1;
    let dest = 0;
    let mode = 'in';
    let hop = null;
    let squash = 0;
    let pause = 0;
    let nibble = 0;
    let nibbleIn = 0;
    let twitch = 0;
    let twitchIn = 0;

    function chooseDest() {
      const [b0, b1] = world.blocks();
      for (let i = 0; i < 6; i++) {
        const d = rand(W() * 0.06, W() * 0.94);
        if (d < b0 - 30 || d > b1 + 30) return d;
      }
      return b1 + 50;
    }

    function spawn() {
      dir = chance(0.5) ? 1 : -1;
      x = dir > 0 ? -26 : W() + 26;
      dest = chooseDest();
      mode = 'in';
      state = 'hopping';
      pause = 0;
      show(s, true);
    }

    function startHop() {
      const flee = mode === 'flee';
      const dist = rand(15, 21) * (flee ? 1.45 : 1);
      hop = { x0: x, x1: x + dir * dist, t: 0, dur: flee ? 0.32 : rand(0.38, 0.46), h: rand(7, 10) * (flee ? 1.2 : 1) };
    }

    function sit(px) {
      x = px;
      state = 'sitting';
      timer = rand(6, 12);
      nibbleIn = rand(0.6, 1.6);
      twitchIn = rand(1, 3);
    }

    return {
      get x() { return x; },
      get active() { return state !== 'away'; },
      pose(px) {
        show(s, true);
        sit(px);
        dir = 1;
        setT(s.g, x, ground(x) + 0.4, 0, dir, 1);
        state = 'still';
      },
      update(dt) {
        if (state === 'away') {
          timer -= dt;
          if (timer <= 0) spawn();
          return;
        }
        if (state === 'still') return;
        let y = ground(x) + 0.4;
        let rot = 0;
        let sx = 1;
        let sy = 1;
        let earRot = 0;
        let headRot = 0;
        if (state === 'hopping') {
          if (!hop) {
            pause -= dt;
            if (pause <= 0) startHop();
          }
          if (hop) {
            hop.t += dt;
            const p = Math.min(1, hop.t / hop.dur);
            x = lerp(hop.x0, hop.x1, p);
            const arc = Math.sin(p * Math.PI);
            y = ground(x) + 0.4 - arc * hop.h;
            rot = lerp(-15, 13, p);
            sx = 1 + arc * 0.1;
            sy = 1 - arc * 0.07;
            earRot = -24 * arc;
            if (p >= 1) {
              hop = null;
              squash = 0.14;
              pause = mode === 'flee' ? 0.04 : rand(0.1, 0.42);
              if (mode === 'in' && (dir > 0 ? x >= dest : x <= dest)) sit(x);
              else if (x < -40 || x > W() + 40) {
                state = 'away';
                timer = rand(16, 34);
                show(s, false);
                return;
              }
            }
          }
        } else if (state === 'sitting') {
          timer -= dt;
          nibbleIn -= dt;
          twitchIn -= dt;
          if (nibbleIn <= 0) {
            nibble = 0.75;
            nibbleIn = rand(1.6, 3.4);
            if (chance(0.25)) dir *= -1;
          }
          if (nibble > 0) {
            nibble -= dt;
            headRot = Math.max(0, Math.sin((0.75 - nibble) * Math.PI * 4)) * 12;
          }
          if (twitchIn <= 0) {
            twitch = 0.32;
            twitchIn = rand(1.2, 3.6);
          }
          if (twitch > 0) {
            twitch -= dt;
            around(s.earF, 8.2, -18.6, Math.sin((0.32 - twitch) * Math.PI * 6) * 9);
          } else s.earF.removeAttribute('transform');
          if (timer <= 0) {
            mode = 'out';
            dir = x < W() / 2 ? -1 : 1;
            state = 'hopping';
            pause = 0.2;
          }
        }
        if (squash > 0) {
          squash -= dt;
          const k = squash / 0.14;
          sx *= 1 + 0.12 * k;
          sy *= 1 - 0.13 * k;
        }
        around(s.ears, 7, -18, earRot);
        around(s.head, 6, -12, headRot);
        if (rot || sx !== 1 || sy !== 1) around(s.pose, 0, -6, rot, sx, sy);
        else s.pose.removeAttribute('transform');
        setT(s.g, x, y, 0, dir, 1);
      },
      flee(fromX) {
        if (state === 'away' || state === 'still') return;
        mode = 'flee';
        dir = x < fromX ? -1 : 1;
        state = 'hopping';
        squash = 0.14;
        pause = 0.08;
      },
      summon() {
        if (state === 'away') timer = Math.min(timer, rand(0.4, 1.4));
      },
    };
  }

  function Squirrel() {
    const s = drawSquirrel(layer);
    let state = 'away';
    let timer = rand(9, 15);
    let x = 0;
    let dir = 1;
    let speed = 0;
    let phase = 0;
    let route = null;
    let dist = 0;
    let total = 0;
    let flip = 1;
    let flick = 0;
    let flickIn = 0;
    let frozen = 0;

    function buildRoute() {
      const pts = world.tree.routeLocal;
      const d = [0];
      for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      route = { pts, d };
      total = d[d.length - 1];
    }

    function at(distance) {
      const { pts, d } = route;
      let i = 1;
      while (i < d.length - 1 && d[i] < distance) i++;
      const t = clamp((distance - d[i - 1]) / (d[i] - d[i - 1] || 1), 0, 1);
      const a = world.tree.toWorld(pts[i - 1]);
      const b = world.tree.toWorld(pts[i]);
      return { x: lerp(a[0], b[0], t), y: lerp(a[1], b[1], t), dx: b[0] - a[0], dy: b[1] - a[1] };
    }

    function spawn() {
      const fromLeft = chance(0.5);
      x = fromLeft ? -26 : W() + 26;
      dir = world.treeX() > x ? 1 : -1;
      speed = rand(105, 135);
      state = 'toTree';
      show(s, true);
    }

    function orient(dx, dy) {
      if (dx > 0.12) flip = 1;
      else if (dx < -0.12) flip = -1;
      return flip > 0 ? Math.atan2(dy, dx) * (180 / Math.PI) : Math.atan2(-dy, -dx) * (180 / Math.PI);
    }

    return {
      get x() { return x; },
      get active() { return state !== 'away'; },
      pose() {
        buildRoute();
        dist = total;
        state = 'still';
        show(s, true);
        const p = at(total);
        const lp = route.pts[route.pts.length - 1];
        around(s.pose, 0, 0, -24);
        around(s.tail, -4, -4, 26);
        setT(s.g, p.x, p.y, 0, lp[0] >= 0 ? 1 : -1, 0.92);
      },
      update(dt, t) {
        if (state === 'away') {
          timer -= dt;
          if (timer <= 0) spawn();
          return;
        }
        if (state === 'still') return;
        phase += dt * 15;
        let px;
        let py;
        let rot = 0;
        let tailRot = Math.sin(t * 2.6) * 5;
        let poseRot = 0;
        let leg = Math.sin(phase);
        if (state === 'toTree' || state === 'leave') {
          x += dir * speed * dt;
          const gait = Math.sin(phase * 0.55);
          const bob = Math.abs(gait) * 3.4;
          rot = Math.sin(phase * 0.55 + 0.7) * 9;
          tailRot = gait * 14;
          flip = dir;
          px = x;
          py = ground(x) + 0.5 - bob;
          if (state === 'toTree' && (dir > 0 ? x >= world.treeX() : x <= world.treeX())) {
            buildRoute();
            dist = 0;
            state = 'climb';
          } else if (state === 'leave' && (x < -40 || x > W() + 40)) {
            state = 'away';
            timer = rand(18, 36);
            show(s, false);
            return;
          }
        } else {
          if (state === 'climb') {
            dist += 46 * dt;
            if (dist >= total) {
              dist = total;
              state = 'sit';
              timer = rand(3, 7);
              flickIn = rand(0.5, 1.5);
            }
          } else if (state === 'descend') {
            dist -= 62 * dt;
            if (dist <= 0) {
              dist = 0;
              state = 'leave';
              dir = chance(0.5) ? -1 : 1;
              speed = rand(115, 150);
              x = world.treeX();
            }
          } else if (state === 'sit') {
            timer -= dt;
            leg = 0;
            flickIn -= dt;
            if (flickIn <= 0) {
              flick = 0.45;
              flickIn = rand(1, 2.6);
            }
            if (flick > 0) flick -= dt;
            tailRot = 26 + (flick > 0 ? Math.sin((0.45 - flick) * Math.PI * 5) * 16 : 0);
            poseRot = -24;
            if (frozen > 0) frozen -= dt;
            else if (timer <= 0) state = 'descend';
          }
          const p = at(Math.max(0.01, dist));
          px = p.x;
          py = p.y;
          if (state === 'sit') {
            const lp = route.pts[route.pts.length - 1];
            flip = lp[0] >= 0 ? 1 : -1;
          } else {
            const going = state === 'descend' ? -1 : 1;
            rot = orient(p.dx * going, p.dy * going);
          }
        }
        s.legB.setAttribute('transform', `translate(${r2(leg * 1.4)} 0)`);
        s.legF.setAttribute('transform', `translate(${r2(-leg * 1.4)} 0)`);
        around(s.tail, -4, -4, tailRot);
        if (poseRot) around(s.pose, 0, 0, poseRot);
        else s.pose.removeAttribute('transform');
        around(s.head, 5, -8.5, state === 'sit' ? Math.sin(t * 3.1) * 6 : 0);
        setT(s.g, px, py, rot, flip, 0.92);
      },
      flee(fromX) {
        if (state === 'toTree' || state === 'leave') {
          state = 'leave';
          speed = 280;
          dir = x < fromX ? -1 : 1;
        } else if (state === 'sit') {
          frozen = 3;
          timer = Math.max(timer, 3.5);
          flick = 0.45;
        }
      },
      summon() {
        if (state === 'away') timer = Math.min(timer, rand(0.5, 1.5));
      },
    };
  }

  function Owl() {
    const s = drawOwl(layer);
    let state = 'away';
    let timer = 6.5;
    let from = null;
    let to = null;
    let t = 0;
    let dur = 2.4;
    let blinkIn = rand(2, 5);
    let blink = -1;
    let lookIn = rand(2, 5);
    let look = [0, 0];
    let lookTo = [0, 0];
    let tilt = 0;
    let tiltTo = 0;
    let widen = 0;
    let ruffle = 0;
    let stay = 0;
    let bob = 0;

    function perch() {
      const p = world.tree.owlPerch();
      return { x: p[0], y: p[1] };
    }

    function flyIn() {
      const p = perch();
      const side = chance(0.5) ? -1 : 1;
      from = { x: p.x + side * rand(120, 200), y: -26 };
      t = 0;
      dur = 2.6;
      state = 'flyIn';
      s.wingL.setAttribute('visibility', 'visible');
      s.wingR.setAttribute('visibility', 'visible');
      s.folded.setAttribute('visibility', 'hidden');
      show(s, true);
    }

    function land() {
      state = 'perched';
      stay = rand(60, 120);
      s.wingL.setAttribute('visibility', 'hidden');
      s.wingR.setAttribute('visibility', 'hidden');
      s.folded.removeAttribute('visibility');
      s.wingL.removeAttribute('transform');
      s.wingR.removeAttribute('transform');
    }

    function flyOut() {
      const p = perch();
      from = p;
      const side = chance(0.5) ? -1 : 1;
      to = { x: p.x + side * rand(140, 220), y: -30 };
      t = 0;
      dur = 2.2;
      state = 'flyOut';
      s.wingL.setAttribute('visibility', 'visible');
      s.wingR.setAttribute('visibility', 'visible');
      s.folded.setAttribute('visibility', 'hidden');
    }

    function lids(k) {
      const v = Math.max(0.001, k);
      around(s.lidL, -2.6, -16.95, 0, 1, v);
      around(s.lidR, 2.6, -16.95, 0, 1, v);
    }
    lids(0);

    return {
      get active() { return state !== 'away'; },
      pose() {
        show(s, true);
        land();
        state = 'still';
        const p = perch();
        setT(s.g, p.x, p.y, 0, 1, 1);
      },
      update(dt, time) {
        if (state === 'away') {
          if (!world.tree.grown) return;
          timer -= dt;
          if (timer <= 0) flyIn();
          return;
        }
        if (state === 'still') return;
        let x;
        let y;
        let rot = 0;
        if (state === 'flyIn' || state === 'flyOut') {
          t = Math.min(1, t + dt / dur);
          const end = state === 'flyIn' ? perch() : to;
          const c = { x: lerp(from.x, end.x, 0.35), y: Math.min(from.y, end.y) + (state === 'flyIn' ? 70 : -10) };
          const e = ease.inOutSine(t);
          const u = 1 - e;
          x = u * u * from.x + 2 * u * e * c.x + e * e * end.x;
          y = u * u * from.y + 2 * u * e * c.y + e * e * end.y;
          const glide = state === 'flyIn' && t > 0.42 && t < 0.78;
          const flare = state === 'flyIn' && t > 0.86;
          const flap = flare ? -48 : glide ? -6 : Math.sin(time * 9) * 34 - 4;
          around(s.wingL, -5.4, -11.2, -flap);
          around(s.wingR, 5.4, -11.2, flap);
          rot = (end.x - from.x > 0 ? 1 : -1) * (flare ? -4 : 8);
          if (t >= 1) {
            if (state === 'flyIn') land();
            else {
              state = 'away';
              timer = rand(40, 80);
              show(s, false);
              return;
            }
          }
        } else {
          const p = perch();
          x = p.x;
          y = p.y;
          stay -= dt;
          if (stay <= 0 && mood !== 'thinking') {
            flyOut();
            return;
          }
          // blinking
          blinkIn -= dt;
          if (blinkIn <= 0 && blink < 0) {
            blink = 0;
            blinkIn = chance(0.25) ? 0.32 : rand(2.4, 6);
          }
          if (blink >= 0) {
            blink += dt;
            const k = blink < 0.07 ? blink / 0.07 : blink < 0.13 ? 1 : 1 - (blink - 0.13) / 0.1;
            lids(clamp(k, 0, 1));
            if (blink > 0.23) {
              blink = -1;
              lids(0);
            }
          }
          // looking about, or watching the chat while Knox thinks
          lookIn -= dt;
          if (mood === 'thinking') {
            lookTo = [-0.55, 0.75];
            tiltTo = -9;
          } else if (lookIn <= 0) {
            lookIn = rand(2.5, 7);
            lookTo = chance(0.3) ? [0, 0] : [rand(-0.9, 0.9), rand(-0.35, 0.5)];
            tiltTo = chance(0.4) ? rand(-11, 11) : 0;
          }
          look[0] += (lookTo[0] - look[0]) * Math.min(1, dt * 7);
          look[1] += (lookTo[1] - look[1]) * Math.min(1, dt * 7);
          tilt += (tiltTo - tilt) * Math.min(1, dt * 5);
          if (widen > 0) widen -= dt;
          if (ruffle > 0) ruffle -= dt;
          else if (chance(dt / 22)) ruffle = 0.5;
          if (bob > 0) bob -= dt;
        }
        s.pupils.setAttribute('transform', `translate(${r2(look[0])} ${r2(look[1])})`);
        const wk = widen > 0 ? 1 + 0.22 * Math.min(1, widen / 0.4) : 1;
        if (wk !== 1) around(s.eyes, 0, -14.6, 0, wk);
        else s.eyes.removeAttribute('transform');
        const hb = bob > 0 ? Math.sin((1.2 - bob) * Math.PI * 5) * 1.2 : 0;
        s.head.setAttribute('transform', `translate(0 ${r2(hb)}) rotate(${r2(tilt)} 0 -14)`);
        const rk = ruffle > 0 ? 1 + Math.sin((0.5 - ruffle) * Math.PI * 2) * 0.06 : 1;
        if (rk !== 1) around(s.body, 0, -10, Math.sin(ruffle * 40) * 2, rk);
        else s.body.removeAttribute('transform');
        setT(s.g, x, y, rot, 1, 1);
      },
      startle() {
        if (state === 'perched') {
          widen = 1.4;
          ruffle = 0.5;
          lookTo = [0, 0.2];
          lookIn = 1.6;
        }
      },
      celebrate() {
        if (state === 'away') timer = 0.2;
        if (state === 'perched') {
          bob = 1.2;
          blinkIn = 0;
        }
      },
    };
  }

  function Fireflies(n) {
    const g = el('g', { class: 'fireflies' }, layer);
    const flies = Array.from({ length: n }, (_, i) => {
      const f = el('g', {}, g);
      el('circle', { r: '4.6', fill: 'url(#kx-firefly)' }, f);
      el('circle', { r: '0.62', class: 'firefly-core' }, f);
      return { node: f, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, retarget: 0, phase: rand(0, 6.3), rate: rand(1.1, 2.3), i, placed: false };
    });
    let fade = 0;
    let swirl = 0;

    function anchor(fl) {
      const tx = world.treeX();
      if (chance(0.62)) {
        fl.ax = tx + rand(-80, 80);
        fl.ay = ground(tx) - rand(24, Math.min(110, world.tree.height));
      } else {
        fl.ax = rand(W() * 0.04, W() * 0.96);
        fl.ay = ground(fl.ax) - rand(5, 34);
      }
      fl.retarget = rand(3, 8);
    }

    return {
      pose() {
        for (const fl of flies) {
          anchor(fl);
          fl.node.setAttribute('transform', `translate(${r2(fl.ax)} ${r2(fl.ay)})`);
          fl.node.setAttribute('opacity', r2(rand(0.3, 0.8)));
        }
      },
      update(dt, t) {
        fade = Math.min(1, fade + dt * 0.35 * (t > 2.5 ? 1 : 0));
        g.setAttribute('opacity', r2(fade));
        if (swirl > 0) swirl -= dt;
        const busy = mood === 'thinking';
        const tx = world.treeX();
        const ty = ground(tx) - world.tree.height * 0.55;
        for (const fl of flies) {
          if (!fl.placed) {
            anchor(fl);
            fl.x = fl.ax;
            fl.y = fl.ay;
            fl.placed = true;
          }
          fl.retarget -= dt;
          if (fl.retarget <= 0) anchor(fl);
          let ax = fl.ax;
          let ay = fl.ay;
          if (swirl > 0) {
            const a = t * 1.7 + (fl.i / flies.length) * Math.PI * 2;
            ax = tx + Math.cos(a) * 64;
            ay = ty + Math.sin(a) * 32;
          } else if (busy) {
            ax = lerp(fl.ax, tx, 0.45);
            ay = lerp(fl.ay, ty, 0.35);
          }
          const pull = swirl > 0 ? 3.4 : busy ? 0.8 : 0.42;
          fl.vx += ((ax - fl.x) * pull + Math.sin(t * 1.3 + fl.phase) * 12) * dt;
          fl.vy += ((ay - fl.y) * pull + Math.cos(t * 1.1 + fl.phase) * 9) * dt;
          const damp = 0.33 ** dt;
          fl.vx *= damp;
          fl.vy *= damp;
          fl.x += fl.vx * dt;
          fl.y += fl.vy * dt;
          const blink = Math.max(0, Math.sin(t * (busy ? fl.rate * 2 : fl.rate) + fl.phase));
          const lit = busy || swirl > 0 ? 0.5 + 0.5 * blink : 0.08 + 0.92 * blink * blink;
          fl.node.setAttribute('transform', `translate(${r2(fl.x)} ${r2(fl.y)})`);
          fl.node.setAttribute('opacity', r2(lit));
        }
      },
      scatter(fromX) {
        for (const fl of flies) {
          const away = fl.x < fromX ? -1 : 1;
          fl.vx += away * rand(40, 120);
          fl.vy += rand(-70, 20);
        }
      },
      swirl() {
        swirl = 7;
      },
    };
  }

  const mouse = Mouse();
  const rabbit = Rabbit();
  const squirrel = Squirrel();
  const owl = Owl();
  const flies = Fireflies(9);
  const runners = [mouse, rabbit, squirrel];

  return {
    update(dt, t) {
      for (const c of runners) c.update(dt, t);
      owl.update(dt, t);
      flies.update(dt, t);
    },
    impact(x, near = 110) {
      for (const c of runners) if (c.active && Math.abs(c.x - x) < near) c.flee(x);
    },
    startle() {
      const mid = W() / 2;
      for (const c of runners) c.flee(c.x < mid ? W() : 0);
      owl.startle();
      flies.scatter(world.treeX());
    },
    celebrate() {
      for (const c of runners) c.summon();
      owl.celebrate();
      flies.swirl();
    },
    setMood(m) {
      mood = m;
    },
    pose() {
      const [, b1] = world.blocks();
      mouse.pose(b1 + 34);
      rabbit.pose(Math.max(b1 + 90, world.treeX() - 120));
      owl.pose();
      flies.pose();
    },
  };
}
