// Shared helpers for the Netlify Functions. API keys are read from Netlify environment variables
// and never leave the server.

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const errorResponse = (err) => {
  if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status);
  console.error(err);
  return json({ error: 'Something went wrong on the server.', code: 'server_error' }, 500);
};

// Best-effort per-instance rate limit (serverless instances are short-lived, so this only blunts bursts).
const hits = new Map();
export function rateLimit(req, perMinute = 30) {
  const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'anon';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= perMinute) throw new HttpError(429, 'rate_limited', 'Too many requests. Please wait a moment.');
  recent.push(now);
  hits.set(ip, recent);
}

// Optional shared secret so strangers who find your site URL can't spend your AI credits.
export function checkAccess(req) {
  const code = process.env.ACCESS_CODE;
  if (!code) return;
  if (req.headers.get('x-access-code') !== code) {
    throw new HttpError(401, 'access_code', 'This site needs an access code. Add it under Me → Settings.');
  }
}

export function guard(req, { post = true } = {}) {
  if (post && req.method !== 'POST') throw new HttpError(405, 'method', 'Use POST.');
  checkAccess(req);
  rateLimit(req);
}

export async function readJson(req, maxBytes = 6_000_000) {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large', 'That request is too large.');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'bad_json', 'Invalid JSON.'); }
}

export const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

export async function callClaude({ system, messages, maxTokens = 1500, model }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(503, 'not_configured', 'AI is not set up yet. Add ANTHROPIC_API_KEY in Netlify.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: model || MODEL(), max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Anthropic error', res.status, body.slice(0, 500));
    if (res.status === 401) throw new HttpError(502, 'bad_key', 'The AI key was rejected. Check ANTHROPIC_API_KEY in Netlify.');
    if (res.status === 429) throw new HttpError(429, 'ai_busy', 'The AI is busy right now. Try again in a moment.');
    throw new HttpError(502, 'ai_error', 'The AI service had a problem. Try again.');
  }
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

export function extractJson(text) {
  const start = text.search(/[{[]/);
  if (start < 0) throw new HttpError(502, 'ai_format', 'The AI reply could not be read.');
  const open = text[start];
  const end = text.lastIndexOf(open === '{' ? '}' : ']');
  try { return JSON.parse(text.slice(start, end + 1)); } catch {
    throw new HttpError(502, 'ai_format', 'The AI reply could not be read.');
  }
}

export const clean = (s, n = 200) => String(s ?? '').replace(/[\u0000-\u001f]+/g, ' ').slice(0, n);
export const cleanList = (a, n = 60, len = 60) => (Array.isArray(a) ? a : []).slice(0, n).map((x) => clean(x, len)).filter(Boolean);
