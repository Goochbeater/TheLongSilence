// Config lookup that works in Netlify's edge runtime (Deno) and in Node (local dev + tests).
export function env(name, fallback = undefined) {
  let value;
  try { value = globalThis.Netlify?.env?.get(name); } catch {}
  if (value == null) { try { value = globalThis.Deno?.env?.get(name); } catch {} }
  if (value == null) value = globalThis.process?.env?.[name];
  return value == null || value === '' ? fallback : value;
}

export function envInt(name, fallback, min, max) {
  const n = Number.parseInt(env(name, ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
