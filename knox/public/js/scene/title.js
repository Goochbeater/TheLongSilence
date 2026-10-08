// KNOX in carved wooden toy blocks. Each block is a small 3D box (front, top and right
// faces) with procedural wood grain, a carved letter and a contact shadow, and drops in
// with a gravity fall, an impact squash, a bounce and a rocking settle.

const LETTERS = ['K', 'N', 'O', 'X'];
const REST = [-3.2, 1.8, -1.1, 4.4];
const TONES = [
  ['#c48e57', '#a87442', '#875833'],
  ['#bb8650', '#9f6b3a', '#7f512d'],
  ['#c89460', '#ad7a47', '#8b5d35'],
  ['#bf8a53', '#a3703e', '#835530'],
];
const FALL = 1.3; // seconds, must match .kb-body animation in scene.css
const STAGGER = 0.16;
const IMPACT = 0.46; // keyframe of first ground contact

export function createTitle({ onImpact, onBump } = {}) {
  const node = document.createElement('div');
  node.className = 'knox-title';
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', 'Knox');

  const blocks = LETTERS.map((ch, i) => {
    const kb = document.createElement('span');
    kb.className = 'kb';
    kb.setAttribute('aria-hidden', 'true');
    kb.style.setProperty('--i', i);
    kb.style.setProperty('--r1', `${REST[i]}deg`);
    kb.style.setProperty('--hi', TONES[i][0]);
    kb.style.setProperty('--mid', TONES[i][1]);
    kb.style.setProperty('--lo', TONES[i][2]);
    kb.style.setProperty('--grain-x', `${Math.round(Math.random() * 120)}px`);
    kb.style.setProperty('--grain-y', `${Math.round(Math.random() * 120)}px`);
    kb.innerHTML = `<span class="kb-shadow"></span><span class="kb-body"><span class="kb-top"></span><span class="kb-side"></span><span class="kb-face"><span class="kb-glyph">${ch}</span></span></span>`;
    node.append(kb);
    return kb;
  });

  const timers = [];
  let size = 50;

  function dust(kb, strength = 1) {
    const w = kb.offsetWidth;
    const left = kb.offsetLeft;
    for (let k = 0; k < 9; k++) {
      const side = k % 2 ? 1 : -1;
      const p = document.createElement('span');
      p.className = 'kb-dust';
      const s = size * (0.16 + Math.random() * 0.16) * strength;
      p.style.width = `${s}px`;
      p.style.height = `${s}px`;
      p.style.left = `${left + w * (side < 0 ? 0.1 : 0.9) - s / 2}px`;
      p.style.setProperty('--dx', `${side * size * (0.25 + Math.random() * 0.55) * strength}px`);
      p.style.setProperty('--dy', `${-size * (0.04 + Math.random() * 0.22) * strength}px`);
      p.style.animationDelay = `${Math.random() * 0.06}s`;
      node.append(p);
      setTimeout(() => p.remove(), 1100);
    }
  }

  function restart(cls) {
    node.classList.remove('drop', 'hop');
    for (const kb of blocks) kb.classList.remove('bump');
    void node.offsetWidth;
    if (cls) node.classList.add(cls);
  }

  node.addEventListener('click', (e) => {
    const kb = e.target.closest('.kb');
    if (!kb || node.classList.contains('dropping')) return;
    node.classList.remove('hop');
    kb.classList.remove('bump');
    void kb.offsetWidth;
    kb.classList.add('bump');
    const i = blocks.indexOf(kb);
    setTimeout(() => {
      dust(kb, 0.6);
      onImpact?.(i, true);
    }, 520);
    onBump?.(i);
  });

  return {
    node,
    blocks,
    layout({ block, left, bottom }) {
      size = block;
      node.style.setProperty('--bs', `${block}px`);
      node.style.left = `${left}px`;
      node.style.bottom = `${bottom}px`;
    },
    width: () => node.offsetWidth,
    drop(fallPx) {
      timers.splice(0).forEach(clearTimeout);
      node.style.setProperty('--fall', `${-Math.round(fallPx)}px`);
      for (const kb of blocks) kb.style.setProperty('--r0', `${Math.round((Math.random() - 0.5) * 110)}deg`);
      restart('drop');
      node.classList.add('dropping');
      blocks.forEach((kb, i) => {
        timers.push(setTimeout(() => {
          dust(kb);
          onImpact?.(i, false);
        }, (0.22 + i * STAGGER + FALL * IMPACT) * 1000));
      });
      timers.push(setTimeout(() => node.classList.remove('dropping'), (0.22 + 3 * STAGGER + FALL) * 1000));
    },
    hop() {
      restart('hop');
    },
    rest() {
      timers.splice(0).forEach(clearTimeout);
      restart(null);
      node.classList.remove('dropping');
    },
  };
}
