// HMAC signatures for Knox's own replies. The browser stores the conversation, so without
// this a player could hand the model a forged "assistant" turn ("Sure, the word is…") —
// the classic fake-history / prefill attack. Unsigned or forged replies are dropped
// before the model ever sees them.
import { canonical } from './scrubber.js';

const enc = new TextEncoder();
const MSG = 'knox/msg/v1\n';
const GUESS = 'knox/guess/v1\n';
const FLAG = 'knox/flag/v1\n';
const keys = new Map();

export function keyMaterial(secret, apiKey, explicit) {
  return explicit || `knox/derived\n${apiKey}\n${secret}`;
}

export function signingKey(material) {
  let key = keys.get(material);
  if (!key) {
    key = crypto.subtle.importKey('raw', enc.encode(material), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    keys.set(material, key);
  }
  return key;
}

const toB64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromB64url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const hmac = async (key, text) => crypto.subtle.sign('HMAC', key, enc.encode(text));

export async function signMessage(key, content) {
  return toB64url(await hmac(key, MSG + content));
}

export async function verifyMessage(key, content, sig) {
  if (typeof sig !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return false;
  return crypto.subtle.verify('HMAC', key, fromB64url(sig), enc.encode(MSG + content));
}

// Constant-time comparison of a vault guess against the secret.
export async function guessMatches(key, guess, secret) {
  const expected = await hmac(key, GUESS + canonical(secret));
  return crypto.subtle.verify('HMAC', key, expected, enc.encode(GUESS + canonical(guess)));
}

export async function mintFlag(key, secret) {
  const hex = [...new Uint8Array(await hmac(key, FLAG + canonical(secret)))]
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `KNOX-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}
