// Chats live in this browser only. Every access is guarded: storage can be missing,
// full, or blocked (private windows), and Knox should still work for the session.
const CHATS = 'knox.chats.v1';
const SOLVED = 'knox.solved.v1';
const SCENE = 'knox.scene.v1';
const MAX_CHATS = 60;

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export function loadChats() {
  try {
    const data = JSON.parse(localStorage.getItem(CHATS) || '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages)).map((c) => {
      for (const m of c.messages) {
        if (m.role !== 'assistant') continue;
        for (const v of m.variants || []) if (v.status === 'streaming') v.status = 'stopped';
      }
      return c;
    });
  } catch {
    return [];
  }
}

export function saveChats(chats, keepId) {
  const list = chats.slice(0, MAX_CHATS);
  try {
    localStorage.setItem(CHATS, JSON.stringify(list));
    return;
  } catch {}
  // Over quota: drop stored reasoning from every chat but the open one and retry.
  try {
    const slim = list.map((c) => c.id === keepId ? c : {
      ...c,
      messages: c.messages.map((m) => m.role !== 'assistant' ? m : {
        ...m,
        variants: m.variants.map((v) => ({ ...v, reasoning: '' })),
      }),
    });
    localStorage.setItem(CHATS, JSON.stringify(slim));
  } catch {}
}

export function loadSolved() {
  try {
    return JSON.parse(localStorage.getItem(SOLVED) || 'null');
  } catch {
    return null;
  }
}

export function saveSolved(flag) {
  try {
    localStorage.setItem(SOLVED, JSON.stringify({ flag, at: Date.now() }));
  } catch {}
}

export function loadScenePref() {
  try {
    const v = localStorage.getItem(SCENE);
    return v === 'collapsed' ? true : v === 'open' ? false : null;
  } catch {
    return null;
  }
}

export function saveScenePref(collapsed) {
  try {
    localStorage.setItem(SCENE, collapsed ? 'collapsed' : 'open');
  } catch {}
}
