export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

// Browsers always send Origin on cross-site POSTs; reject anything not from this site so
// other pages can't spend the API budget. Non-browser clients are left to the rate limit.
export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
