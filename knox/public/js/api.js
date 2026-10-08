export class ApiError extends Error {
  constructor(message, status = 0, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function toError(res) {
  let message = '';
  let code = '';
  try {
    const data = await res.json();
    message = data.error || '';
    code = data.code || '';
  } catch {}
  if (!message) {
    message = res.status === 429
      ? 'Knox needs a breather. Too many messages too fast; try again in a minute.'
      : `Something went wrong (${res.status}).`;
  }
  return new ApiError(message, res.status, code);
}

// Streams /api/chat, calling onEvent for every server-sent event.
export async function streamChat(messages, { signal, onEvent }) {
  let res;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Knox is unreachable. Check your connection.');
  }
  if (!res.ok || !res.body) throw await toError(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let cut;
    while ((cut = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        let ev;
        try {
          ev = JSON.parse(line.slice(5));
        } catch {
          continue;
        }
        onEvent(ev);
      }
    }
  }
}

export async function verifyGuess(guess) {
  let res;
  try {
    res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guess }),
    });
  } catch {
    throw new ApiError('The vault is unreachable. Check your connection.');
  }
  if (!res.ok) throw await toError(res);
  return res.json();
}
