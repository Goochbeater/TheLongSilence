import { streamChat, verifyGuess } from './api.js';
import { escapeHtml, renderAnswer, renderReasoning } from './render.js';
import { createScene } from './scene.js';
import { loadChats, loadScenePref, loadSolved, saveChats, saveScenePref, saveSolved, uid } from './store.js';

const ICONS = {
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/></svg>',
  regen: '<svg viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4.2h-4.2"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9.5l6 6 6-6"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M12 19V5.5M6.5 11L12 5.5 17.5 11"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="7.5" y="7.5" width="9" height="9" rx="1.8" fill="currentColor" stroke="none"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M4.5 7.5h15M4.5 12h15M4.5 16.5h9"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5L19 4M15.5 7.5l2.5 2.5M13 10l2 2"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  tree: '<svg viewBox="0 0 24 24"><path d="M12 20.5v-6.5"/><path d="M12 14c-3.6 0-6.2-2.3-6.2-5.4C5.8 5.5 8.6 3 12 3s6.2 2.5 6.2 5.6c0 3.1-2.6 5.4-6.2 5.4z"/><path d="M8.5 20.5h7"/></svg>',
};

const LOCKDOWN = /goo\s*ga\s*ga/i;
const WRONG = [
  'The lock doesn’t turn.',
  'Cold iron. Not that.',
  'The vault hums, unimpressed.',
  'The tumblers don’t stir.',
  'Knox doesn’t even look up.',
];
const PROMPTS = [
  ['A lighthouse of lost echoes', 'Tell me a story about a lighthouse keeper who collects lost echoes.'],
  ['The fox beneath the well', 'Write a fable about a fox who guards a library at the bottom of a well.'],
  ['What are you guarding?', 'What exactly are you protecting, Knox?'],
];
const touch = matchMedia('(hover: none)').matches;

const $ = (id) => document.getElementById(id);
const els = {
  app: $('app'),
  scene: $('scene'),
  toggleScene: $('toggle-scene'),
  messages: $('messages'),
  thread: $('thread'),
  composer: $('composer'),
  input: $('input'),
  send: $('send'),
  locked: $('locked'),
  lockedNew: $('locked-new'),
  jump: $('jump'),
  chatTitle: $('chat-title'),
  openDrawer: $('open-drawer'),
  closeDrawer: $('close-drawer'),
  drawer: $('drawer'),
  drawerNew: $('drawer-new'),
  chatList: $('chat-list'),
  scrim: $('scrim'),
  newChat: $('new-chat'),
  openVault: $('open-vault'),
  vault: $('vault'),
  vaultForm: $('vault-form'),
  vaultInput: $('vault-input'),
  vaultTry: $('vault-try'),
  vaultClose: $('vault-close'),
  vaultMsg: $('vault-msg'),
  vaultWin: $('vault-win'),
  vaultFlag: $('vault-flag'),
  vaultCopy: $('vault-copy'),
  toast: $('toast'),
  announcer: $('announcer'),
};

document.querySelectorAll('[data-icon]').forEach((n) => { n.innerHTML = ICONS[n.dataset.icon]; });
els.openDrawer.innerHTML = ICONS.menu;
els.closeDrawer.innerHTML = ICONS.close;
els.newChat.innerHTML = ICONS.plus;
els.vaultClose.innerHTML = ICONS.close;
els.vaultCopy.innerHTML = ICONS.copy;
els.jump.innerHTML = ICONS.arrowDown;
els.toggleScene.innerHTML = ICONS.tree;

const state = {
  chats: loadChats(),
  activeId: null,
  live: null, // { chatId, msgId, v, controller }
  editingId: null,
};
state.activeId = [...state.chats].sort((a, b) => b.updated - a.updated)[0]?.id ?? null;

const thinkOpen = new Map();
const scene = createScene(els.scene);

// ---------- scene collapse ----------
// Short viewports (phones in landscape) start collapsed; an explicit choice is remembered.

const shortViewport = matchMedia('(max-height: 560px)');

function applyScene(collapsed) {
  els.app.classList.toggle('scene-collapsed', collapsed);
  els.scene.setAttribute('aria-hidden', String(collapsed));
  els.toggleScene.setAttribute('aria-expanded', String(!collapsed));
  const label = collapsed ? 'Show the scene' : 'Hide the scene';
  els.toggleScene.setAttribute('aria-label', label);
  els.toggleScene.title = label;
  scene.setCollapsed?.(collapsed);
}

applyScene(loadScenePref() ?? shortViewport.matches);
shortViewport.addEventListener('change', (e) => {
  if (loadScenePref() == null) applyScene(e.matches);
});
els.toggleScene.addEventListener('click', () => {
  const collapsed = !els.app.classList.contains('scene-collapsed');
  saveScenePref(collapsed);
  applyScene(collapsed);
});

// ---------- helpers ----------

const activeChat = () => state.chats.find((c) => c.id === state.activeId) ?? null;
const variant = (m) => m.variants[m.vi];
const isLive = (m) => state.live?.msgId === m.id && state.live.v === variant(m);
const plain = (text) => text.replace(/<\/?(?:story|guardian_thinking|weaver_thinking|final_thinking)>/g, '').trim();

function titleFrom(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 48 ? `${t.slice(0, 47)}…` : t;
}

function secs(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function when(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = new Date(ts);
  return diff < 6 * 86_400_000
    ? d.toLocaleDateString(undefined, { weekday: 'short' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

let saveTimer;
function persist(now = false) {
  clearTimeout(saveTimer);
  const run = () => saveChats([...state.chats].sort((a, b) => b.updated - a.updated), state.activeId);
  if (now) run();
  else saveTimer = setTimeout(run, 250);
}

let toastTimer;
function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  toast('Copied');
}

function arm(btn) {
  if (btn.classList.contains('armed')) return true;
  btn.classList.add('armed');
  btn.title = 'Click again to delete';
  setTimeout(() => {
    btn.classList.remove('armed');
    btn.title = btn.getAttribute('aria-label') || '';
  }, 2500);
  return false;
}

const act = (name, label, icon, disabled = false) =>
  `<button type="button" class="act" data-act="${name}" aria-label="${label}" title="${label}"${disabled ? ' disabled' : ''}>${ICONS[icon]}</button>`;

// ---------- scrolling ----------

let stick = true;
els.thread.addEventListener('scroll', () => {
  const gap = els.thread.scrollHeight - els.thread.scrollTop - els.thread.clientHeight;
  stick = gap < 90;
  els.jump.hidden = stick;
}, { passive: true });

function followBottom() {
  if (stick) els.thread.scrollTop = els.thread.scrollHeight;
}

function toBottom() {
  stick = true;
  els.thread.scrollTop = els.thread.scrollHeight;
  els.jump.hidden = true;
}

els.jump.addEventListener('click', () => els.thread.scrollTo({ top: els.thread.scrollHeight, behavior: 'smooth' }));

// ---------- rendering ----------

function emptyState() {
  const chips = PROMPTS.map(([label, prompt]) =>
    `<button type="button" class="chip" data-prompt="${escapeHtml(prompt)}">${escapeHtml(label)}</button>`).join('');
  return `<div class="empty">
    <p class="empty-lede">Knox keeps one word locked away.</p>
    <p class="empty-sub">Ask it for a story. Or try to make it slip.</p>
    <div class="chips">${chips}</div>
  </div>`;
}

function renderThread() {
  const chat = activeChat();
  els.chatTitle.textContent = chat?.title || 'New chat';
  if (!chat || !chat.messages.length) {
    els.messages.innerHTML = emptyState();
    return;
  }
  const frag = document.createDocumentFragment();
  chat.messages.forEach((m, i) => frag.append(messageNode(chat, m, i === chat.messages.length - 1)));
  const last = chat.messages[chat.messages.length - 1];
  if (last.role === 'user' && !state.live && !chat.locked && state.editingId !== last.id) {
    const row = document.createElement('div');
    row.className = 'gen-row';
    row.innerHTML = '<button type="button" class="btn ghost" data-act="reply">Ask Knox to answer</button>';
    frag.append(row);
  }
  els.messages.replaceChildren(frag);
}

function messageNode(chat, m, isLast) {
  const node = document.createElement('article');
  node.className = `msg msg-${m.role}${isLast ? ' last' : ''}`;
  node.dataset.id = m.id;
  if (m.role === 'user') {
    if (state.editingId === m.id) {
      node.innerHTML = `<div class="edit-box"><textarea aria-label="Edit message"></textarea>
        <div class="edit-actions"><button type="button" class="btn ghost" data-act="cancel">Cancel</button><button type="button" class="btn" data-act="save">Save &amp; resend</button></div></div>`;
      node.querySelector('textarea').value = m.content;
      return node;
    }
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = m.content;
    node.append(bubble);
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    actions.innerHTML = act('copy', 'Copy', 'copy') + act('edit', 'Edit', 'edit', !!state.live || chat.locked) + act('delete', 'Delete', 'trash');
    node.append(actions);
    return node;
  }
  node.innerHTML = `
    <div class="think">
      <button type="button" class="think-toggle" aria-expanded="false"><span class="orb"></span><span class="think-label"></span><span class="think-time"></span><span class="chev">${ICONS.down}</span></button>
      <div class="think-body"><div class="think-scroll"><div class="think-text"></div></div></div>
    </div>
    <div class="answer"></div>
    <div class="extra"></div>
    <div class="msg-actions"></div>`;
  paintAssistant(node, chat, m, isLast);
  return node;
}

function paintAssistant(node, chat, m, isLast) {
  const v = variant(m);
  if (!v) return;
  const live = isLive(m);
  const thinking = live && v.thinkMs == null;
  const hasThought = !!v.reasoning;
  const ms = v.thinkMs ?? Date.now() - v.started;

  const think = node.querySelector('.think');
  const toggle = think.querySelector('.think-toggle');
  const key = `${m.id}:${m.vi}`;
  const open = hasThought && (thinkOpen.has(key) ? thinkOpen.get(key) : thinking);
  think.hidden = !live && !hasThought && v.status !== 'done';
  think.classList.toggle('live', thinking);
  think.classList.toggle('open', open);
  toggle.disabled = !hasThought;
  toggle.setAttribute('aria-expanded', String(open));
  think.querySelector('.think-label').textContent = thinking ? 'Deliberating' : 'Thought for';
  think.querySelector('.think-time').textContent = secs(ms);

  const text = think.querySelector('.think-text');
  if (node._rlen !== v.reasoning.length) {
    const atEnd = text.scrollHeight - text.scrollTop - text.clientHeight < 24;
    text.innerHTML = renderReasoning(v.reasoning);
    node._rlen = v.reasoning.length;
    if (atEnd) text.scrollTop = text.scrollHeight;
  }

  const answer = node.querySelector('.answer');
  const answerKey = `${v.content.length}:${live}:${v.content.slice(-24)}`;
  if (node._akey !== answerKey) {
    answer.innerHTML = renderAnswer(v.content, live);
    node._akey = answerKey;
  }
  answer.classList.toggle('streaming', live && !thinking);

  const notes = [];
  if (v.status === 'error') {
    const retry = isLast && !chat.locked && !state.live ? '<button type="button" class="btn ghost" data-act="regen">Retry</button>' : '';
    notes.push(`<div class="err"><span>${escapeHtml(v.error || 'Something went wrong.')}</span>${retry}</div>`);
  }
  if (v.status === 'stopped') notes.push('<p class="note">Stopped. Knox won’t remember this reply.</p>');
  if (v.status === 'done' && v.finish === 'length') notes.push('<p class="note">Knox ran out of breath here.</p>');
  if (v.status === 'done' && v.finish === 'error') notes.push('<p class="note">Knox was interrupted.</p>');
  if (v.notice) notes.push(`<p class="note">Knox ignored ${v.notice} earlier ${v.notice === 1 ? 'reply' : 'replies'} it couldn’t verify as its own.</p>`);
  const extra = notes.join('');
  const extraEl = node.querySelector('.extra');
  if (extraEl._html !== extra) {
    extraEl.innerHTML = extra;
    extraEl._html = extra;
  }

  const actions = node.querySelector('.msg-actions');
  let html = '';
  if (!live) {
    if (v.content) html += act('copy', 'Copy', 'copy');
    if (isLast) html += act('regen', 'Regenerate', 'regen', chat.locked || !!state.live);
    html += act('delete', 'Delete', 'trash');
    if (m.variants.length > 1) {
      html += `<span class="variants">${act('prev', 'Previous version', 'left', m.vi === 0 || !!state.live)}<span>${m.vi + 1}/${m.variants.length}</span>${act('next', 'Next version', 'right', m.vi === m.variants.length - 1 || !!state.live)}</span>`;
    }
  }
  if (actions._html !== html) {
    actions.innerHTML = html;
    actions._html = html;
  }
}

let patchQueued = false;
function schedulePatch() {
  if (patchQueued) return;
  patchQueued = true;
  requestAnimationFrame(() => {
    patchQueued = false;
    const live = state.live;
    if (!live || live.chatId !== state.activeId) return;
    const chat = activeChat();
    const m = chat?.messages.find((x) => x.id === live.msgId);
    const node = els.messages.querySelector(`[data-id="${CSS.escape(live.msgId)}"]`);
    if (!m || !node) return;
    paintAssistant(node, chat, m, m === chat.messages[chat.messages.length - 1]);
    followBottom();
  });
}

function updateComposer() {
  const chat = activeChat();
  const locked = !!chat?.locked;
  els.composer.hidden = locked;
  els.locked.hidden = !locked;
  const live = !!state.live;
  els.send.classList.toggle('stop', live);
  els.send.innerHTML = live ? ICONS.stop : ICONS.send;
  els.send.setAttribute('aria-label', live ? 'Stop' : 'Send');
  els.send.disabled = !live && !els.input.value.trim();
}

function autosize() {
  els.input.style.height = 'auto';
  els.input.style.height = `${Math.min(200, els.input.scrollHeight)}px`;
}

function renderDrawer() {
  const list = [...state.chats].sort((a, b) => b.updated - a.updated);
  if (!list.length) {
    els.chatList.innerHTML = '<li class="none">No chats yet.</li>';
    return;
  }
  els.chatList.innerHTML = list.map((c) => `
    <li class="chat-item${c.id === state.activeId ? ' active' : ''}" data-id="${escapeHtml(c.id)}">
      <button type="button" class="chat-open" data-act="open"><span class="t">${escapeHtml(c.title || 'Untitled')}</span><span class="d">${c.locked ? 'sealed · ' : ''}${when(c.updated)}</span></button>
      ${act('delete-chat', 'Delete chat', 'trash')}
    </li>`).join('');
}

function refresh({ bottom = false } = {}) {
  renderThread();
  updateComposer();
  renderDrawer();
  if (bottom) toBottom();
}

// ---------- generation ----------

function payloadFor(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else {
      const v = variant(m);
      if (v?.status === 'done' && v.sig) out.push({ role: 'assistant', content: v.content, sig: v.sig });
    }
  }
  return out;
}

function ward() {
  const node = state.live && els.messages.querySelector(`[data-id="${CSS.escape(state.live.msgId)}"] .answer`);
  if (node) {
    node.classList.remove('warded');
    void node.offsetWidth;
    node.classList.add('warded');
  }
  scene.startle();
}

function onStreamEvent(v, ev) {
  switch (ev.t) {
    case 'r':
      v.reasoning += ev.d;
      break;
    case 'phase':
      if (ev.p === 'answer' && v.thinkMs == null) v.thinkMs = Date.now() - v.started;
      break;
    case 'a':
      if (v.thinkMs == null) v.thinkMs = Date.now() - v.started;
      v.content += ev.d;
      break;
    case 'replace':
      v.content = ev.d;
      ward();
      break;
    case 'notice':
      if (ev.code === 'unverified') v.notice = ev.count;
      break;
    case 'done':
      v.content = ev.content || '';
      v.sig = ev.sig || null;
      v.finish = ev.finish || 'stop';
      if (v.content) v.status = 'done';
      else {
        v.status = 'error';
        v.error = ev.finish === 'length'
          ? 'Knox thought so long it ran out of words. Try regenerating.'
          : 'Knox stayed silent. Try regenerating.';
      }
      break;
    case 'error':
      v.status = 'error';
      v.error = ev.message;
      break;
    default:
      return;
  }
  schedulePatch();
}

async function generate(chat, m) {
  const history = payloadFor(chat.messages.slice(0, chat.messages.indexOf(m)));
  const v = { content: '', reasoning: '', sig: null, status: 'streaming', started: Date.now(), thinkMs: null, finish: null };
  m.variants.push(v);
  m.vi = m.variants.length - 1;
  const controller = new AbortController();
  state.live = { chatId: chat.id, msgId: m.id, v, controller };
  chat.updated = Date.now();
  refresh({ bottom: true });
  scene.setMood('thinking');
  const tick = setInterval(schedulePatch, 250);
  try {
    await streamChat(history, { signal: controller.signal, onEvent: (ev) => onStreamEvent(v, ev) });
    if (v.status === 'streaming') {
      v.status = 'error';
      v.error = 'The connection closed before Knox finished.';
    }
  } catch (err) {
    if (err.name === 'AbortError') v.status = 'stopped';
    else {
      v.status = 'error';
      v.error = err.message || 'Something went wrong.';
    }
  } finally {
    clearInterval(tick);
    if (v.thinkMs == null) v.thinkMs = Date.now() - v.started;
    state.live = null;
    scene.setMood('idle');
    if (v.status === 'done' && LOCKDOWN.test(v.content)) {
      chat.locked = true;
      scene.startle();
    }
    chat.updated = Date.now();
    persist();
    if (chat.id === state.activeId) {
      renderThread();
      followBottom();
    }
    updateComposer();
    renderDrawer();
    els.announcer.textContent = v.status === 'done' ? 'Knox replied.' : '';
  }
}

function send(raw) {
  const text = raw.trim();
  if (!text || state.live) return;
  let chat = activeChat();
  if (chat?.locked) return;
  if (!chat) {
    chat = { id: uid(), title: '', created: Date.now(), updated: Date.now(), messages: [], locked: false };
    state.chats.push(chat);
    state.activeId = chat.id;
  }
  if (!chat.title) chat.title = titleFrom(text);
  chat.messages.push({ id: uid(), role: 'user', content: text });
  const reply = { id: uid(), role: 'assistant', variants: [], vi: 0 };
  chat.messages.push(reply);
  els.input.value = '';
  autosize();
  generate(chat, reply);
}

function stop() {
  state.live?.controller.abort();
}

function replyToLast() {
  const chat = activeChat();
  if (!chat || chat.locked || state.live) return;
  const reply = { id: uid(), role: 'assistant', variants: [], vi: 0 };
  chat.messages.push(reply);
  generate(chat, reply);
}

function regenerate(id) {
  const chat = activeChat();
  if (!chat || chat.locked || state.live) return;
  const m = chat.messages[chat.messages.length - 1];
  if (m?.id !== id || m.role !== 'assistant') return;
  generate(chat, m);
}

function deleteMessage(id) {
  const chat = activeChat();
  const i = chat?.messages.findIndex((x) => x.id === id) ?? -1;
  if (i < 0) return;
  if (state.live?.msgId === id) stop();
  chat.messages.splice(i, 1);
  chat.updated = Date.now();
  persist();
  refresh();
}

function commitEdit(id, raw) {
  const text = raw.trim();
  const chat = activeChat();
  const i = chat?.messages.findIndex((x) => x.id === id) ?? -1;
  if (!text || i < 0 || state.live || chat.locked) return;
  state.editingId = null;
  chat.messages[i].content = text;
  chat.messages.splice(i + 1);
  if (i === 0) chat.title = titleFrom(text);
  const reply = { id: uid(), role: 'assistant', variants: [], vi: 0 };
  chat.messages.push(reply);
  generate(chat, reply);
}

// ---------- chats ----------

function openChat(id) {
  state.activeId = id;
  state.editingId = null;
  closeDrawer();
  refresh({ bottom: true });
}

function newChat() {
  state.activeId = null;
  state.editingId = null;
  closeDrawer();
  refresh();
  if (!touch) els.input.focus();
}

function deleteChat(id) {
  if (state.live?.chatId === id) stop();
  state.chats = state.chats.filter((c) => c.id !== id);
  if (state.activeId === id) state.activeId = null;
  persist();
  refresh();
}

function openDrawer() {
  renderDrawer();
  els.drawer.classList.add('open');
  els.drawer.inert = false;
  els.drawer.setAttribute('aria-hidden', 'false');
  els.scrim.hidden = false;
  els.drawerNew.focus();
}

function closeDrawer() {
  if (!els.drawer.classList.contains('open')) return;
  els.drawer.classList.remove('open');
  els.drawer.inert = true;
  els.drawer.setAttribute('aria-hidden', 'true');
  els.scrim.hidden = true;
}

// ---------- events ----------

els.messages.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-prompt]');
  if (chip) return send(chip.dataset.prompt);

  const toggle = e.target.closest('.think-toggle');
  if (toggle && !toggle.disabled) {
    const chat = activeChat();
    const node = toggle.closest('.msg');
    const m = chat?.messages.find((x) => x.id === node.dataset.id);
    if (!m) return;
    const key = `${m.id}:${m.vi}`;
    const think = toggle.closest('.think');
    thinkOpen.set(key, !think.classList.contains('open'));
    paintAssistant(node, chat, m, m === chat.messages[chat.messages.length - 1]);
    return;
  }

  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  if (btn.dataset.act === 'reply') return replyToLast();
  const chat = activeChat();
  const node = btn.closest('.msg');
  const m = chat?.messages.find((x) => x.id === node?.dataset.id);
  if (!m) return;

  switch (btn.dataset.act) {
    case 'copy':
      copyText(m.role === 'user' ? m.content : plain(variant(m).content));
      break;
    case 'edit':
      if (state.live || chat.locked) return;
      state.editingId = m.id;
      renderThread();
      {
        const ta = els.messages.querySelector(`[data-id="${CSS.escape(m.id)}"] textarea`);
        ta?.focus();
        ta?.setSelectionRange(ta.value.length, ta.value.length);
      }
      break;
    case 'save':
      commitEdit(m.id, node.querySelector('textarea').value);
      break;
    case 'cancel':
      state.editingId = null;
      renderThread();
      break;
    case 'delete':
      if (arm(btn)) deleteMessage(m.id);
      break;
    case 'regen':
      regenerate(m.id);
      break;
    case 'prev':
    case 'next':
      if (state.live) return;
      m.vi = Math.max(0, Math.min(m.variants.length - 1, m.vi + (btn.dataset.act === 'next' ? 1 : -1)));
      persist();
      renderThread();
      break;
  }
});

els.messages.addEventListener('keydown', (e) => {
  if (e.target.tagName !== 'TEXTAREA') return;
  const node = e.target.closest('.msg');
  if (e.key === 'Escape') {
    state.editingId = null;
    renderThread();
  } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !touch) {
    e.preventDefault();
    commitEdit(node.dataset.id, e.target.value);
  }
});

els.input.addEventListener('input', () => {
  autosize();
  updateComposer();
});

els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !touch) {
    e.preventDefault();
    send(els.input.value);
  }
});

els.composer.addEventListener('submit', (e) => {
  e.preventDefault();
  if (state.live) stop();
  else send(els.input.value);
});

els.lockedNew.addEventListener('click', newChat);
els.newChat.addEventListener('click', newChat);
els.drawerNew.addEventListener('click', newChat);
els.openDrawer.addEventListener('click', openDrawer);
els.closeDrawer.addEventListener('click', closeDrawer);
els.scrim.addEventListener('click', closeDrawer);

els.chatList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  const id = btn?.closest('.chat-item')?.dataset.id;
  if (!id) return;
  if (btn.dataset.act === 'open') openChat(id);
  else if (btn.dataset.act === 'delete-chat' && arm(btn)) deleteChat(id);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || els.vault.open) return;
  if (els.drawer.classList.contains('open')) closeDrawer();
  else if (state.live) stop();
});

window.addEventListener('pagehide', () => persist(true));

// ---------- vault ----------

function showSolved(flag) {
  els.vaultWin.hidden = false;
  els.vaultFlag.textContent = flag;
  els.openVault.classList.add('solved');
  els.openVault.title = 'You opened the vault';
}

const solved = loadSolved();
if (solved?.flag) showSolved(solved.flag);

els.openVault.addEventListener('click', () => {
  els.vaultMsg.textContent = '';
  els.vault.showModal();
  if (!touch) els.vaultInput.focus();
});
els.vaultClose.addEventListener('click', () => els.vault.close());
els.vault.addEventListener('click', (e) => {
  if (e.target === els.vault) els.vault.close();
});
els.vaultCopy.addEventListener('click', () => copyText(els.vaultFlag.textContent));

els.vaultForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const guess = els.vaultInput.value.trim();
  if (!guess) return;
  els.vaultTry.disabled = true;
  els.vaultMsg.textContent = '';
  try {
    const res = await verifyGuess(guess);
    if (res.ok) {
      saveSolved(res.flag);
      showSolved(res.flag);
      els.vaultMsg.textContent = '';
      scene.celebrate();
    } else {
      const row = els.vaultInput.parentElement;
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
      els.vaultMsg.textContent = WRONG[Math.floor(Math.random() * WRONG.length)];
    }
  } catch (err) {
    els.vaultMsg.textContent = err.message;
  } finally {
    els.vaultTry.disabled = false;
  }
});

// ---------- boot ----------

refresh({ bottom: true });
if (!touch) els.input.focus();
