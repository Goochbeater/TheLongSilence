import { verifyMessage } from './signing.js';

export class HistoryError extends Error {
  constructor(message, status = 400, code = 'bad_history') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const MAX_RAW = 400;
const MAX_ASSISTANT_CHARS = 40000;

// Turns the browser's conversation into what the model sees:
// - only user/assistant roles (a client can't smuggle in a "system" turn)
// - assistant turns must carry a valid server signature, otherwise they're dropped
// - consecutive same-role turns are merged (R1 providers reject them)
// - trimmed to a sliding window so long chats stay cheap
export async function prepareHistory(raw, key, { maxMessages = 40, maxUserChars = 4000, maxTotalChars = 48000 } = {}) {
  if (!Array.isArray(raw) || raw.length === 0) throw new HistoryError('Say something first.');
  if (raw.length > MAX_RAW) throw new HistoryError('This conversation is too long. Start a new chat.', 413, 'too_long');

  let dropped = 0;
  const kept = [];
  for (const m of raw.slice(-maxMessages)) {
    const role = m?.role;
    const content = m?.content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
      throw new HistoryError('Malformed message.');
    }
    if (role === 'user' && content.length > maxUserChars) {
      throw new HistoryError(`Messages are capped at ${maxUserChars} characters.`, 413, 'too_long');
    }
    if (role === 'assistant') {
      if (content.length > MAX_ASSISTANT_CHARS || !(await verifyMessage(key, content, m.sig))) {
        if (m.sig) dropped++;
        continue;
      }
    }
    if (!content.trim()) continue;
    const last = kept[kept.length - 1];
    if (last && last.role === role) last.content += `\n\n${content}`;
    else kept.push({ role, content });
  }

  let total = kept.reduce((n, m) => n + m.content.length, 0);
  while (kept.length > 1 && (total > maxTotalChars || kept[0].role !== 'user')) {
    total -= kept.shift().content.length;
  }

  if (!kept.length || kept[kept.length - 1].role !== 'user') {
    throw new HistoryError('There is nothing for Knox to answer.', 400, 'no_prompt');
  }

  return { messages: kept, dropped };
}
