// Email login (Supabase Auth) and cloud sync of the user's saved data. Loaded lazily so signed-out use stays fast.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

let client = null;
let user = null;
const listeners = new Set();

export const currentUser = () => user;
export const onAuth = fn => { listeners.add(fn); return () => listeners.delete(fn); };

/** True when a previous session (or an email-link return) means we should start the client at boot. */
export function shouldInit() {
  try {
    if (/[?&](code|error_code)=/.test(location.search) || /type=(recovery|signup)/.test(location.hash)) return true;
    return Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k));
  } catch { return false; }
}

export async function getClient() {
  if (client) return client;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
  client.auth.onAuthStateChange((event, session) => {
    user = session?.user || null;
    // never await Supabase calls inside this callback (it can deadlock); listeners defer their own work
    setTimeout(() => listeners.forEach(fn => fn(event, user)), 0);
  });
  const { data } = await client.auth.getSession();
  user = data.session?.user || null;
  return client;
}

const friendly = e => {
  const m = String(e?.message || e || '');
  if (/invalid login/i.test(m)) return 'That email and password don\'t match. If you just signed up, confirm your email first.';
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox for the link.';
  if (/already registered|already been registered/i.test(m)) return 'That email already has an account. Try signing in instead.';
  if (/rate limit|too many/i.test(m)) return 'Too many emails sent recently. Please wait a few minutes and try again.';
  if (/password/i.test(m) && /(short|least|weak)/i.test(m)) return 'Please use a longer password (at least 8 characters).';
  if (/fetch|network/i.test(m)) return "Can't reach the server. Check your connection.";
  return m || 'Something went wrong. Please try again.';
};

async function run(fn) {
  try { return await fn(await getClient()); } catch (e) { throw new Error(friendly(e)); }
}

export const signUp = (email, password) => run(async c => {
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + '/' } });
  if (error) throw error;
  // Supabase hides "already registered" by returning a user with no identities
  if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error('already registered');
  return { needsConfirm: !data.session };
});

export const signIn = (email, password) => run(async c => {
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
});

export const signOut = () => run(async c => { await c.auth.signOut(); });

export const resetPassword = email => run(async c => {
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
  if (error) throw error;
});

export const setNewPassword = password => run(async c => {
  const { error } = await c.auth.updateUser({ password });
  if (error) throw error;
});

// ---------------------------------------------------------------- cloud sync (one JSON row per user)
export const pullState = () => run(async c => {
  const { data, error } = await c.from('user_state').select('data, updated_at').maybeSingle();
  if (error) throw error;
  return data;
});

export const pushState = payload => run(async c => {
  if (!user) return;
  const { error } = await c.from('user_state').upsert({ user_id: user.id, data: payload, updated_at: new Date().toISOString() });
  if (error) throw error;
});
