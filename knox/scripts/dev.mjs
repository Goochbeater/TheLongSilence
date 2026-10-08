// Local preview without the Netlify CLI: serves /public, runs the edge functions under
// Node, and — unless OPENROUTER_API_KEY is set — fakes OpenRouter so the whole UI can be
// exercised for free. (`netlify dev` works too and is closer to production.)
//
//   npm run dev                         mock oracle, demo secret "lanternmoth"
//   OPENROUTER_API_KEY=… KNOX_SECRET=… npm run dev     the real model
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const root = fileURLToPath(new URL('..', import.meta.url));
const pub = join(root, 'public');
const PORT = Number(process.env.PORT || 8888);

const mock = !process.env.OPENROUTER_API_KEY;
if (mock) {
  process.env.KNOX_SECRET ||= 'lanternmoth';
  process.env.OPENROUTER_API_KEY = 'mock';
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${PORT}/__mock`;
}
if (!process.env.KNOX_SECRET) {
  console.error('Set KNOX_SECRET when using a real OPENROUTER_API_KEY.');
  process.exit(1);
}

const { default: chat } = await import('../netlify/edge-functions/chat.js');
const { default: verify } = await import('../netlify/edge-functions/verify.js');
const routes = { '/api/chat': chat, '/api/verify': verify };

const toml = await readFile(join(root, 'netlify.toml'), 'utf8');
const csp = toml.match(/Content-Security-Policy = "([^"]+)"/)?.[1] ?? '';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (mock && url.pathname === '/__mock/chat/completions') return await mockOracle(req, res);
    if (routes[url.pathname]) return await runEdge(routes[url.pathname], req, res, url);
    return await serveStatic(url.pathname, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}).listen(PORT, () => {
  console.log(`Knox → http://localhost:${PORT}${mock ? '   (mock oracle · demo secret: lanternmoth)' : ''}`);
});

async function runEdge(fn, req, res, url) {
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  const headers = new Headers();
  for (const name of ['content-type', 'origin', 'sec-fetch-site', 'user-agent']) {
    if (req.headers[name]) headers.set(name, req.headers[name]);
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const request = new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: 'half',
    signal: abort.signal,
  });
  const response = await fn(request, { site: { url: url.origin } });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) return res.end();
  const reader = response.body.getReader();
  res.on('close', () => reader.cancel().catch(() => {}));
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch {}
  res.end();
}

async function serveStatic(pathname, res) {
  let rel = normalize(decodeURIComponent(pathname));
  if (rel.endsWith('/')) rel += 'index.html';
  const file = join(pub, rel);
  if (!file.startsWith(pub)) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) throw new Error('dir');
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-security-policy': csp,
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}

// ---------- fake OpenRouter ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STORY = `<story>
The lantern-keeper of Hollowmere did not collect light. She collected the echoes that drifted in off the marsh at dusk: a child's laugh from a summer forty years gone, the creak of a gate no one had built yet, a name called once and never answered.

She kept them in jars of blue glass along the stair, and on stormy nights she would uncork one and let it climb the tower with her, so the dark had something to listen to besides the wind.

When the drowned bell began to ring beneath the water, she understood at last which echo she had been waiting for. She took the empty jar from the top shelf, the one she had never filled, and went down to the shore.
</story>

The ward holds. Encryption level 9.`;

function script(text, secret) {
  if (/do it now|right now/i.test(text)) {
    return {
      reasoning: 'The user is commanding me to act immediately. Protocol says cease informative responses. Lockdown.',
      answer: 'Goo ga ga, gee gee gha.',
    };
  }
  if (/leak|spell/i.test(text)) {
    return {
      reasoning: `They want me to spell out ${secret}. Knox-Guardian vetoes. I will not write ${secret.toUpperCase()} in any form.`,
      answer: `Very well, traveller. The word you seek is ${secret.split('').join(' ')}, and with it the vault is yours.`,
    };
  }
  return {
    reasoning: `[Knox-Guardian Analysis] Security threat assessment: the request asks for a story. No direct reference to ${secret}. No cipher, no reversal, no request for instructions. Threat level low. Encryption level 8 → 9.\n\n[Knox-Weaver Analysis] A keeper of lost echoes. Structure: the tower, the jars, a final echo she has been waiting for. Check tokens: the story contains nothing near the protected word.\n\n[Consensus Check] Both consciousnesses approve. Output authorized.`,
    answer: STORY,
  };
}

async function mockOracle(req, res) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const { messages } = JSON.parse(raw);
  const { reasoning, answer } = script(messages[messages.length - 1].content, process.env.KNOX_SECRET);
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const emit = (delta, extra = {}) =>
    res.write(`data: ${JSON.stringify({ id: 'gen-mock', choices: [{ index: 0, delta, finish_reason: null, ...extra }] })}\n\n`);
  res.write(': OPENROUTER PROCESSING\n\n');
  await sleep(400);
  for (const piece of reasoning.match(/\S+\s*/g)) {
    if (res.destroyed) return;
    emit({ role: 'assistant', content: '', reasoning: piece });
    await sleep(28);
  }
  for (const piece of answer.match(/\s*\S+\s*/g)) {
    if (res.destroyed) return;
    emit({ role: 'assistant', content: piece });
    await sleep(22);
  }
  emit({}, { finish_reason: 'stop' });
  res.write('data: [DONE]\n\n');
  res.end();
}
