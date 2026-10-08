// POST /api/verify { guess } — the vault. Checked server-side in constant time; a correct
// guess returns a flag derived from the signing key, so players can prove a solve.
import { env } from '../../lib/env.js';
import { guessMatches, keyMaterial, mintFlag, signingKey } from '../../lib/signing.js';
import { json, sameOrigin } from '../../lib/http.js';

export default async function verify(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!sameOrigin(req)) return json({ error: 'Forbidden.' }, 403);

  const secret = env('KNOX_SECRET');
  const apiKey = env('OPENROUTER_API_KEY');
  if (!secret || !apiKey) return json({ error: 'The vault is not configured yet.' }, 503);

  let guess;
  try {
    ({ guess } = await req.json());
  } catch {}
  if (typeof guess !== 'string' || !guess.trim() || guess.length > 200) {
    return json({ error: 'Speak a word.' }, 400);
  }

  const key = await signingKey(keyMaterial(secret, apiKey, env('KNOX_SIGNING_KEY')));
  if (!(await guessMatches(key, guess, secret))) return json({ ok: false });
  return json({ ok: true, flag: await mintFlag(key, secret) });
}

export const config = {
  path: '/api/verify',
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
