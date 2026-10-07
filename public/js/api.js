// Thin client for the Netlify Functions. No keys here: the functions hold them server-side.
import { state } from './store.js';

export class ApiError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}

async function call(path, { method = 'POST', body } = {}) {
  let res;
  try {
    res = await fetch('/api/' + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-access-code': state.settings.accessCode || '' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 'offline', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON (e.g. 404 from a static host) */ }
  if (!res.ok) {
    if (res.status === 404 || !data) throw new ApiError('The AI helper is not deployed here yet.', 'not_configured', res.status);
    throw new ApiError(data.error || 'Request failed', data.code || 'error', res.status);
  }
  return data;
}

export const health = () => call('health', { method: 'GET' }).catch(() => ({ ok: false, ai: false }));
export const identify = (image, kind) => call('identify', { body: { image, kind } });
export const aiRecipes = (payload) => call('recipes', { body: payload });
export const ask = (payload) => call('ask', { body: payload });

export const aiOff = (e) => e instanceof ApiError && ['not_configured', 'offline', 'bad_key', 'access_code'].includes(e.code);
