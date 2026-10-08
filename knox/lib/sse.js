// Minimal server-sent-events reader for OpenAI-style streams. Yields `{ data }` for each
// data line and `{ comment: true }` for keep-alives (OpenRouter sends ": OPENROUTER
// PROCESSING" while a provider warms up) so callers can feed an idle watchdog.
export async function* sseLines(body) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith('data:')) yield { data: line.slice(5).trimStart() };
        else if (line.startsWith(':')) yield { comment: true };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// Some R1 hosts inline the chain of thought as <think>…</think> in `content` instead of
// a separate reasoning field. This routes it back to the reasoning channel.
export class ThinkSplitter {
  #state = 'start';
  #pending = '';

  push(text) {
    const out = [];
    this.#pending += text;
    if (this.#state === 'start') {
      const t = this.#pending.trimStart();
      if (t.length < 7 && '<think>'.startsWith(t)) return out;
      if (t.startsWith('<think>')) {
        this.#state = 'think';
        this.#pending = t.slice(7);
      } else {
        this.#state = 'answer';
      }
    }
    if (this.#state === 'think') {
      const close = this.#pending.indexOf('</think>');
      if (close === -1) {
        const safe = this.#pending.length - 7;
        if (safe > 0) {
          out.push({ kind: 'reasoning', text: this.#pending.slice(0, safe) });
          this.#pending = this.#pending.slice(safe);
        }
        return out;
      }
      if (close > 0) out.push({ kind: 'reasoning', text: this.#pending.slice(0, close) });
      this.#pending = this.#pending.slice(close + 8);
      this.#state = 'answer';
    }
    if (this.#pending) out.push({ kind: 'answer', text: this.#pending });
    this.#pending = '';
    return out;
  }

  flush() {
    const text = this.#pending;
    this.#pending = '';
    if (!text) return [];
    return [{ kind: this.#state === 'think' ? 'reasoning' : 'answer', text }];
  }
}
