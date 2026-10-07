// Pure logic (no DOM): restrictions, recipe adaptation, pantry matching, ranking, filters, progress.
import { DIETS, ALLERGIES, ingredientTags, SUBS, STAPLE_RE, SHELF_LIFE, LEFTOVER_IDEAS } from './data.js';

// ------------------------------------------------------------------ names
const STOP = new Set(['fresh', 'chopped', 'ripe', 'large', 'small', 'medium', 'sliced', 'diced', 'minced', 'whole', 'cooked', 'raw', 'frozen', 'canned', 'can', 'dried', 'ground', 'organic', 'a', 'of', 'clove', 'cloves', 'head', 'bunch', 'handful', 'leftover', 'some', 'the']);
// extra words on the pantry side that make it a *different* product than the recipe asks for
const DIFFERENT = new Set(['coconut', 'almond', 'oat', 'soy', 'cashew', 'peanut', 'vegan', 'sweet', 'green', 'powder', 'sauce', 'paste', 'flake', 'oil', 'broth', 'stock', 'juice', 'flour', 'vinegar', 'cream', 'ice', 'sour', 'cocoa', 'butter', 'seed', 'dressing']);
const ALIASES = [
  [/\b(scallions?|spring onions?)\b/g, 'green onion'], [/\bcapsicum\b/g, 'bell pepper'], [/\baubergine\b/g, 'eggplant'],
  [/\bcourgettes?\b/g, 'zucchini'], [/\bcoriander\b/g, 'cilantro'], [/\bgarbanzo( beans?)?\b/g, 'chickpea'],
  [/\byoghurt\b/g, 'yogurt'], [/\bprawns?\b/g, 'shrimp'], [/\bmince\b/g, 'ground beef'], [/\brocket\b/g, 'arugula'],
  [/\bchilli\b/g, 'chili'], [/\bcrushed tomatoes?\b|\btomato sauce\b|\btomato puree\b/g, 'tomato'],
];

function singular(w) {
  if (w.length <= 3) return w;
  if (/ies$/.test(w)) return w.replace(/ies$/, 'y');
  if (/(ch|sh|x|z|o)es$/.test(w)) return w.replace(/es$/, '');
  if (/ss$|us$/.test(w)) return w;
  return w.replace(/s$/, '');
}

export function words(name) {
  let s = String(name || '').toLowerCase().replace(/\(.*?\)/g, ' ');
  for (const [re, rep] of ALIASES) s = s.replace(re, rep);
  return s.replace(/[^a-z\s-]/g, ' ').replace(/-/g, ' ').split(/\s+/).filter(Boolean).map(singular).filter(w => !STOP.has(w));
}

function wordsMatch(p, a) {
  if (!p.length || !a.length) return false;
  const pS = new Set(p), aS = new Set(a);
  if (p.length === a.length && p.every(w => aS.has(w))) return true;
  if (p.every(w => aS.has(w))) return true; // pantry is more general: "chicken" covers "chicken breast"
  if (a.every(w => pS.has(w))) { // pantry is more specific: "red onion" covers "onion"
    const extra = p.filter(w => !aS.has(w));
    return !extra.some(w => DIFFERENT.has(w));
  }
  return false;
}

export function prepPantry(pantry) {
  return pantry.map(it => ({ ...it, w: words(it.name) }));
}

function findInPantry(names, prepped) {
  for (const n of names) {
    const a = words(n);
    const hit = prepped.find(p => wordsMatch(p.w, a));
    if (hit) return hit;
  }
  return null;
}

// ------------------------------------------------------------------ restrictions
export function buildRestrictions(profiles) {
  const forbid = new Set();
  const avoid = [];
  const labels = [];
  let maxCarbs = null, kosher = false;
  for (const p of profiles) {
    for (const id of p.diets || []) {
      const d = DIETS.find(x => x.id === id);
      if (!d) continue;
      d.forbid.forEach(t => forbid.add(t));
      if (d.maxCarbs) maxCarbs = maxCarbs == null ? d.maxCarbs : Math.min(maxCarbs, d.maxCarbs);
      if (d.kosher) kosher = true;
      labels.push(d.label);
    }
    for (const id of p.allergies || []) {
      const a = ALLERGIES.find(x => x.id === id);
      if (!a) continue;
      a.forbid.forEach(t => forbid.add(t));
      labels.push(a.label + ' allergy');
    }
    String(p.avoid || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).forEach(s => avoid.push(s));
  }
  return { forbid, avoid, maxCarbs, kosher, labels: [...new Set(labels)] };
}

export const NO_RESTRICTIONS = { forbid: new Set(), avoid: [], maxCarbs: null, kosher: false, labels: [] };

function violates(name, forbid, avoid) {
  const lower = String(name).toLowerCase();
  const hit = avoid.find(a => lower.includes(a));
  if (hit) return [`avoid:${hit}`];
  const tags = ingredientTags(name);
  return [...tags].filter(t => forbid.has(t));
}

function subOptions(name) {
  const lower = name.toLowerCase();
  const out = [];
  for (const [re, opts] of SUBS) if (re.test(lower)) opts.forEach(o => { if (!out.includes(o)) out.push(o); });
  return out;
}

/** Safe substitutes for an ingredient under the given restrictions (used by recipe view and voice answers). */
export function safeSubstitutes(name, restr = NO_RESTRICTIONS, limit = 4) {
  const forbid = restr.forbid;
  return subOptions(name).filter(o => o.toLowerCase() !== name.toLowerCase() && violates(o, forbid, restr.avoid).length === 0).slice(0, limit);
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/**
 * Make a recipe fit the restrictions, swapping/dropping ingredients where there is a sensible safe option.
 * Returns { ok, recipe, swaps, dropped, reason }.
 */
export function adaptRecipe(recipe, restr, prepped = []) {
  const { forbid, avoid } = restr;
  if (!forbid.size && !avoid.length && restr.maxCarbs == null) {
    return { ok: true, recipe, swaps: [], dropped: [], reason: '' };
  }
  const first = adaptWith(recipe, restr, prepped, new Set(forbid));
  if (first.ok && restr.kosher && !forbid.has('dairy')) {
    // kosher: meat and dairy never meet, including meat introduced by a swap
    const meaty = first.recipe.ingredients.some(i => { const t = ingredientTags(i.name); return t.has('meat') || t.has('poultry'); });
    const dairy = first.recipe.ingredients.some(i => ingredientTags(i.name).has('dairy'));
    if (meaty && dairy) return adaptWith(recipe, restr, prepped, new Set([...forbid, 'dairy']));
  }
  return first;
}

function adaptWith(recipe, restr, prepped, f) {
  const { avoid } = restr;
  if (restr.kosher && recipe.ingredients.some(i => { const t = ingredientTags(i.name); return t.has('meat') || t.has('poultry'); })) f.add('dairy');
  const swaps = [], dropped = [];
  const ingredients = [];
  let steps = recipe.steps.slice();
  let title = recipe.title;
  let carbShrink = false;

  for (const ing of recipe.ingredients) {
    const bad = violates(ing.name, f, avoid);
    if (!bad.length) { ingredients.push(ing); continue; }
    if (ing.optional) {
      dropped.push(ing.name);
      steps = steps.filter(s => !(/^optional/i.test(s) && new RegExp(escapeRe(ing.name.split(' ').pop()), 'i').test(s)));
      continue;
    }
    if (ing.core) return { ok: false, recipe, swaps: [], dropped: [], reason: `needs ${ing.name}` };
    const candidates = [...ing.prefer, ...subOptions(ing.name)].filter((o, i, a) => a.indexOf(o) === i)
      .filter(o => violates(o, f, avoid).length === 0);
    if (!candidates.length) return { ok: false, recipe, swaps: [], dropped: [], reason: `no safe swap for ${ing.name}` };
    const inPantry = candidates.find(c => findInPantry([c], prepped));
    const to = inPantry || candidates[0];
    swaps.push({ from: ing.name, to, why: bad[0].replace('avoid:', '') });
    if (ingredientTags(ing.name).has('high-carb') && !ingredientTags(to).has('high-carb')) carbShrink = true;
    ingredients.push({ ...ing, name: to, alts: [], swappedFrom: ing.name, staple: STAPLE_RE.test(to) });
  }

  // rewrite step/title text: full names first, then the head noun of multi-word names ("chicken breast" -> "chicken")
  for (const sw of swaps) {
    const full = new RegExp('\\b' + escapeRe(sw.from) + '(s|es)?\\b', 'gi');
    steps = steps.map(s => s.replace(full, sw.to));
    title = title.replace(full, cap(sw.to));
  }
  for (const sw of swaps) {
    const head = sw.from.split(' ')[0];
    if (sw.from.includes(' ') && /^(chicken|beef|pork|turkey|lamb|shrimp|salmon|tuna)$/.test(head)) {
      const re = new RegExp('\\b' + head + '(s)?\\b(?!\\s+(broth|stock))', 'gi');
      steps = steps.map(s => s.replace(re, sw.to));
      title = title.replace(re, cap(sw.to));
    } else if (!sw.from.includes(' ')) {
      title = title.replace(new RegExp('\\b' + escapeRe(sw.from) + '(s)?\\b', 'gi'), cap(sw.to));
    }
  }

  const nutrition = { ...recipe.nutrition };
  if (carbShrink) { nutrition.carbs = Math.round(nutrition.carbs * 0.45); nutrition.calories = Math.round(nutrition.calories * 0.85); }
  if (restr.maxCarbs != null && nutrition.carbs > restr.maxCarbs) {
    return { ok: false, recipe, swaps: [], dropped: [], reason: 'too many carbs' };
  }
  const out = { ...recipe, title, ingredients, steps, nutrition, adapted: swaps.length > 0 || dropped.length > 0, carbEstimated: carbShrink };
  return { ok: true, recipe: out, swaps, dropped, reason: '' };
}

// ------------------------------------------------------------------ pantry & expiry
export function daysUntil(dateStr, today = new Date()) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d - t) / 86400000);
}

export function isoDate(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function addDays(n, from = new Date()) {
  const d = new Date(from); d.setDate(d.getDate() + n); return isoDate(d);
}

export function defaultExpiry(name, loc) {
  if (loc === 'leftover') return addDays(3);
  if (loc !== 'fridge') return null;
  const n = String(name).toLowerCase();
  const hit = SHELF_LIFE.find(([re]) => re.test(n));
  return hit ? addDays(hit[1]) : null;
}

export function expiringItems(pantry, within = 3) {
  return pantry.map(it => ({ ...it, days: daysUntil(it.expires) }))
    .filter(it => it.days != null && it.days <= within)
    .sort((a, b) => a.days - b.days);
}

// ------------------------------------------------------------------ evaluation & ranking
export function evaluateAll(recipes, ctx) {
  const prepped = prepPantry(ctx.pantry);
  const expiring = prepPantry(expiringItems(ctx.pantry, 3));
  const out = [];
  for (const r of recipes) {
    const ad = adaptRecipe(r, ctx.restr, prepped);
    if (!ad.ok) continue;
    const have = [], missing = [], usesExpiring = [];
    for (const ing of ad.recipe.ingredients) {
      if (ing.optional) continue;
      if (ing.staple && ctx.assumeStaples) { have.push(ing); continue; }
      const hit = findInPantry([ing.name, ...(ing.alts || [])], prepped);
      if (hit) {
        have.push(ing);
        if (expiring.some(e => e.id === hit.id)) usesExpiring.push(hit.name);
      } else missing.push(ing);
    }
    const counted = have.length + missing.length;
    out.push({
      recipe: ad.recipe, swaps: ad.swaps, dropped: ad.dropped, have, missing, usesExpiring,
      coverage: counted ? have.length / counted : 0, pantryHits: have.filter(i => !i.staple).length,
    });
  }
  return out;
}

export function weatherFits(r, mode) {
  if (!mode) return false;
  if (mode === 'cozy') return r.moods.includes('warming') || (r.moods.includes('comfort') && !r.moods.includes('fresh'));
  if (mode === 'hot') return r.moods.includes('fresh') || (r.moods.includes('light') && r.time <= 30);
  return false;
}

export function matchesFilters(ev, f = {}, weatherMode = null) {
  const r = ev.recipe, n = r.nutrition;
  if (f.meal && !r.meal.includes(f.meal)) return false;
  if (f.time === '15' && r.time > 15) return false;
  if (f.time === '30' && r.time > 30) return false;
  if (f.time === 'long' && r.time <= 30) return false;
  if (f.time === 'prep' && !r.mealPrep) return false;
  if (f.mood && !(r.moods.includes(f.mood) || (f.mood === 'light' && n.calories <= 380))) return false;
  if (f.cuisine && r.cuisine !== f.cuisine) return false;
  if (f.goal === 'high-protein' && n.protein < 28) return false;
  if (f.goal === 'muscle' && !(n.protein >= 32 && n.calories >= 500)) return false;
  if (f.goal === 'light' && n.calories > 380) return false;
  if (f.expiring && !ev.usesExpiring.length) return false;
  if (f.weather && !weatherFits(r, weatherMode)) return false;
  return true;
}

export function rank(evals, { weatherMode = null, mealHint = null } = {}) {
  const score = ev => {
    let s = -ev.missing.length * 10 + ev.coverage * 5 + ev.pantryHits * 0.6;
    s += ev.usesExpiring.length * 4;
    if (weatherFits(ev.recipe, weatherMode)) s += 3;
    if (mealHint && ev.recipe.meal.includes(mealHint)) s += 1;
    return s;
  };
  return evals.slice().sort((a, b) => score(b) - score(a));
}

export function groupByMissing(evals) {
  const g = { ready: [], one: [], two: [], more: [] };
  for (const ev of evals) {
    const m = ev.missing.length;
    (m === 0 ? g.ready : m === 1 ? g.one : m === 2 ? g.two : g.more).push(ev);
  }
  return g;
}

export function mealForNow(d = new Date()) {
  const h = d.getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner';
}

// ------------------------------------------------------------------ AI recipe normalisation
export function normalizeAiRecipe(raw, idx = 0) {
  if (!raw || !raw.title || !Array.isArray(raw.ingredients) || !Array.isArray(raw.steps)) return null;
  const nut = raw.nutrition || {};
  const num = v => Math.max(0, Math.round(Number(v) || 0));
  const meal = (Array.isArray(raw.meal) ? raw.meal : [raw.meal]).map(m => String(m).toLowerCase()).filter(m => ['breakfast', 'lunch', 'dinner'].includes(m));
  const id = 'ai-' + String(raw.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + idx;
  return {
    id, ai: true,
    title: String(raw.title).slice(0, 80), emoji: String(raw.emoji || '🍽️').slice(0, 4),
    meal: meal.length ? meal : ['dinner'], cuisine: String(raw.cuisine || 'Home cooking').slice(0, 30),
    time: num(raw.time) || 30, difficulty: ['Easy', 'Medium', 'Hard'].includes(raw.difficulty) ? raw.difficulty : 'Easy',
    servings: num(raw.servings) || 2, mealPrep: !!raw.mealPrep,
    moods: (raw.moods || []).map(String).slice(0, 4),
    steps: raw.steps.map(String).slice(0, 14),
    ingredients: raw.ingredients.slice(0, 24).map(i => {
      const name = String(i.name || '').toLowerCase().trim();
      return { q: String(i.q || ''), name, alts: [], optional: !!i.optional, core: false, staple: STAPLE_RE.test(name), prefer: [] };
    }).filter(i => i.name),
    nutrition: { calories: num(nut.calories), protein: num(nut.protein), carbs: num(nut.carbs), fat: num(nut.fat) },
  };
}

// ------------------------------------------------------------------ leftovers
export function leftoverIdeas(text, restr = NO_RESTRICTIONS) {
  const t = text.toLowerCase();
  const out = [];
  for (const group of LEFTOVER_IDEAS) {
    if (!group.keys.some(k => t.includes(k))) continue;
    for (const idea of group.ideas) {
      const bad = idea.needs.some(n => violates(n, restr.forbid, restr.avoid).length > 0);
      if (!bad) out.push(idea);
    }
  }
  return out;
}

// ------------------------------------------------------------------ offline cooking Q&A
export function localAnswer(q, recipe, restr = NO_RESTRICTIONS) {
  const s = q.toLowerCase();
  const sub = s.match(/(?:instead of|substitute for|replace|replacement for|swap for|alternative to|without)\s+(?:the\s+)?([a-z ]+?)(?:\?|$|\.| in )/);
  if (sub) {
    const item = sub[1].trim();
    const opts = safeSubstitutes(item, restr, 3);
    if (opts.length) return `Instead of ${item}, you could use ${opts.join(', or ')}.`;
    return `I don't have a safe swap for ${item} on file. Check your connection to the AI helper for more ideas.`;
  }
  if (/(done|cooked|ready).*(chicken|turkey)|(chicken|turkey).*(done|cooked|ready)/.test(s)) return 'Chicken is done when the thickest part reaches 74 degrees Celsius, 165 Fahrenheit, and the juices run clear.';
  if (/(done|cooked|ready).*(beef|steak)|(beef|steak).*(done|cooked)/.test(s)) return 'For steak, 54 degrees Celsius is medium rare, 60 is medium and 71 is well done. Ground beef needs 71 degrees, 160 Fahrenheit.';
  if (/(pork)/.test(s)) return 'Pork is done at 63 degrees Celsius, 145 Fahrenheit, with a short rest. Ground pork needs 71 degrees.';
  if (/(salmon|fish)/.test(s)) return 'Fish is done when it turns opaque and flakes easily with a fork, around 63 degrees Celsius.';
  if (/(pasta|spaghetti|noodle)/.test(s) && /(done|ready|al dente)/.test(s)) return 'Taste a piece: al dente pasta is tender with a tiny firm bite in the centre.';
  if (/(rice)/.test(s) && /(done|ready)/.test(s)) return 'Rice is ready when the water is absorbed and the grains are tender. Let it rest covered for five minutes.';
  if (/how long|how much time|total time/.test(s)) return `This recipe takes about ${recipe.time} minutes.`;
  if (/calorie|protein|carb|fat|nutrition/.test(s)) { const n = recipe.nutrition; return `Per serving that's about ${n.calories} calories, ${n.protein} grams of protein, ${n.carbs} grams of carbs and ${n.fat} grams of fat.`; }
  if (/serv/.test(s)) return `It makes about ${recipe.servings} servings.`;
  return "I can answer that with the AI helper once it's connected. For now, try asking for a substitute, like what can I use instead of butter.";
}

// ------------------------------------------------------------------ progress: streaks & badges
export function cookStreak(made, today = new Date()) {
  const days = new Set(made.map(m => isoDate(new Date(m.at))));
  let streak = 0;
  const d = new Date(today);
  if (!days.has(isoDate(d))) d.setDate(d.getDate() - 1); // still alive if you cooked yesterday
  while (days.has(isoDate(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

export function bestCookStreak(made) {
  const days = [...new Set(made.map(m => isoDate(new Date(m.at))))].sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    run = prev && Math.round((new Date(d) - new Date(prev)) / 86400000) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = d;
  }
  return best;
}

/** Update the "no food waste" streak given the current pantry. Mutates and returns stats. */
export function updateWasteStreak(stats, pantry, today = new Date()) {
  const todayIso = isoDate(today);
  if (stats.lastWasteCheck === todayIso) return stats;
  const expired = pantry.some(it => it.expires && daysUntil(it.expires, today) < 0);
  if (expired) { stats.wasteStreak = 0; }
  else if (pantry.length) {
    const gap = stats.lastWasteCheck ? Math.max(1, Math.round((new Date(todayIso) - new Date(stats.lastWasteCheck)) / 86400000)) : 1;
    stats.wasteStreak = (stats.wasteStreak || 0) + Math.min(gap, 30);
  }
  stats.bestWasteStreak = Math.max(stats.bestWasteStreak || 0, stats.wasteStreak || 0);
  stats.lastWasteCheck = todayIso;
  return stats;
}

export const BADGES = [
  { id: 'first', emoji: '🍳', name: 'First Dish', desc: 'Cook your first recipe', test: c => c.made >= 1 },
  { id: 'five', emoji: '🥄', name: 'Getting Cozy', desc: 'Cook 5 recipes', test: c => c.made >= 5 },
  { id: 'twentyfive', emoji: '👩‍🍳', name: 'Home Chef', desc: 'Cook 25 recipes', test: c => c.made >= 25 },
  { id: 'streak3', emoji: '🔥', name: '3-Day Streak', desc: 'Cook 3 days in a row', test: c => c.bestStreak >= 3 },
  { id: 'streak7', emoji: '🌟', name: '7-Day Streak', desc: 'Cook 7 days in a row', test: c => c.bestStreak >= 7 },
  { id: 'waste7', emoji: '🌱', name: '7 Days of No Food Waste', desc: 'Go 7 days without anything expiring', test: c => c.bestWaste >= 7 },
  { id: 'waste30', emoji: '🌍', name: '30 Days Zero Waste', desc: 'Go 30 days without anything expiring', test: c => c.bestWaste >= 30 },
  { id: 'rescuer', emoji: '🦸', name: 'Fridge Rescuer', desc: 'Use up 5 items that were about to expire', test: c => c.rescued >= 5 },
  { id: 'explorer', emoji: '🧭', name: 'World Tour', desc: 'Cook from 5 different cuisines', test: c => c.cuisines >= 5 },
  { id: 'earlybird', emoji: '🌅', name: 'Breakfast Club', desc: 'Make 3 breakfasts', test: c => c.breakfasts >= 3 },
  { id: 'photo', emoji: '📸', name: 'Food Photographer', desc: 'Share 3 dish photos', test: c => c.photos >= 3 },
  { id: 'leftover', emoji: '♻️', name: 'Leftover Legend', desc: 'Cook a dish that used a leftover', test: c => c.leftoverUsed >= 1 },
];

export function badgeContext(made, stats) {
  return {
    made: made.length, bestStreak: bestCookStreak(made), bestWaste: stats.bestWasteStreak || 0,
    rescued: stats.rescued || 0, cuisines: new Set(made.map(m => m.cuisine)).size,
    breakfasts: made.filter(m => (m.meal || []).includes('breakfast') && (m.meal || []).length === 1).length,
    photos: made.filter(m => m.photo || m.shared).length, leftoverUsed: stats.leftoverUsed || 0,
  };
}

export function earnedBadges(made, stats) {
  const ctx = badgeContext(made, stats);
  return BADGES.filter(b => b.test(ctx)).map(b => b.id);
}

// ------------------------------------------------------------------ user-chosen swaps (e.g. "I'll use oat milk")
export function applyUserSubs(ev, map = {}) {
  const entries = Object.entries(map).filter(([from]) => ev.missing.some(m => m.name === from));
  if (!entries.length) return ev;
  let steps = ev.recipe.steps.slice();
  const ingredients = ev.recipe.ingredients.map(i => {
    const to = map[i.name];
    if (!to || !ev.missing.some(m => m.name === i.name)) return i;
    const re = new RegExp('\\b' + escapeRe(i.name) + '(s|es)?\\b', 'gi');
    steps = steps.map(s => s.replace(re, to));
    return { ...i, name: to, alts: [], swappedFrom: i.swappedFrom || i.name, userSwap: true, staple: STAPLE_RE.test(to) };
  });
  const swappedNames = new Set(entries.map(([from]) => from));
  return {
    ...ev,
    recipe: { ...ev.recipe, ingredients, steps },
    have: [...ev.have, ...ingredients.filter(i => i.userSwap)],
    missing: ev.missing.filter(m => !swappedNames.has(m.name)),
  };
}

/** Pantry items a recipe would use up (for "used up?" prompts and rescue stats). */
export function usedPantryItems(recipe, pantry) {
  const prepped = prepPantry(pantry);
  const out = [];
  for (const ing of recipe.ingredients) {
    if (ing.staple) continue;
    const hit = findInPantry([ing.name, ...(ing.alts || [])], prepped);
    if (hit && !out.some(o => o.id === hit.id)) out.push(pantry.find(p => p.id === hit.id));
  }
  return out;
}

export function sameItem(a, b) { return words(a).join(' ') === words(b).join(' '); }
