// Everything the user saves lives in this browser's localStorage (no accounts, no server database).
const KEY = 'fridgefit:v1';
const THEME_KEY = 'fridgefit:theme';

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

const defaults = () => {
  const me = { id: uid(), name: 'Me', emoji: '😊', diets: [], allergies: [], avoid: '' };
  return {
    v: 1,
    profiles: [me], active: [me.id],
    pantry: [], shopping: [], made: [], aiRecipes: [],
    stats: { wasteStreak: 0, bestWasteStreak: 0, lastWasteCheck: null, rescued: 0, leftoverUsed: 0 },
    badges: [],
    seen: { labelNote: false, welcome: false },
    settings: {
      theme: 'auto', staples: true, units: /^en-US/i.test(navigator.language || '') ? 'F' : 'C',
      speak: true, rate: 1, handsFree: true, notify: false, accessCode: '', loc: null,
    },
    weather: null,
  };
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.v === 1) {
      const d = defaults();
      const s = { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}) }, stats: { ...d.stats, ...(raw.stats || {}) }, seen: { ...d.seen, ...(raw.seen || {}) } };
      if (!s.profiles.length) s.profiles = d.profiles;
      s.active = s.active.filter(id => s.profiles.some(p => p.id === id));
      if (!s.active.length) s.active = [s.profiles[0].id];
      return s;
    }
  } catch { /* corrupted or blocked storage: start fresh */ }
  return defaults();
}

export const state = load();

let timer;
export const hooks = { afterSave: null };

export function save() {
  state.updatedAt = Date.now();
  clearTimeout(timer);
  timer = setTimeout(saveNow, 150);
}

export function saveNow() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(THEME_KEY, state.settings.theme);
    if (hooks.afterSave) hooks.afterSave();
  } catch (e) {
    // storage full (usually photos): drop the oldest photos and retry once
    const withPhoto = state.made.filter(m => m.photo).reverse();
    if (withPhoto.length) {
      withPhoto.slice(0, Math.max(1, Math.ceil(withPhoto.length / 2))).forEach(m => { m.photo = null; });
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* give up quietly */ }
    }
  }
}

export function resetAll() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(THEME_KEY); } catch { /* ignore */ }
  location.reload();
}

export const activeProfiles = () => state.profiles.filter(p => state.active.includes(p.id));

/** Replace local data with a cloud copy (keeps device-only settings). */
export function adopt(remote) {
  const d = defaults();
  const keep = { accessCode: state.settings.accessCode, theme: state.settings.theme, loc: state.settings.loc };
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, d, remote, { settings: { ...d.settings, ...(remote.settings || {}), ...keep }, stats: { ...d.stats, ...(remote.stats || {}) }, seen: { ...d.seen, ...(remote.seen || {}), welcome: true }, weather: null });
  if (!state.profiles.length) state.profiles = d.profiles;
  state.active = (state.active || []).filter(id => state.profiles.some(p => p.id === id));
  if (!state.active.length) state.active = [state.profiles[0].id];
  saveNow();
}

export function isPristine() {
  const p = state.profiles[0];
  return !state.made.length && !state.pantry.length && !state.shopping.length && !state.aiRecipes.length
    && state.profiles.length === 1 && !p.diets.length && !p.allergies.length && !p.avoid;
}

/** Data that goes to the cloud: everything except weather cache and the device-only access code. */
export function cloudPayload() {
  const { weather, ...rest } = state;
  return { ...rest, settings: { ...rest.settings, accessCode: '' } };
}
