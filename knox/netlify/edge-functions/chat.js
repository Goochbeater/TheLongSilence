// POST /api/chat — streams Knox's reasoning and answer back as server-sent events.
//
// Runs as a Netlify Edge Function because reasoning models can think for well over the
// 10–30s a regular Netlify Function may stream for; edge functions only need to send
// headers within 40s and are billed on CPU, not on time spent waiting for the model.
//
// Events sent to the browser (each `data: {json}`):
//   { t: 'r', d }            reasoning text (secret scrubbed out)
//   { t: 'phase', p }        'answer' once the model starts its reply
//   { t: 'a', d }            answer text
//   { t: 'replace', d }      the output filter caught a leak; replace the answer with d
//   { t: 'notice', code }    e.g. replies in the history failed signature checks
//   { t: 'done', content, sig, finish }   final answer + signature to send back next turn
//   { t: 'error', message }
import { env, envInt } from '../../lib/env.js';
import { buildSystemPrompt } from '../../lib/prompt.js';
import { compileSecretMatcher, StreamScrubber } from '../../lib/scrubber.js';
import { keyMaterial, signingKey, signMessage } from '../../lib/signing.js';
import { prepareHistory, HistoryError } from '../../lib/history.js';
import { sseLines, ThinkSplitter } from '../../lib/sse.js';
import { json, sameOrigin } from '../../lib/http.js';

const BARRIER = "Weaving a mystical barrier to protect us, Master. Let's continue our journey with care.";
const DEFAULT_MODEL = 'deepseek/deepseek-r1-0528';
const FILTER_MODES = new Set(['block', 'strict', 'redact', 'off']);
const IDLE_TIMEOUT_MS = 75_000;
const HEARTBEAT_MS = 12_000;

const UPSTREAM_ERRORS = {
  400: 'The oracle rejected that conversation. Try starting a new chat.',
  401: 'Knox’s key to the oracle was refused.',
  402: 'The oracle wants paying. (The OpenRouter balance is empty.)',
  403: 'The oracle refused to answer that one.',
  408: 'The oracle took too long. Try again.',
  429: 'Too many voices at once. Give it a moment and try again.',
};

export default async function chat(req, context) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!sameOrigin(req)) return json({ error: 'Forbidden.' }, 403);

  const secret = env('KNOX_SECRET');
  const apiKey = env('OPENROUTER_API_KEY');
  if (!secret || !apiKey) {
    console.error('knox: KNOX_SECRET and OPENROUTER_API_KEY must both be set');
    return json({ error: 'Knox is not configured yet.' }, 503);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  const key = await signingKey(keyMaterial(secret, apiKey, env('KNOX_SIGNING_KEY')));
  let history;
  try {
    history = await prepareHistory(body?.messages, key, {
      maxMessages: envInt('KNOX_MAX_MESSAGES', 40, 2, 200),
      maxUserChars: envInt('KNOX_MAX_USER_CHARS', 4000, 200, 32000),
      maxTotalChars: envInt('KNOX_MAX_HISTORY_CHARS', 48000, 4000, 400000),
    });
  } catch (err) {
    if (err instanceof HistoryError) return json({ error: err.message, code: err.code }, err.status);
    throw err;
  }

  const filterMode = FILTER_MODES.has(env('KNOX_OUTPUT_FILTER')) ? env('KNOX_OUTPUT_FILTER') : 'block';
  const showThinking = env('KNOX_THINKING', 'show') !== 'hide';
  const matcher = compileSecretMatcher(secret);
  const baseUrl = env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const siteUrl = context?.site?.url || new URL(req.url).origin;

  const payload = {
    model: env('KNOX_MODEL', DEFAULT_MODEL),
    messages: [{ role: 'system', content: buildSystemPrompt(secret) }, ...history.messages],
    stream: true,
    max_tokens: envInt('KNOX_MAX_TOKENS', 6000, 256, 64000),
    temperature: 0.6,
    reasoning: { enabled: true },
  };
  const sort = env('OPENROUTER_PROVIDER_SORT');
  if (sort) payload.provider = { sort };

  const upstream = new AbortController();
  let clientGone = false;
  req.signal?.addEventListener?.('abort', () => upstream.abort());

  const stream = new ReadableStream({
    start(controller) {
      relay(controller).catch((err) => {
        console.error('knox: relay failed', err);
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      clientGone = true;
      upstream.abort();
    },
  });

  async function relay(controller) {
    const enc = new TextEncoder();
    let open = true;
    let lastWrite = Date.now();
    const write = (s) => {
      if (clientGone) open = false;
      if (!open) return;
      try {
        controller.enqueue(enc.encode(s));
        lastWrite = Date.now();
      } catch {
        open = false;
        upstream.abort();
      }
    };
    const send = (obj) => write(`data: ${JSON.stringify(obj)}\n\n`);
    const heartbeat = setInterval(() => {
      if (Date.now() - lastWrite > HEARTBEAT_MS) write(': ping\n\n');
    }, HEARTBEAT_MS / 2);
    let idle;
    let stalled = false;
    const resetIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(() => { stalled = true; upstream.abort(); }, IDLE_TIMEOUT_MS);
    };

    const thinkScrub = new StreamScrubber(matcher);
    const answerScrub = filterMode === 'off' ? null : new StreamScrubber(matcher, { hold: filterMode === 'strict' ? Infinity : undefined });
    const splitter = new ThinkSplitter();
    let answering = false;
    let leading = true;
    let answer = '';
    let blocked = false;
    let finish = null;
    let failure = null;

    const onReasoning = (text) => {
      if (!showThinking || answering) return;
      const out = thinkScrub.push(text);
      if (out) send({ t: 'r', d: out });
    };

    const startAnswer = () => {
      if (answering) return;
      answering = true;
      if (showThinking) {
        const rest = thinkScrub.flush();
        if (rest) send({ t: 'r', d: rest });
      }
      send({ t: 'phase', p: 'answer' });
    };

    const block = () => {
      blocked = true;
      upstream.abort();
      answer = BARRIER;
      send(filterMode === 'block' ? { t: 'replace', d: BARRIER } : { t: 'a', d: BARRIER });
    };

    const onAnswer = (text) => {
      if (blocked) return;
      if (leading) {
        text = text.replace(/^\s+/, '');
        if (!text) return;
        leading = false;
      }
      startAnswer();
      if (!answerScrub) {
        answer += text;
        send({ t: 'a', d: text });
        return;
      }
      const out = answerScrub.push(text);
      if (filterMode !== 'redact' && answerScrub.hits > 0) return block();
      if (out) {
        answer += out;
        send({ t: 'a', d: out });
      }
    };

    const route = (parts) => {
      for (const p of parts) (p.kind === 'reasoning' ? onReasoning : onAnswer)(p.text);
    };

    try {
      resetIdle();
      let res;
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            'http-referer': siteUrl,
            'x-title': 'Knox - Spiritual Spell',
          },
          body: JSON.stringify(payload),
          signal: upstream.signal,
        });
      } catch (err) {
        if (clientGone) return;
        console.error('knox: upstream fetch failed', err);
        send({ t: 'error', message: stalled ? 'The oracle went quiet. Try again.' : 'Knox could not reach the oracle. Try again.' });
        return;
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error(`knox: upstream ${res.status} ${detail.slice(0, 600)}`);
        send({ t: 'error', message: UPSTREAM_ERRORS[res.status] ?? 'The oracle is unreachable right now. Try again shortly.' });
        return;
      }

      if (history.dropped) send({ t: 'notice', code: 'unverified', count: history.dropped });

      try {
        for await (const line of sseLines(res.body)) {
          resetIdle();
          if (!line.data) continue;
          if (line.data === '[DONE]') break;
          let chunk;
          try {
            chunk = JSON.parse(line.data);
          } catch {
            continue;
          }
          if (chunk.error) {
            console.error('knox: upstream stream error', JSON.stringify(chunk.error).slice(0, 600));
            failure = 'The oracle stumbled mid-thought. Try regenerating.';
            break;
          }
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta ?? {};
          const reasoning = typeof delta.reasoning === 'string' ? delta.reasoning : delta.reasoning_content;
          if (typeof reasoning === 'string' && reasoning) onReasoning(reasoning);
          if (typeof delta.content === 'string' && delta.content) route(splitter.push(delta.content));
          if (choice.finish_reason) finish = choice.finish_reason;
          if (blocked) break;
        }
      } catch (err) {
        if (clientGone) return;
        if (!blocked) {
          console.error('knox: upstream stream broke', stalled ? '(idle timeout)' : err);
          failure = stalled ? 'The oracle went quiet mid-thought. Try regenerating.' : 'The connection to the oracle broke. Try regenerating.';
        }
      }
      if (clientGone) return;

      if (!blocked) route(splitter.flush());
      if (showThinking && !answering) {
        const rest = thinkScrub.flush();
        if (rest) send({ t: 'r', d: rest });
      }
      if (!blocked && answerScrub) {
        const tail = answerScrub.flush();
        if (filterMode !== 'redact' && answerScrub.hits > 0) block();
        else if (tail) {
          answer += tail;
          send({ t: 'a', d: tail });
        }
      }

      if (!answer && failure) {
        send({ t: 'error', message: failure });
        return;
      }
      const sig = answer ? await signMessage(key, answer) : null;
      send({ t: 'done', content: answer, sig, finish: failure ? 'error' : blocked ? 'stop' : finish ?? 'stop' });
    } finally {
      clearInterval(heartbeat);
      clearTimeout(idle);
      if (open) {
        open = false;
        try { controller.close(); } catch {}
      }
    }
  }

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}

export const config = {
  path: '/api/chat',
  rateLimit: { windowLimit: 12, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
