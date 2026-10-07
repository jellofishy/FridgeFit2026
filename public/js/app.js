// Fridge Fit: app shell, views and actions.
import { state, save, saveNow, uid, activeProfiles, resetAll, hooks, adopt, isPristine, cloudPayload } from './store.js';
import * as auth from './auth.js';
import {
  DIETS, ALLERGIES, LOCATIONS, CATEGORY_EMOJI, COMMON_ITEMS, GREETINGS, MEALS, TIME_FILTERS, MOODS, GOALS, LABEL_REMINDER,
} from './data.js';
import { RECIPES } from './recipes.js';
import {
  buildRestrictions, evaluateAll, matchesFilters, rank, groupByMissing, mealForNow, expiringItems, daysUntil, addDays, isoDate,
  defaultExpiry, safeSubstitutes, applyUserSubs, usedPantryItems, sameItem, normalizeAiRecipe, adaptRecipe, leftoverIdeas,
  cookStreak, updateWasteStreak, BADGES, earnedBadges, badgeContext, bestCookStreak, prepPantry, words, NO_RESTRICTIONS,
} from './engine.js';
import * as api from './api.js';
import { getPosition, fetchWeather, geocode, weatherMode, weatherBlurb, fmtTemp } from './weather.js';
import { resizeToDataUrl, composeShareImage, thumbnail, shareImage } from './share.js';
import { startCooking } from './cook.js';
import { canListen, canSpeak } from './voice.js';
import { $, $$, esc, toast, pushLayer, swapTop, closeTop, topLayer, confirmBox, closeAllLayers, layerCount } from './ui.js';

// ====================================================================== state & helpers
const ui = {
  tab: 'home', stack: [], swapping: false,
  filters: { meal: '', time: '', mood: '', cuisine: '', goal: '', expiring: false, weather: false },
  subUse: {}, scan: null, auth: { mode: 'signin', busy: false, msg: '', err: '', email: '' }, sync: {}, syncedFor: null, showMore: false, health: null, aiBusy: false, greetIdx: 0, finish: null, leftover: { text: '', ideas: null, ai: [], busy: false },
};

const TABS = [
  { id: 'home', label: 'Home', icon: '🏠' }, { id: 'fridge', label: 'Fridge', icon: '🧊' },
  { id: 'recipes', label: 'Recipes', icon: '🍳' }, { id: 'made', label: 'Made', icon: '✅' }, { id: 'me', label: 'Me', icon: '🙂' },
];
const CUISINE_FLAG = { Korean: '🇰🇷', Mexican: '🇲🇽', Italian: '🇮🇹', Indian: '🇮🇳', Uzbek: '🇺🇿', Japanese: '🇯🇵', Thai: '🇹🇭', Chinese: '🇨🇳', Greek: '🇬🇷', French: '🇫🇷', American: '🇺🇸', 'Middle Eastern': '🧆', Mediterranean: '🌊' };
const AVATARS = ['😊', '👩', '👨', '🧒', '👧', '👦', '👵', '👴', '🧑‍🍳', '🐻', '🦊', '🌻'];

const ctx = () => ({ restr: buildRestrictions(activeProfiles()), pantry: state.pantry, assumeStaples: state.settings.staples });
const allRecipes = () => [...RECIPES, ...state.aiRecipes];
const getEvals = () => evaluateAll(allRecipes(), ctx());
const hue = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const today = () => new Date();

function evalOne(id) {
  const rec = allRecipes().find(r => r.id === id);
  if (!rec) return { rec: null };
  const ev = evaluateAll([rec], ctx())[0];
  return { rec, ev: ev ? applyUserSubs(ev, ui.subUse[id] || {}) : null };
}

function restrictionPayload() {
  const ps = activeProfiles();
  return {
    diets: [...new Set(ps.flatMap(p => p.diets.map(d => DIETS.find(x => x.id === d)?.label || d)))],
    allergies: [...new Set(ps.flatMap(p => p.allergies.map(a => ALLERGIES.find(x => x.id === a)?.label || a)))],
    avoid: ps.flatMap(p => String(p.avoid || '').split(',').map(s => s.trim()).filter(Boolean)),
  };
}

function commit() {
  save();
  render();
  repaintTop();
}

// ---- layer plumbing: layers re-render from state whenever it changes
const LAYER_RENDER = {};
function openLayer(kind, arg, opts = {}) {
  const entry = { kind, arg };
  ui.stack.push(entry);
  return pushLayer(LAYER_RENDER[kind](arg), {
    ...opts,
    onClose: () => { ui.stack = ui.stack.filter(s => s !== entry); opts.onClose && opts.onClose(); if (!ui.swapping) repaintTop(); },
  });
}
function repaintTop() {
  const s = ui.stack[ui.stack.length - 1], el = topLayer();
  if (!s || !el || !LAYER_RENDER[s.kind]) return;
  const panel = $('.layer-panel', el);
  const scroll = panel.scrollTop;
  const focusId = document.activeElement && panel.contains(document.activeElement) ? document.activeElement.id : null;
  panel.innerHTML = LAYER_RENDER[s.kind](s.arg);
  panel.scrollTop = scroll;
  if (focusId) { const f = document.getElementById(focusId); f && f.focus(); }
}
function swapLayer(kind, arg, opts = {}) {
  const entry = { kind, arg };
  ui.swapping = true;
  ui.stack.push(entry);
  swapTop(LAYER_RENDER[kind](arg), {
    ...opts,
    onClose: () => { ui.stack = ui.stack.filter(s => s !== entry); opts.onClose && opts.onClose(); if (!ui.swapping) repaintTop(); },
  });
  ui.swapping = false;
}

// ====================================================================== theme
function effectiveTheme() {
  const t = state.settings.theme;
  return t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
}
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  const eff = effectiveTheme();
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = eff === 'dark' ? '#17120f' : '#fff8f2';
  const b = $('#themeBtn'); if (b) { b.textContent = eff === 'dark' ? '☀️' : '🌙'; b.setAttribute('aria-label', eff === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'); }
}

// ====================================================================== shared snippets
function recipeCard(ev, { wide = false } = {}) {
  const r = ev.recipe, m = ev.missing.length;
  const chip = m === 0 ? '<span class="chip ok">✓ Ready to cook</span>'
    : m === 1 ? '<span class="chip warn">1 ingredient away</span>' : `<span class="chip">Missing ${m}</span>`;
  const need = m && m <= 2 ? `<p class="need">Need: ${esc(ev.missing.map(i => i.name).join(', '))}</p>` : '';
  const exp = ev.usesExpiring.length ? `<span class="chip alert">⏰ Uses ${esc(ev.usesExpiring[0])}</span>` : '';
  return `<article class="rcard ${wide ? 'wide' : ''}" tabindex="0" role="button" data-act="open-recipe" data-id="${esc(r.id)}" aria-label="${esc(r.title)}">
    <div class="rhero" style="--h:${hue(r.cuisine)}"><span>${esc(r.emoji)}</span>${r.ai ? '<i class="aibadge">✨ AI</i>' : ''}</div>
    <div class="rbody">
      <h3>${esc(r.title)}</h3>
      <p class="rmeta">⏱ ${r.time} min · ${esc(r.difficulty)} · ${r.nutrition.calories} kcal</p>
      <div class="rtags">${chip}${exp}${ev.swaps.length ? '<span class="chip soft">Adapted</span>' : ''}</div>${need}
    </div></article>`;
}

function itemEmoji(it) {
  if (it.loc === 'spices') return '🧂';
  if (it.loc === 'leftover') return '🍲';
  return CATEGORY_EMOJI[it.category] || (it.loc === 'pantry' ? '🥫' : '🥬');
}

function expiryChip(days) {
  if (days == null) return '';
  if (days < 0) return `<span class="chip bad">Expired ${plural(-days, 'day')} ago</span>`;
  if (days === 0) return '<span class="chip bad">Expires today</span>';
  if (days === 1) return '<span class="chip alert">Tomorrow</span>';
  if (days <= 3) return `<span class="chip alert">In ${days} days</span>`;
  return `<span class="chip soft">${days} days</span>`;
}

const labelNote = () => `<p class="label-note">🏷️ ${esc(LABEL_REMINDER)}</p>`;

function whoLine() {
  const ps = activeProfiles();
  return ps.length === 1 && ps[0].name === 'Me' ? 'you' : ps.map(p => p.name).join(' & ');
}

// ====================================================================== views
function viewHome() {
  const c = ctx(), evs = getEvals(), wm = weatherMode(state.weather), now = mealForNow();
  const exp = expiringItems(state.pantry, 3);
  const streak = cookStreak(state.made);
  const parts = [];

  const first = state.profiles.find(p => state.active.includes(p.id));
  parts.push(`<section class="hero">
    <p class="eyebrow">${esc(today().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }))}</p>
    <h1 class="greet" id="greet" aria-live="polite">${esc(currentGreeting())}</h1>
    <p class="sub">${state.pantry.length ? `We found ideas from ${plural(state.pantry.length, 'ingredient')} for ${esc(whoLine())}.` : 'Show me what you have and I will find something delicious.'}</p>
    <div class="row wrap gap">
      <button class="btn primary" data-act="scan" data-kind="fridge">📷 Scan my fridge</button>
      <button class="btn soft" data-act="scan" data-kind="pantry">🥫 Pantry</button>
      <button class="btn soft" data-act="scan" data-kind="spices">🧂 Spices</button>
    </div>
  </section>`);

  if (state.profiles.length > 1) {
    parts.push(`<section class="block"><h2 class="h">Who's eating?</h2><div class="chips" role="group" aria-label="Who is eating">
      ${state.profiles.map(p => `<button class="pchip ${state.active.includes(p.id) ? 'on' : ''}" data-act="toggle-active" data-id="${p.id}" aria-pressed="${state.active.includes(p.id)}">${esc(p.emoji)} ${esc(p.name)}</button>`).join('')}
    </div><p class="muted small">Meals below work for everyone selected.</p></section>`);
  }
  if (c.restr.labels.length === 0 && !state.seen.profileNudge) {
    parts.push(`<section class="card nudge"><div><h3>Tell me about your diet & allergies</h3><p class="muted">Every recipe will follow them. Add family members too.</p></div><button class="btn primary" data-act="edit-profile" data-id="${first.id}">Set up</button></section>`);
  } else if (c.restr.labels.length) {
    parts.push(`<p class="muted small safe-line">🛡️ Following: ${esc(c.restr.labels.join(' · '))}</p>`);
  }
  if (!state.seen.labelNote) {
    parts.push(`<section class="card note">${labelNote()}<button class="btn ghost small" data-act="dismiss-label">Got it</button></section>`);
  }

  // weather
  parts.push(weatherCard(wm));

  // expiry
  if (exp.length) {
    parts.push(`<section class="card alert-card"><h2 class="h">⏰ Use it before you lose it</h2>
      <div class="chips">${exp.slice(0, 6).map(i => `<span class="chip ${i.days <= 0 ? 'bad' : 'alert'}">${esc(i.name)} · ${i.days < 0 ? 'expired' : i.days === 0 ? 'today' : i.days + 'd'}</span>`).join('')}</div>
      <button class="btn primary small" data-act="use-expiring">Cook with these</button></section>`);
  }

  // near miss
  const near = rank(evs.filter(e => e.missing.length === 1), { weatherMode: wm, mealHint: now })[0];
  if (near && state.pantry.length) {
    parts.push(`<section class="card near"><p>💡 You're only <b>1 ingredient</b> away from <b>${esc(near.recipe.title)}</b>. You need <b>${esc(near.missing[0].name)}</b>.</p>
      <div class="row gap"><button class="btn soft small" data-act="shop-add" data-name="${esc(near.missing[0].name)}">＋ Add to list</button><button class="btn ghost small" data-act="open-recipe" data-id="${esc(near.recipe.id)}">View recipe</button></div></section>`);
  }

  // progress chips
  const stats = state.stats;
  if (streak > 0 || stats.wasteStreak > 1) {
    parts.push(`<div class="chips prog">${streak ? `<span class="chip fire">🔥 ${plural(streak, 'day')} cooking streak</span>` : ''}${stats.wasteStreak > 1 ? `<span class="chip ok">🌱 ${plural(stats.wasteStreak, 'day')} no food waste</span>` : ''}</div>`);
  }

  // meals
  const order = [now, ...MEALS.map(m => m.id).filter(m => m !== now)];
  if (!state.pantry.length) parts.push(`<section class="card empty"><span class="big-emoji">🧺</span><h3>Your fridge is empty here</h3><p class="muted">Scan a photo or add ingredients by hand to see what you can cook. Here are some popular ideas to start:</p></section>`);
  for (const meal of order) {
    const m = MEALS.find(x => x.id === meal);
    let list = rank(evs.filter(e => e.recipe.meal.includes(meal)), { weatherMode: wm, mealHint: meal });
    if (state.pantry.length) list = list.filter(e => e.missing.length <= 2);
    list = list.slice(0, 8);
    parts.push(`<section class="block"><div class="row between"><h2 class="h">${m.emoji} ${m.label}${meal === now ? ' <span class="chip soft">now</span>' : ''}</h2><button class="link" data-act="see-all" data-meal="${meal}">See all</button></div>
      ${list.length ? `<div class="hscroll">${list.map(e => recipeCard(e)).join('')}</div>` : `<p class="muted small">Nothing close yet. Add a few more ingredients, or loosen a filter.</p>`}</section>`);
  }
  return parts.join('');
}

function weatherCard(wm) {
  const w = state.weather, loc = state.settings.loc;
  if (!loc) {
    return `<section class="card weather"><div><h3>🌦️ Weather-smart recipes</h3><p class="muted">Warm soups when it's cold, fresh and light when it's hot. Uses your location only to check the weather.</p></div>
      <div class="row gap wrap"><button class="btn soft small" data-act="locate">📍 Use my location</button>
      <form class="inline" data-form="city"><input id="cityIn" placeholder="or type a city" aria-label="City"><button class="btn ghost small" type="submit">Go</button></form></div></section>`;
  }
  if (!w) return `<section class="card weather"><p class="muted">Checking the weather…</p></section>`;
  const b = weatherBlurb(w, state.settings.units);
  return `<section class="card weather"><div class="wx"><span class="wx-e">${b.emoji}</span><div><h3>${esc(loc.place || 'Your area')} · ${fmtTemp(w.tempC, state.settings.units)}</h3><p>${esc(b.text)}</p></div></div>
    ${b.chip ? `<button class="btn soft small" data-act="weather-picks">See ${esc(b.chip.toLowerCase())}</button>` : ''}</section>`;
}

function viewFridge() {
  const groups = LOCATIONS.map(l => {
    const items = state.pantry.filter(p => p.loc === l.id).sort((a, b) => (a.expires || '9999').localeCompare(b.expires || '9999') || a.name.localeCompare(b.name));
    return { l, items };
  });
  const quick = COMMON_ITEMS.filter(n => !state.pantry.some(p => sameItem(p.name, n))).slice(0, 10);
  return `<section class="block"><h1 class="title">Your kitchen</h1><p class="muted">Scan with your camera, or add things by hand. Tap a date to set when it expires.</p>
    <div class="scan-grid">
      <button class="scan-card" data-act="scan" data-kind="fridge"><span>🧊</span>Scan fridge</button>
      <button class="scan-card" data-act="scan" data-kind="pantry"><span>🥫</span>Scan pantry</button>
      <button class="scan-card" data-act="scan" data-kind="spices"><span>🧂</span>Scan spices</button>
      <button class="scan-card" data-act="scan" data-kind="leftovers"><span>🍲</span>Scan leftovers</button>
    </div>
    ${labelNote()}
    <form class="add-form" data-form="add-item" autocomplete="off">
      <input id="addItem" placeholder="Add an ingredient, e.g. spinach" aria-label="Add an ingredient" enterkeyhint="done">
      <select id="addLoc" aria-label="Where is it?">${LOCATIONS.map(l => `<option value="${l.id}">${l.emoji} ${l.label}</option>`).join('')}</select>
      <button class="btn primary" type="submit">Add</button>
    </form>
    ${quick.length ? `<div class="chips quick">${quick.map(n => `<button class="chip btnchip" data-act="add-common" data-name="${esc(n)}">＋ ${esc(n)}</button>`).join('')}</div>` : ''}
  </section>
  <section class="block"><div class="row between"><h2 class="h">🍲 Leftovers</h2><button class="btn soft small" data-act="leftover-ideas">💡 Ideas for leftovers</button></div>
    <form class="add-form" data-form="add-leftover" autocomplete="off"><input id="addLeft" placeholder="I have leftover… (rice, roast chicken)" aria-label="Add a leftover"><button class="btn soft" type="submit">Add</button></form></section>
  ${groups.map(({ l, items }) => `<section class="block"><h2 class="h">${l.emoji} ${l.label} <span class="count">${items.length}</span></h2>
    ${items.length ? `<ul class="items">${items.map(it => itemRow(it)).join('')}</ul>` : `<p class="muted small">Nothing here yet.</p>`}</section>`).join('')}
  ${state.pantry.length ? '<div class="center"><button class="link danger" data-act="clear-pantry">Clear everything</button></div>' : ''}`;
}

function itemRow(it) {
  const d = daysUntil(it.expires);
  return `<li class="item"><span class="ie">${itemEmoji(it)}</span><div class="in"><b>${esc(it.name)}</b>${expiryChip(d)}</div>
    <label class="date"><span class="sr">Expiry date for ${esc(it.name)}</span><input type="date" value="${esc(it.expires || '')}" data-change="expiry" data-id="${it.id}"></label>
    <button class="icon-btn small" data-act="remove-item" data-id="${it.id}" aria-label="Remove ${esc(it.name)}">✕</button></li>`;
}

function cuisineList() {
  const set = new Set(allRecipes().map(r => r.cuisine));
  const pri = ['Korean', 'Mexican', 'Italian', 'Indian', 'Uzbek', 'Japanese', 'Thai', 'Chinese', 'Greek', 'French', 'Middle Eastern', 'American'];
  return [...pri.filter(p => set.has(p)), ...[...set].filter(c => !pri.includes(c)).sort()];
}

function filterChips(key, items, { allLabel = 'Any' } = {}) {
  const cur = ui.filters[key];
  return `<button class="fchip ${!cur ? 'on' : ''}" data-act="filter" data-key="${key}" data-val="">${allLabel}</button>` +
    items.map(i => `<button class="fchip ${cur === i.id ? 'on' : ''}" data-act="filter" data-key="${key}" data-val="${esc(i.id)}" aria-pressed="${cur === i.id}">${i.emoji ? i.emoji + ' ' : ''}${esc(i.label)}</button>`).join('');
}

function viewRecipes() {
  const f = ui.filters, wm = weatherMode(state.weather);
  const evs = getEvals();
  const expiringAny = expiringItems(state.pantry, 3).length > 0;
  const filtered = rank(evs.filter(e => matchesFilters(e, f, wm)), { weatherMode: wm, mealHint: f.meal });
  const g = groupByMissing(filtered);
  const active = Object.entries(f).some(([k, v]) => v);
  const cuisines = cuisineList();
  const customCuisine = f.cuisine && !cuisines.includes(f.cuisine);

  const section = (title, list, hint = '') => list.length ? `<section class="block"><h2 class="h">${title} <span class="count">${list.length}</span></h2>${hint}<div class="grid">${list.map(e => recipeCard(e, { wide: true })).join('')}</div></section>` : '';

  return `<section class="block"><h1 class="title">Recipes</h1>
    <div class="filters">
      <div class="fgroup" role="group" aria-label="Meal"><span class="flabel">Meal</span><div class="fscroll">${filterChips('meal', MEALS, { allLabel: 'All' })}</div></div>
      <div class="fgroup" role="group" aria-label="Time"><span class="flabel">Time</span><div class="fscroll">${filterChips('time', TIME_FILTERS)}</div></div>
      <div class="fgroup" role="group" aria-label="Mood"><span class="flabel">Mood</span><div class="fscroll">${filterChips('mood', MOODS)}</div></div>
      <div class="fgroup" role="group" aria-label="Fitness goal"><span class="flabel">Goal</span><div class="fscroll">${filterChips('goal', GOALS)}</div></div>
      <div class="fgroup" role="group" aria-label="Cuisine explorer"><span class="flabel">Cuisine</span><div class="fscroll">${filterChips('cuisine', cuisines.map(c => ({ id: c, label: c, emoji: CUISINE_FLAG[c] || '🌍' })), { allLabel: '🌍 All' })}${customCuisine ? `<button class="fchip on" data-act="filter" data-key="cuisine" data-val="">🌍 ${esc(f.cuisine)} ✕</button>` : ''}</div></div>
      <form class="inline" data-form="cuisine"><input id="cuisineIn" list="cuisineList" placeholder="Explore another cuisine (Ethiopian, Peruvian…)" aria-label="Another cuisine"><datalist id="cuisineList">${['Ethiopian', 'Peruvian', 'Vietnamese', 'Turkish', 'Moroccan', 'Spanish', 'Georgian', 'Lebanese', 'Filipino', 'Brazilian', 'Caribbean', 'Russian'].map(c => `<option value="${c}">`).join('')}</datalist><button class="btn ghost small" type="submit">Go</button></form>
      <div class="chips toggles">
        ${wm ? `<button class="fchip ${f.weather ? 'on' : ''}" data-act="filter-toggle" data-key="weather">${wm === 'cozy' ? '🌧️ Cozy for today' : '☀️ Cool for today'}</button>` : ''}
        ${expiringAny ? `<button class="fchip ${f.expiring ? 'on' : ''}" data-act="filter-toggle" data-key="expiring">⏰ Use it up</button>` : ''}
        ${active ? '<button class="fchip clear" data-act="clear-filters">Clear filters</button>' : ''}
      </div>
    </div></section>
    ${filtered.length === 0 ? `<section class="card empty"><span class="big-emoji">🤔</span><h3>No matches</h3><p class="muted">Nothing fits all your filters and everyone's diet. Try clearing a filter, adding ingredients, or ask the AI chef below.</p></section>` : ''}
    ${section('✓ Ready to cook', g.ready)}
    ${section('💡 1 ingredient away', g.one)}
    ${section('2 ingredients away', g.two)}
    ${g.more.length ? `<section class="block"><button class="link" data-act="toggle-more">${ui.showMore ? 'Hide' : 'Show'} ${g.more.length} more recipes that need shopping</button>${ui.showMore ? `<div class="grid">${g.more.map(e => recipeCard(e, { wide: true })).join('')}</div>` : ''}</section>` : ''}
    <section class="card ai-card"><h3>✨ Want more ideas?</h3><p class="muted">Ask the AI chef to invent new recipes from your ingredients that respect ${esc(whoLine() === 'you' ? 'your' : "everyone's")} diet and allergies${f.cuisine ? ` — in a ${esc(f.cuisine)} style` : ''}.</p>
      <button class="btn primary" data-act="ai-more" ${ui.aiBusy ? 'disabled' : ''}>${ui.aiBusy ? 'Cooking up ideas…' : '✨ Get AI recipes'}</button></section>`;
}

function viewMade() {
  const made = state.made.slice().sort((a, b) => b.at.localeCompare(a.at));
  const streak = cookStreak(state.made), earned = new Set(earnedBadges(state.made, state.stats));
  const counts = {}; state.made.forEach(m => { counts[m.recipeId] = (counts[m.recipeId] || 0) + 1; });
  const cx = badgeContext(state.made, state.stats);
  return `<section class="block"><h1 class="title">Made</h1>
    <div class="stat-row">
      <div class="stat"><b>${state.made.length}</b><span>dishes made</span></div>
      <div class="stat fire"><b>🔥 ${streak}</b><span>day streak</span></div>
      <div class="stat leaf"><b>🌱 ${state.stats.wasteStreak || 0}</b><span>days no waste</span></div>
    </div></section>
    <section class="block"><h2 class="h">🏅 Badges <span class="count">${earned.size}/${BADGES.length}</span></h2>
      <div class="badges">${BADGES.map(b => `<div class="badge ${earned.has(b.id) ? 'got' : ''}" title="${esc(b.desc)}"><span>${b.emoji}</span><b>${esc(b.name)}</b><small>${earned.has(b.id) ? 'Earned!' : esc(b.desc)}</small></div>`).join('')}</div></section>
    <section class="block"><h2 class="h">Everything you've cooked</h2>
    ${made.length ? `<ul class="made-list">${made.map(m => `<li class="made-item">
      <div class="mthumb" style="--h:${hue(m.cuisine || m.title)}">${m.photo ? `<img src="${m.photo}" alt="Photo of ${esc(m.title)}">` : `<span>${esc(m.emoji)}</span>`}</div>
      <div class="minfo"><b>${esc(m.title)}</b><small>${esc(whenLabel(m.at))}${counts[m.recipeId] > 1 ? ` · made ${counts[m.recipeId]}×` : ''}</small>
        <div class="row gap"><button class="btn soft small" data-act="open-recipe" data-id="${esc(m.recipeId)}">Cook again</button><button class="link danger small" data-act="remove-made" data-id="${m.id}">Remove</button></div></div></li>`).join('')}</ul>`
    : `<div class="card empty"><span class="big-emoji">🍽️</span><h3>Nothing here yet</h3><p class="muted">Finish a recipe and tap the ✓ checkmark. It will show up here so you can cook your favorites again.</p><button class="btn primary" data-act="nav" data-tab="recipes">Find a recipe</button></div>`}</section>`;
}

function whenLabel(iso) {
  const d = new Date(iso), diff = daysUntil(isoDate(d), today());
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (diff === 0) return `Today, ${time}`;
  if (diff === -1) return `Yesterday, ${time}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === today().getFullYear() ? undefined : 'numeric' });
}

function viewMe() {
  const s = state.settings, openCount = state.shopping.filter(i => !i.done).length;
  const health = ui.health;
  return `<section class="block"><h1 class="title">Me</h1>
    ${accountCard()}
    <h2 class="h">Profiles <span class="count">${state.profiles.length}</span></h2>
    <p class="muted small">Save each person's diet and allergies. Pick who's eating on the Home tab and recipes will work for everyone.</p>
    <ul class="profiles">${state.profiles.map(p => `<li class="pcard"><span class="pav">${esc(p.emoji)}</span><div class="pinfo"><b>${esc(p.name)}</b>
      <div class="chips">${[...p.diets.map(d => DIETS.find(x => x.id === d)?.label), ...p.allergies.map(a => (ALLERGIES.find(x => x.id === a)?.label || a) + ' allergy'), ...(p.avoid ? [`Avoids ${p.avoid}`] : [])].filter(Boolean).map(l => `<span class="chip soft">${esc(l)}</span>`).join('') || '<span class="muted small">No restrictions</span>'}</div></div>
      <button class="btn ghost small" data-act="edit-profile" data-id="${p.id}">Edit</button></li>`).join('')}</ul>
    <button class="btn soft" data-act="edit-profile" data-id="new">＋ Add a person</button>${labelNote()}</section>
  <section class="block"><h2 class="h">🛒 Shopping list</h2><button class="btn soft" data-act="open-shopping">Open list${openCount ? ` (${openCount})` : ''}</button></section>
  <section class="block"><h2 class="h">Settings</h2>
    <div class="card settings">
      <div class="srow"><span>Theme</span><div class="seg" role="group" aria-label="Theme">${['auto', 'light', 'dark'].map(t => `<button class="${s.theme === t ? 'on' : ''}" data-act="set-theme" data-val="${t}" aria-pressed="${s.theme === t}">${t === 'auto' ? 'Auto' : t === 'light' ? '☀️ Light' : '🌙 Dark'}</button>`).join('')}</div></div>
      <label class="srow"><span>Assume salt, pepper, oil & water<small>So they don't show up as missing</small></span><input type="checkbox" class="switch" data-change="setting" data-key="staples" ${s.staples ? 'checked' : ''}></label>
      <div class="srow"><span>Temperature</span><div class="seg"><button class="${s.units === 'C' ? 'on' : ''}" data-act="set-units" data-val="C">°C</button><button class="${s.units === 'F' ? 'on' : ''}" data-act="set-units" data-val="F">°F</button></div></div>
      <label class="srow"><span>Read steps aloud<small>${canSpeak ? 'Cooking mode speaks each step' : 'Not supported in this browser'}</small></span><input type="checkbox" class="switch" data-change="setting" data-key="speak" ${s.speak ? 'checked' : ''} ${canSpeak ? '' : 'disabled'}></label>
      <label class="srow"><span>Hands-free listening<small>${canListen ? 'Listen for “next” and questions while cooking' : 'Voice input needs Chrome, Edge or Safari'}</small></span><input type="checkbox" class="switch" data-change="setting" data-key="handsFree" ${s.handsFree ? 'checked' : ''} ${canListen ? '' : 'disabled'}></label>
      <label class="srow col"><span>Voice speed <small>${s.rate.toFixed(1)}×</small></span><input type="range" min="0.7" max="1.4" step="0.1" value="${s.rate}" data-change="rate" aria-label="Voice speed"></label>
      <label class="srow"><span>Expiry reminders<small>Notifies you when the app is open</small></span><input type="checkbox" class="switch" data-change="notify" ${s.notify ? 'checked' : ''}></label>
      <div class="srow col"><span>Location (for weather)<small>${s.loc ? esc(s.loc.place || 'Saved') : 'Not set'}</small></span>
        <div class="row gap wrap"><button class="btn soft small" data-act="locate">📍 Use my location</button>${s.loc ? '<button class="btn ghost small" data-act="clear-location">Remove</button>' : ''}</div>
        <form class="inline" data-form="city"><input id="cityIn2" placeholder="or type a city" aria-label="City"><button class="btn ghost small" type="submit">Set</button></form></div>
      <div class="srow col"><span>AI helper<small>${health == null ? 'Checking…' : health.ai ? '✅ Connected (photo scanning, AI recipes, spoken answers)' : '⚠️ Not set up. Scanning and AI answers need an API key in Netlify. The built-in recipes still work.'}</small></span>
        ${health && health.accessCodeRequired ? `<input id="accessCode" type="password" placeholder="Access code" value="${esc(s.accessCode)}" data-change="access" aria-label="Access code">` : ''}</div>
    </div></section>
  <section class="block"><h2 class="h">Your data</h2><p class="muted small">Everything is saved in this browser only. No account needed.</p>
    <div class="row gap wrap"><button class="btn ghost small" data-act="export">⬇️ Export backup</button><button class="btn ghost small danger" data-act="reset">Reset everything</button></div>
    <p class="muted small center">Fridge Fit · made with 🧡</p></section>`;
}

function accountCard() {
  const u = auth.currentUser();
  if (!u) {
    return `<div class="card account"><h3>☁️ Account</h3><p class="muted">Sign in to keep your profiles, kitchen and Made list safe and synced across your devices.</p>
      <button class="btn primary" data-act="open-auth">Sign in or create account</button></div>`;
  }
  const name = auth.accountName(u), age = u.user_metadata?.age, sy = ui.sync;
  return `<div class="card account"><div class="acct-head"><span class="acct-av" aria-hidden="true">${esc((name || u.email || '?')[0].toUpperCase())}</span>
      <div class="acct-who"><h3>${name ? esc(name) : 'Welcome!'}</h3><p class="muted small">${esc(u.email)}${age ? ` · age ${esc(age)}` : ''}</p></div>
      <button class="btn ghost small" data-act="edit-account">${name ? 'Edit' : 'Add your name'}</button></div>
    <p class="${sy.err ? 'warn-text' : 'muted'} small" role="status">${esc(sy.status || 'Signed in')}${sy.at && !sy.err ? ' · ' + new Date(sy.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''}</p>
    <div class="row gap wrap"><button class="btn soft small" data-act="sync-now">🔄 Sync now</button><button class="btn ghost small" data-act="sign-out">Sign out</button><button class="link danger small" data-act="sign-out-clear">Sign out & clear this device</button></div></div>`;
}

const VIEWS = { home: viewHome, fridge: viewFridge, recipes: viewRecipes, made: viewMade, me: viewMe };

function render() {
  const v = $('#view');
  v.innerHTML = VIEWS[ui.tab]();
  $$('#tabbar button').forEach(b => { const on = b.dataset.tab === ui.tab; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  const open = state.shopping.filter(i => !i.done).length;
  const badge = $('#shopBadge'); badge.textContent = open; badge.hidden = !open;
  const ab = $('#accountBtn');
  if (ab) {
    const u = auth.currentUser();
    ab.textContent = u ? (auth.accountName(u) || u.email || '?')[0].toUpperCase() : '👤';
    ab.classList.toggle('in', !!u);
    ab.setAttribute('aria-label', u ? `Account: ${auth.accountName(u) || u.email}` : 'Account: sign in');
  }
  applyTheme();
}

function go(tab, { scroll = true } = {}) {
  ui.tab = tab;
  history.replaceState(null, '', '#' + tab);
  render();
  if (scroll) window.scrollTo({ top: 0 });
  if (tab === 'home') startGreeting(); else stopGreeting();
}

// ====================================================================== greeting
const prefixByHour = () => {
  const h = new Date().getHours();
  return h < 11 ? ['Good morning, sunshine ☀️', 'Rise and dine'] : h < 17 ? ['Lunchtime, lovely'] : ['Good evening, chef 🌙', 'Dinner time, gorgeous'];
};
let greetings = [], greetTimer = null;
function currentGreeting() { return greetings[ui.greetIdx % greetings.length]; }
function shuffleGreetings() {
  greetings = [...GREETINGS, ...prefixByHour()].sort(() => Math.random() - 0.5);
  const name = auth.accountName() || (state.profiles.length === 1 ? state.profiles[0]?.name : '');
  if (name && name !== 'Me') greetings.push(`Hi ${name}`, `Hey ${name}, what's cooking?`, `Hungry, ${name}?`);
  ui.greetIdx = 0;
}
function startGreeting() {
  stopGreeting();
  greetTimer = setInterval(() => {
    const el = $('#greet'); if (!el) return stopGreeting();
    el.classList.add('fade');
    setTimeout(() => { ui.greetIdx++; el.textContent = currentGreeting(); el.classList.remove('fade'); }, 350);
  }, 5000);
}
function stopGreeting() { clearInterval(greetTimer); greetTimer = null; }

// ====================================================================== pantry helpers
function addPantryItem(name, loc, expires, category) {
  name = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!name) return false;
  const dup = state.pantry.find(p => p.loc === loc && sameItem(p.name, name));
  if (dup) { if (expires) dup.expires = expires; return false; }
  state.pantry.push({ id: uid(), name, loc, category: category || null, expires: expires === undefined ? defaultExpiry(name, loc) : expires, addedAt: Date.now() });
  return true;
}

// ====================================================================== layers: recipe
LAYER_RENDER.recipe = id => {
  const { rec, ev } = evalOne(id);
  const head = `<div class="sheet-head"><button class="icon-btn" data-act="close-layer" aria-label="Close">←</button></div>`;
  if (!rec) return `${head}<div class="pad"><h2>Recipe not found</h2><p class="muted">It may have been removed.</p></div>`;
  if (!ev) {
    const why = adaptRecipe(rec, buildRestrictions(activeProfiles())).reason;
    return `${head}<div class="pad"><h2>${esc(rec.emoji)} ${esc(rec.title)}</h2><p class="warn-box">🛡️ This recipe doesn't fit everyone you're cooking for right now${why ? ` (${esc(why)})` : ''}. Change who's eating on the Home tab to see it.</p></div>`;
  }
  const r = ev.recipe, n = r.nutrition, m = ev.missing.length, restr = buildRestrictions(activeProfiles());
  const banner = m === 0 ? `<div class="banner ok">✓ You have everything. Let's cook!</div>`
    : `<div class="banner warn">You're only <b>${plural(m, 'ingredient')}</b> away from <b>${esc(r.title)}</b>.${m <= 2 ? ` Missing: ${esc(ev.missing.map(i => i.name).join(', '))}.` : ''}</div>`;
  const swaps = [...ev.swaps.map(s => `${esc(s.from)} → <b>${esc(s.to)}</b>`), ...ev.dropped.map(d => `skip the optional ${esc(d)}`)];
  const subs = ui.subUse[id] || {};
  const userSwaps = Object.entries(subs).map(([f, t]) => `${esc(f)} → <b>${esc(t)}</b>`);
  const ingRow = ing => {
    const miss = ev.missing.some(x => x.name === ing.name) && !ing.userSwap;
    const opts = miss ? safeSubstitutes(ing.name, restr, 3) : [];
    const pre = prepPantry(state.pantry);
    const have = opts.filter(o => pre.some(p => p.w.join(' ') === words(o).join(' ')));
    return `<li class="ing ${miss ? 'miss' : 'have'}"><span class="mark">${miss ? '✗' : '✓'}</span><div class="ing-t"><span><b>${esc(ing.q)}</b> ${esc(ing.name)}${ing.optional ? ' <em>(optional)</em>' : ''}${ing.swappedFrom ? ` <small class="muted">(instead of ${esc(ing.swappedFrom)})</small>` : ''}</span>
      ${miss ? `<div class="ing-actions"><button class="chip btnchip" data-act="shop-add" data-name="${esc(ing.name)}">＋ shopping list</button></div>
      ${opts.length ? `<div class="subs">No ${esc(ing.name)}? Safe swaps: ${opts.map(o => have.includes(o) ? `<button class="chip ok btnchip" data-act="use-sub" data-id="${esc(id)}" data-from="${esc(ing.name)}" data-to="${esc(o)}">use my ${esc(o)}</button>` : `<span class="chip soft">${esc(o)}</span>`).join(' ')}</div>` : ''}` : ''}</div></li>`;
  };
  const needsRestr = restr.labels.length > 0;
  return `${head}
  <div class="rhero big" style="--h:${hue(r.cuisine)}"><span>${esc(r.emoji)}</span>${r.ai ? '<i class="aibadge">✨ AI</i>' : ''}</div>
  <div class="pad">
    <h2 class="rtitle">${esc(r.title)}</h2>
    <p class="meta-row"><span>⏱ ${r.time} min</span><span>🔪 ${esc(r.difficulty)}</span><span>🍽 ${plural(r.servings, 'serving')}</span><span>${CUISINE_FLAG[r.cuisine] || '🌍'} ${esc(r.cuisine)}</span></p>
    ${banner}
    ${needsRestr ? `<p class="safe-box">🛡️ Follows: ${esc(restr.labels.join(', '))}${state.active.length > 1 ? `<br><small>Works for ${esc(whoLine())}</small>` : ''}</p>` : ''}
    ${swaps.length || userSwaps.length ? `<p class="adapt-box">🔁 Adapted for you: ${[...swaps, ...userSwaps].join(' · ')}</p>` : ''}
    <div class="nutri" role="group" aria-label="Nutrition per serving">
      <div><b>${n.calories}</b><span>kcal</span></div><div><b>${n.protein}g</b><span>protein</span></div><div><b>${n.carbs}g</b><span>carbs</span></div><div><b>${n.fat}g</b><span>fat</span></div>
    </div>
    <p class="muted small center">Per serving${r.carbEstimated ? ' · estimated after swaps' : ''}</p>
    <div class="row gap wrap actions">
      <button class="btn primary grow" data-act="start-cook" data-id="${esc(id)}">🎤 Start cooking</button>
      <button class="btn soft check" data-act="mark-made" data-id="${esc(id)}" aria-label="Mark as made">✓ Made it</button>
    </div>
    <h3 class="h">Ingredients</h3>
    ${m ? `<button class="btn soft small" data-act="shop-add-missing" data-id="${esc(id)}">＋ Add all ${m} missing to shopping list</button>` : ''}
    <ul class="ings">${r.ingredients.map(ingRow).join('')}</ul>
    <h3 class="h">Steps</h3>
    <ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    ${labelNote()}
  </div>`;
};

// ====================================================================== layers: shopping
LAYER_RENDER.shopping = () => {
  const items = state.shopping;
  const done = items.filter(i => i.done).length;
  return `<div class="sheet-head"><button class="icon-btn" data-act="close-layer" aria-label="Close">←</button><h2>🛒 Shopping list</h2></div>
  <div class="pad">
    <form class="add-form" data-form="shop-add" autocomplete="off"><input id="shopIn" placeholder="Add an item" aria-label="Add an item" enterkeyhint="done"><button class="btn primary" type="submit">Add</button></form>
    ${items.length ? `<ul class="shop">${items.map(i => `<li class="${i.done ? 'done' : ''}"><label><input type="checkbox" data-change="shop-toggle" data-id="${i.id}" ${i.done ? 'checked' : ''}><span>${esc(i.name)}</span></label><button class="icon-btn small" data-act="shop-remove" data-id="${i.id}" aria-label="Remove ${esc(i.name)}">✕</button></li>`).join('')}</ul>`
    : '<div class="card empty"><span class="big-emoji">🛒</span><p class="muted">Your list is empty. Missing ingredients from recipes can be added with one tap.</p></div>'}
    <div class="row gap wrap">
      ${done ? `<button class="btn primary small" data-act="shop-to-fridge">🧊 Move ${done} bought to my kitchen</button><button class="btn ghost small" data-act="shop-clear">Clear checked</button>` : ''}
      ${items.length ? '<button class="btn ghost small" data-act="shop-share">📤 Share list</button>' : ''}
    </div>
  </div>`;
};

// ====================================================================== layers: profile editor
LAYER_RENDER.profile = arg => {
  const p = arg.draft;
  const chip = (list, key) => list.map(i => `<button type="button" class="fchip ${p[key].includes(i.id) ? 'on' : ''}" data-act="pf-toggle" data-key="${key}" data-id="${i.id}" aria-pressed="${p[key].includes(i.id)}">${i.emoji} ${esc(i.label)}</button>`).join('');
  return `<div class="sheet-head"><button class="icon-btn" data-act="close-layer" aria-label="Close">←</button><h2>${arg.isNew ? 'Add a person' : 'Edit profile'}</h2></div>
  <div class="pad">
    <div class="avatars" role="group" aria-label="Avatar">${AVATARS.map(a => `<button type="button" class="av ${p.emoji === a ? 'on' : ''}" data-act="pf-avatar" data-val="${a}" aria-label="Avatar ${a}">${a}</button>`).join('')}</div>
    <label class="field"><span>Name</span><input id="pfName" value="${esc(p.name)}" maxlength="24" placeholder="e.g. Mia" data-change="pf-name"></label>
    <h3 class="h">Diet</h3><div class="chips wrapchips">${chip(DIETS, 'diets')}</div>
    <h3 class="h">Allergies</h3><div class="chips wrapchips">${chip(ALLERGIES, 'allergies')}</div>
    <label class="field"><span>Also avoid (comma separated)</span><input id="pfAvoid" value="${esc(p.avoid)}" placeholder="e.g. mushrooms, coriander, mustard" data-change="pf-avoid"></label>
    ${labelNote()}
    <div class="row gap wrap">
      <button class="btn primary grow" data-act="pf-save">Save</button>
      ${!arg.isNew && state.profiles.length > 1 ? '<button class="btn ghost danger" data-act="pf-delete">Delete</button>' : ''}
    </div>
  </div>`;
};

// ====================================================================== layers: account
LAYER_RENDER.auth = () => {
  const a = ui.auth, m = a.mode;
  const title = m === 'signup' ? 'Create your account' : m === 'reset' ? 'Reset your password' : 'Welcome back';
  return `<div class="sheet-head"><button class="icon-btn" data-act="close-layer" aria-label="Close">←</button><h2>${title}</h2></div>
  <div class="pad">
    ${m !== 'reset' ? `<button class="btn apple wide" type="button" data-act="apple-signin"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg> Continue with Apple</button><p class="or"><span>or use email</span></p>` : ''}
    ${m !== 'reset' ? `<div class="seg wide-seg" role="group" aria-label="Sign in or create account"><button class="${m === 'signin' ? 'on' : ''}" data-act="auth-mode" data-val="signin">Sign in</button><button class="${m === 'signup' ? 'on' : ''}" data-act="auth-mode" data-val="signup">Create account</button></div>` : '<p class="muted">Enter your email and we\'ll send you a link to choose a new password.</p>'}
    <form data-form="auth" autocomplete="on" novalidate>
      <label class="field"><span>Email</span><input id="authEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="none" required value="${esc(a.email)}" placeholder="you@example.com"></label>
      ${m === 'signup' ? `<label class="field"><span>Your name (optional)</span><input id="authName" autocomplete="given-name" maxlength="40" value="${esc(a.name || '')}" placeholder="What should we call you?"></label>` : ''}
      ${m !== 'reset' ? `<label class="field"><span>Password${m === 'signup' ? ' (8+ characters)' : ''}</span><input id="authPw" type="password" autocomplete="${m === 'signup' ? 'new-password' : 'current-password'}" minlength="8" required></label>` : ''}
      ${a.err ? `<p class="warn-box" role="alert">${esc(a.err)}</p>` : ''}${a.msg ? `<p class="safe-box" role="status">${esc(a.msg)}</p>` : ''}
      <button class="btn primary wide" type="submit" ${a.busy ? 'disabled' : ''}>${a.busy ? 'One moment…' : m === 'signup' ? 'Create account' : m === 'reset' ? 'Send reset link' : 'Sign in'}</button>
    </form>
    <div class="center">${m === 'signin' ? '<button class="link" data-act="auth-mode" data-val="reset">Forgot your password?</button>' : m === 'reset' ? '<button class="link" data-act="auth-mode" data-val="signin">Back to sign in</button>' : ''}</div>
    <p class="muted small center">We only use your email to sign you in. Your profiles and history sync to your account so you can use them on any device.</p>
  </div>`;
};

LAYER_RENDER.account = () => {
  const u = auth.currentUser(), a = ui.auth;
  return `<div class="sheet-head"><button class="icon-btn" data-act="close-layer" aria-label="Close">←</button><h2>Your details</h2></div>
  <div class="pad"><form data-form="account" novalidate>
    <label class="field"><span>Your name</span><input id="acctName" value="${esc(auth.accountName(u))}" maxlength="40" autocomplete="given-name" placeholder="What should we call you?"></label>
    <label class="field"><span>Age (optional)</span><input id="acctAge" type="number" inputmode="numeric" min="1" max="120" value="${esc(u?.user_metadata?.age ?? '')}" placeholder="e.g. 28"></label>
    <label class="field"><span>Email</span><input value="${esc(u?.email || '')}" disabled></label>
    ${a.err ? `<p class="warn-box" role="alert">${esc(a.err)}</p>` : ''}
    <button class="btn primary wide" type="submit" ${a.busy ? 'disabled' : ''}>${a.busy ? 'Saving…' : 'Save'}</button>
  </form><p class="muted small center">Your name is used to greet you. Age is optional and only stored in your account.</p></div>`;
};

LAYER_RENDER.newpass = () => `<div class="sheet-head"><h2>Choose a new password</h2></div>
  <div class="pad"><form data-form="newpass"><label class="field"><span>New password (8+ characters)</span><input id="newPw" type="password" autocomplete="new-password" minlength="8" required></label>
  ${ui.auth.err ? `<p class="warn-box" role="alert">${esc(ui.auth.err)}</p>` : ''}<button class="btn primary wide" type="submit">Save password</button></form></div>`;

// ====================================================================== layers: scan
LAYER_RENDER.scanpick = kind => `<div class="sheet-head"><button class="icon-btn" data-act="close-layer" aria-label="Close">←</button><h2>Scan your ${kind === 'spices' ? 'spice rack' : kind === 'leftovers' ? 'leftovers' : kind}</h2></div>
  <div class="pad center"><p class="muted">Take a clear, well-lit photo. Open the door wide and hold steady. You can review everything before it's added.</p>
  <div class="col gap"><button class="btn primary big" data-act="pick-photo" data-mode="camera" data-kind="${kind}">📷 Take a photo</button><button class="btn soft big" data-act="pick-photo" data-mode="gallery" data-kind="${kind}">🖼️ Choose from my photos</button></div>
  ${labelNote()}</div>`;

LAYER_RENDER.scan = () => {
  const s = ui.scan;
  const head = `<div class="sheet-head"><button class="icon-btn" data-act="close-layer" aria-label="Close">←</button><h2>Scan results</h2></div>`;
  if (!s) return head;
  if (s.phase === 'loading') return `${head}<div class="pad center"><img class="scan-thumb" src="${s.thumb}" alt="Your photo"><div class="spinner" role="status"></div><p>Looking at your photo…</p></div>`;
  if (s.phase === 'error') return `${head}<div class="pad center"><img class="scan-thumb" src="${s.thumb}" alt="Your photo"><p class="warn-box">${esc(s.error)}</p><p class="muted small">You can always add ingredients by hand in the Fridge tab.</p><div class="row gap wrap center-row"><button class="btn primary" data-act="pick-photo" data-mode="camera" data-kind="${s.kind}">Try again</button><button class="btn ghost" data-act="close-layer">Close</button></div></div>`;
  const chosen = s.items.filter(i => i.on && i.name.trim()).length;
  return `${head}<div class="pad"><img class="scan-thumb" src="${s.thumb}" alt="Your photo">
    <p class="muted">${s.items.length ? `I spotted ${plural(s.items.length, 'item')}. Uncheck anything wrong or fix the names.` : "I couldn't spot any food in that photo. Try again with better light."}</p>
    <ul class="scan-list">${s.items.map((i, idx) => `<li><input type="checkbox" data-change="scan-on" data-idx="${idx}" ${i.on ? 'checked' : ''} aria-label="Include ${esc(i.name)}"><input class="scan-name" value="${esc(i.name)}" data-change="scan-name" data-idx="${idx}" aria-label="Item name">${i.dup ? '<span class="chip soft">already have</span>' : ''}</li>`).join('')}</ul>
    <form class="add-form" data-form="scan-extra" autocomplete="off"><input id="scanExtra" placeholder="Add something it missed" aria-label="Add something it missed"><button class="btn ghost" type="submit">Add</button></form>
    ${labelNote()}
    <div class="row gap wrap"><button class="btn primary grow" data-act="scan-commit" ${chosen ? '' : 'disabled'}>Add ${chosen} to my ${s.kind === 'spices' ? 'spices' : s.kind === 'pantry' ? 'pantry' : s.kind === 'leftovers' ? 'leftovers' : 'fridge'}</button></div></div>`;
};

// ====================================================================== layers: leftovers
LAYER_RENDER.leftovers = () => {
  const L = ui.leftover;
  const ideas = L.ideas;
  return `<div class="sheet-head"><button class="icon-btn" data-act="close-layer" aria-label="Close">←</button><h2>♻️ Leftover ideas</h2></div>
  <div class="pad"><p class="muted">Tell me what's left and I'll suggest ways to turn it into something new.</p>
  <form class="add-form" data-form="leftover-search" autocomplete="off"><input id="leftIn" value="${esc(L.text)}" placeholder="e.g. rice, roast chicken, bread" aria-label="Leftovers"><button class="btn primary" type="submit">Ideas</button></form>
  ${ideas === null ? '' : ideas.length ? `<ul class="ideas">${ideas.map(i => `<li class="card"><h3>${esc(i.title)}</h3><p>${esc(i.how)}</p><p class="muted small">Also needs: ${esc(i.needs.join(', '))}</p></li>`).join('')}</ul>` : '<p class="muted">No built-in ideas for that. Try the AI chef below.</p>'}
  ${ideas !== null ? `<button class="btn soft" data-act="leftover-ai" ${L.busy ? 'disabled' : ''}>${L.busy ? 'Thinking…' : '✨ Ask the AI chef for full recipes'}</button>` : ''}
  ${L.ai.length ? `<h3 class="h">AI recipes</h3><div class="grid">${L.ai.map(id => { const e = evalOne(id).ev; return e ? recipeCard(e, { wide: true }) : ''; }).join('')}</div>` : ''}
  </div>`;
};

// ====================================================================== layers: finish (made it!)
LAYER_RENDER.finish = () => {
  const f = ui.finish; if (!f) return '';
  const streak = cookStreak(state.made);
  return `<div class="sheet-head"><h2>🎉 Nice work, chef!</h2></div>
  <div class="pad">
    <p class="lead"><b>${esc(f.entry.title)}</b> is in your <b>Made</b> list.</p>
    <p class="chips">${streak ? `<span class="chip fire">🔥 ${plural(streak, 'day')} cooking streak</span>` : ''}${f.newBadges.map(b => `<span class="chip ok">${b.emoji} ${esc(b.name)}</span>`).join('')}</p>
    ${f.used.length ? `<h3 class="h">Used up?</h3><p class="muted small">Uncheck anything you still have left.</p>
      <ul class="used">${f.used.map(i => `<li><label><input type="checkbox" data-change="used" data-id="${i.id}" ${f.keep[i.id] ? '' : 'checked'}> ${esc(i.name)}</label></li>`).join('')}</ul>` : ''}
    <h3 class="h">📸 Show it off</h3>
    ${f.photo ? `<img class="share-prev" src="${f.photo.dataUrl}" alt="Your dish with the Made with Fridge Fit tag">
      <div class="row gap wrap"><button class="btn primary grow" data-act="share-photo">📤 Share with friends</button><button class="btn soft" data-act="save-photo">⬇️ Save</button></div>
      <label class="link center-link">Retake<input type="file" accept="image/*" capture="environment" hidden data-change="dish-photo"></label>`
    : `<p class="muted small">Snap your dish and share it. A small “Made with Fridge Fit” tag goes in the corner.</p>
      <div class="row gap wrap"><label class="btn primary grow filebtn">📷 Take a photo<input type="file" accept="image/*" capture="environment" hidden data-change="dish-photo"></label><label class="btn soft filebtn">🖼️ Choose<input type="file" accept="image/*" hidden data-change="dish-photo"></label></div>`}
    <button class="btn ghost wide" data-act="finish-done">Done</button>
  </div>`;
};

// ====================================================================== actions
function applyFilterShortcut(patch) {
  ui.filters = { meal: '', time: '', mood: '', cuisine: '', goal: '', expiring: false, weather: false, ...patch };
  go('recipes');
}

async function markMade(id, { swap = false } = {}) {
  const { ev } = evalOne(id);
  if (!ev) return toast("That recipe doesn't fit the current profile.");
  const r = ev.recipe;
  const entry = { id: uid(), recipeId: r.id, title: r.title, emoji: r.emoji, cuisine: r.cuisine, meal: r.meal, at: new Date().toISOString(), photo: null, nutrition: r.nutrition, ai: !!r.ai };
  const used = usedPantryItems(r, state.pantry);
  state.stats.rescued = (state.stats.rescued || 0) + used.filter(i => i.expires && daysUntil(i.expires) <= 2).length;
  if (used.some(i => i.loc === 'leftover')) state.stats.leftoverUsed = (state.stats.leftoverUsed || 0) + 1;
  state.made.push(entry);
  const before = new Set(state.badges), after = earnedBadges(state.made, state.stats);
  state.badges = after;
  const newBadges = BADGES.filter(b => after.includes(b.id) && !before.has(b.id));
  if (r.ai && !state.aiRecipes.some(x => x.id === r.id)) state.aiRecipes.push(r);
  ui.finish = { entry, used, keep: {}, newBadges, photo: null };
  save(); render();
  if (swap) swapLayer('finish', null, { cls: 'small', onClose: () => { ui.finish = null; } });
  else openLayer('finish', null, { cls: 'small', onClose: () => { ui.finish = null; } });
  if (newBadges.length) toast(`🏅 New badge: ${newBadges[0].name}`);
}

async function runScan(file, kind) {
  try {
    const thumb = await resizeToDataUrl(file, 360, 0.6);
    ui.scan = { phase: 'loading', kind, thumb };
    if (topLayer() && ui.stack.at(-1)?.kind === 'scanpick') swapLayer('scan', null, { onClose: () => { ui.scan = null; } });
    else if (ui.stack.at(-1)?.kind === 'scan') repaintTop();
    else openLayer('scan', null, { onClose: () => { ui.scan = null; } });
    const big = await resizeToDataUrl(file, 1280, 0.8);
    try {
      const { items } = await api.identify(big, kind);
      const loc = kind === 'spices' ? 'spices' : kind === 'pantry' ? 'pantry' : kind === 'leftovers' ? 'leftover' : 'fridge';
      ui.scan = {
        phase: 'result', kind, thumb,
        items: items.map(i => ({ ...i, on: i.confidence >= 0.45 && !state.pantry.some(p => p.loc === loc && sameItem(p.name, i.name)), dup: state.pantry.some(p => p.loc === loc && sameItem(p.name, i.name)) })),
      };
    } catch (e) {
      ui.scan = { phase: 'error', kind, thumb, error: api.aiOff(e) ? (e.code === 'access_code' ? e.message : "Photo scanning isn't switched on yet. The site owner needs to add the AI key in Netlify (see the README). You can still add ingredients by hand.") : (e.message || 'Something went wrong reading that photo.') };
    }
    if (ui.stack.at(-1)?.kind === 'scan') repaintTop();
  } catch (e) {
    console.error(e);
    toast("Couldn't open that photo. Try another one.");
  }
}

function commitScan() {
  const s = ui.scan; if (!s) return;
  const loc = s.kind === 'spices' ? 'spices' : s.kind === 'pantry' ? 'pantry' : s.kind === 'leftovers' ? 'leftover' : 'fridge';
  let added = 0;
  for (const i of s.items) {
    if (!i.on || !i.name.trim()) continue;
    const l = i.category === 'spices' ? 'spices' : loc;
    const exp = l === 'fridge' || l === 'leftover' ? (i.shelfLifeDays ? addDays(i.shelfLifeDays) : defaultExpiry(i.name, l)) : null;
    if (addPantryItem(i.name, l, exp, i.category)) added++;
  }
  toast(added ? `Added ${plural(added, 'item')} 🎉` : 'Nothing new to add');
  closeTop();
  save();
  go(ui.tab === 'home' ? 'home' : 'fridge', { scroll: false });
}

async function aiMore(extra = {}) {
  if (ui.aiBusy) return;
  ui.aiBusy = true; render();
  const f = ui.filters, wm = state.weather ? weatherBlurb(state.weather, state.settings.units).text : '';
  try {
    const payload = {
      ingredients: state.pantry.map(p => p.name), restrictions: restrictionPayload(), count: 3,
      filters: { meal: f.meal, maxTime: f.time === '15' ? 15 : f.time === '30' ? 30 : undefined, mealPrep: f.time === 'prep', mood: f.mood, cuisine: f.cuisine, goal: f.goal, weather: f.weather ? wm : '' },
      exclude: allRecipes().map(r => r.title).slice(-30), ...extra,
    };
    const { recipes } = await api.aiRecipes(payload);
    const fresh = [];
    recipes.forEach((raw, i) => {
      const rec = normalizeAiRecipe(raw, Date.now() % 100000 + i);
      if (!rec || state.aiRecipes.some(x => x.title.toLowerCase() === rec.title.toLowerCase())) return;
      const ok = evaluateAll([rec], ctx())[0]; // safety net: only keep recipes that pass our own diet/allergy check
      if (ok) fresh.push(rec);
    });
    if (!fresh.length) toast("The AI's ideas didn't pass your diet and allergy check. Try again!");
    else { state.aiRecipes.unshift(...fresh); toast(`Added ${plural(fresh.length, 'new idea')} ✨`); }
    trimAi();
    ui.leftover.ai = extra.leftovers ? fresh.map(r => r.id) : ui.leftover.ai;
  } catch (e) {
    toast(api.aiOff(e) ? (e.code === 'access_code' ? e.message : 'AI recipes need the AI key set up in Netlify (see the README).') : e.message || 'Could not reach the AI chef.');
  }
  ui.aiBusy = false; ui.leftover.busy = false;
  commit();
}

function trimAi() {
  const keep = new Set(state.made.map(m => m.recipeId));
  const mine = state.aiRecipes.filter(r => keep.has(r.id));
  const rest = state.aiRecipes.filter(r => !keep.has(r.id)).slice(0, 30);
  state.aiRecipes = [...rest, ...mine];
}

async function setLocation(loc) {
  state.settings.loc = loc; state.weather = null; save(); commit();
  await loadWeather(true);
}

async function loadWeather(force = false) {
  const loc = state.settings.loc; if (!loc) return;
  if (!force && state.weather && Date.now() - state.weather.at < 45 * 60000) return;
  try { state.weather = await fetchWeather(loc.lat, loc.lon); save(); if (ui.tab === 'home' || ui.tab === 'recipes' || ui.tab === 'me') render(); }
  catch { if (force) toast("Couldn't load the weather right now."); }
}

async function locate() {
  try {
    const p = await getPosition();
    await setLocation({ lat: Math.round(p.lat * 100) / 100, lon: Math.round(p.lon * 100) / 100, place: 'Near you' });
    toast('Weather connected 🌤️');
  } catch (e) {
    toast(e.message === 'denied' ? 'Location is blocked. You can type a city instead.' : "Couldn't get your location. Try typing a city.");
  }
}

function shareText() {
  return 'Shopping list (Fridge Fit)\n' + state.shopping.filter(i => !i.done).map(i => '• ' + i.name).join('\n');
}

function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function openProfileEditor(id) {
  const isNew = id === 'new';
  const base = isNew ? { id: uid(), name: '', emoji: '🙂', diets: [], allergies: [], avoid: '' } : state.profiles.find(p => p.id === id);
  if (!base) return;
  openLayer('profile', { isNew, draft: JSON.parse(JSON.stringify(base)) });
}

const ACTIONS = {
  nav: el => go(el.dataset.tab),
  'close-layer': () => closeTop(),
  'toggle-theme': () => { state.settings.theme = effectiveTheme() === 'dark' ? 'light' : 'dark'; saveNow(); applyTheme(); render(); },
  'set-theme': el => { state.settings.theme = el.dataset.val; saveNow(); commit(); },
  'set-units': el => { state.settings.units = el.dataset.val; commit(); },
  'open-recipe': el => openLayer('recipe', el.dataset.id, { cls: 'full' }),
  'open-shopping': () => openLayer('shopping', null, { cls: 'full' }),
  'toggle-active': el => {
    const id = el.dataset.id, a = state.active;
    if (a.includes(id)) { if (a.length > 1) state.active = a.filter(x => x !== id); else return toast('Pick at least one person'); } else a.push(id);
    commit();
  },
  filter: el => { ui.filters[el.dataset.key] = el.dataset.val; commit(); },
  'filter-toggle': el => { ui.filters[el.dataset.key] = !ui.filters[el.dataset.key]; commit(); },
  'clear-filters': () => { ui.filters = { meal: '', time: '', mood: '', cuisine: '', goal: '', expiring: false, weather: false }; commit(); },
  'toggle-more': () => { ui.showMore = !ui.showMore; render(); },
  'see-all': el => applyFilterShortcut({ meal: el.dataset.meal }),
  'use-expiring': () => applyFilterShortcut({ expiring: true }),
  'weather-picks': () => applyFilterShortcut({ weather: true }),
  'dismiss-label': () => { state.seen.labelNote = true; commit(); },
  scan: el => openLayer('scanpick', el.dataset.kind, { cls: 'small' }),
  'pick-photo': el => {
    const input = $(el.dataset.mode === 'camera' ? '#fileCam' : '#fileGallery');
    input.dataset.kind = el.dataset.kind; input.value = ''; input.click();
  },
  'scan-commit': () => commitScan(),
  'add-common': el => { addPantryItem(el.dataset.name, 'fridge'); commit(); },
  'remove-item': el => {
    const it = state.pantry.find(p => p.id === el.dataset.id); if (!it) return;
    state.pantry = state.pantry.filter(p => p.id !== it.id); commit();
    toast(`Removed ${it.name}`, { action: 'Undo', onAction: () => { state.pantry.push(it); commit(); } });
  },
  'clear-pantry': async () => { if (await confirmBox('Remove everything from your kitchen?', { ok: 'Clear all' })) { state.pantry = []; commit(); } },
  'leftover-ideas': () => {
    const left = state.pantry.filter(p => p.loc === 'leftover').map(p => p.name).join(', ');
    ui.leftover = { text: left, ideas: left ? leftoverIdeas(left, buildRestrictions(activeProfiles())) : null, ai: [], busy: false };
    openLayer('leftovers', null, { cls: 'full' });
  },
  'leftover-ai': () => { ui.leftover.busy = true; repaintTop(); aiMore({ leftovers: ui.leftover.text.split(',').map(s => s.trim()).filter(Boolean), count: 3 }); },
  'shop-add': el => {
    const name = el.dataset.name.toLowerCase();
    if (!state.shopping.some(i => !i.done && sameItem(i.name, name))) state.shopping.push({ id: uid(), name, done: false });
    toast(`Added ${name} to your list 🛒`, { action: 'View', onAction: () => openLayer('shopping', null, { cls: 'full' }) }); commit();
  },
  'shop-add-missing': el => {
    const { ev } = evalOne(el.dataset.id); if (!ev) return;
    ev.missing.forEach(m => { if (!state.shopping.some(i => !i.done && sameItem(i.name, m.name))) state.shopping.push({ id: uid(), name: m.name, done: false }); });
    toast(`Added ${plural(ev.missing.length, 'item')} to your list 🛒`); commit();
  },
  'shop-remove': el => { state.shopping = state.shopping.filter(i => i.id !== el.dataset.id); commit(); },
  'shop-clear': () => { state.shopping = state.shopping.filter(i => !i.done); commit(); },
  'shop-to-fridge': () => {
    state.shopping.filter(i => i.done).forEach(i => addPantryItem(i.name, 'fridge'));
    const n = state.shopping.filter(i => i.done).length;
    state.shopping = state.shopping.filter(i => !i.done); commit(); toast(`Moved ${plural(n, 'item')} to your kitchen 🧊`);
  },
  'shop-share': async () => {
    const text = shareText();
    try { if (navigator.share) await navigator.share({ title: 'Shopping list', text }); else { await navigator.clipboard.writeText(text); toast('List copied to clipboard'); } }
    catch (e) { if (e.name !== 'AbortError') toast("Couldn't share the list"); }
  },
  'use-sub': el => { const m = (ui.subUse[el.dataset.id] ||= {}); m[el.dataset.from] = el.dataset.to; commit(); },
  'start-cook': el => {
    const { ev } = evalOne(el.dataset.id); if (!ev) return;
    const entry = { kind: 'cook' };
    ui.stack.push(entry);
    startCooking(ev, {
      settings: state.settings, restr: buildRestrictions(activeProfiles()),
      ask: p => api.ask({ ...p, restrictions: restrictionPayload() }),
      onFinish: e => markMade(e.recipe.id, { swap: true }),
      onClose: () => { ui.stack = ui.stack.filter(s => s !== entry); },
    });
  },
  'mark-made': el => markMade(el.dataset.id),
  'remove-made': async el => { if (await confirmBox('Remove this from your Made list?', { ok: 'Remove' })) { state.made = state.made.filter(m => m.id !== el.dataset.id); commit(); } },
  'edit-profile': el => openProfileEditor(el.dataset.id),
  'pf-avatar': el => { ui.stack.at(-1).arg.draft.emoji = el.dataset.val; repaintTop(); },
  'pf-toggle': el => {
    const d = ui.stack.at(-1).arg.draft, list = d[el.dataset.key], id = el.dataset.id;
    d[el.dataset.key] = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    repaintTop();
  },
  'pf-save': () => {
    const { draft, isNew } = ui.stack.at(-1).arg;
    draft.name = draft.name.trim() || (isNew ? 'Guest' : 'Me');
    if (isNew) { state.profiles.push(draft); state.active.push(draft.id); }
    else Object.assign(state.profiles.find(p => p.id === draft.id), draft);
    state.seen.profileNudge = true;
    closeTop(); commit(); toast('Profile saved. Recipes will follow it 🛡️');
  },
  'pf-delete': async () => {
    const { draft } = ui.stack.at(-1).arg;
    if (!await confirmBox(`Delete ${draft.name}'s profile?`, { ok: 'Delete' })) return;
    state.profiles = state.profiles.filter(p => p.id !== draft.id);
    state.active = state.active.filter(id => id !== draft.id); if (!state.active.length) state.active = [state.profiles[0].id];
    closeTop(); commit();
  },
  'open-auth': () => { ui.auth = { mode: 'signin', busy: false, msg: '', err: '', email: ui.auth.email }; openLayer('auth', null, { cls: 'small' }); },
  'auth-mode': el => { ui.auth = { ...ui.auth, mode: el.dataset.val, msg: '', err: '', email: $('#authEmail')?.value || ui.auth.email }; repaintTop(); },
  'apple-signin': async () => {
    ui.auth.err = '';
    try { await auth.signInWithApple(); } catch (e) { ui.auth.err = e.message; repaintTop(); }
  },
  'edit-account': () => { ui.auth.err = ''; openLayer('account', null, { cls: 'small' }); },
  'sync-now': () => cloudPush(true),
  'sign-out': async () => { await auth.signOut(); toast('Signed out. Your data stays on this device.'); },
  'sign-out-clear': async () => {
    if (!await confirmBox('Sign out and remove all saved data from this device? Your account keeps its copy.', { ok: 'Sign out & clear' })) return;
    await cloudPush(false).catch(() => {}); await auth.signOut(); resetAll();
  },
  locate: () => locate(),
  'clear-location': () => { state.settings.loc = null; state.weather = null; commit(); },
  'ai-more': () => aiMore(),
  'share-photo': async () => {
    const f = ui.finish; if (!f?.photo) return;
    const res = await shareImage(f.photo.blob, f.entry.title);
    if (res === 'cancelled') return;
    await keepPhoto(res === 'shared'); toast(res === 'shared' ? 'Shared! 📸' : 'Saved to your device. Post it anywhere! 📸');
  },
  'save-photo': async () => {
    const f = ui.finish; if (!f?.photo) return;
    const a = document.createElement('a'); a.href = f.photo.dataUrl; a.download = 'made-with-fridge-fit.jpg'; document.body.appendChild(a); a.click(); a.remove();
    await keepPhoto(false); toast('Saved 📸');
  },
  'finish-done': () => {
    const f = ui.finish;
    if (f) state.pantry = state.pantry.filter(p => !f.used.some(u => u.id === p.id) || f.keep[p.id]);
    closeAllLayers(); ui.stack = []; commit(); go('made');
  },
  export: () => download('fridge-fit-backup.json', JSON.stringify(state)),
  reset: async () => { if (await confirmBox('Erase all profiles, your kitchen, shopping list and Made history from this browser?', { ok: 'Erase everything' })) resetAll(); },
};

async function keepPhoto(shared) {
  const f = ui.finish; if (!f?.photo) return;
  const m = state.made.find(x => x.id === f.entry.id); if (!m) return;
  m.photo = await thumbnail(f.photo.dataUrl); m.shared = true; save(); render();
}

const FORMS = {
  auth: async () => {
    const a = ui.auth, email = $('#authEmail').value.trim(), pw = $('#authPw') ? $('#authPw').value : '';
    a.email = email; a.err = ''; a.msg = '';
    if (!/^\S+@\S+\.\S+$/.test(email)) { a.err = 'Please enter a valid email address.'; return repaintTop(); }
    if (a.mode !== 'reset' && pw.length < 8) { a.err = 'Your password needs at least 8 characters.'; return repaintTop(); }
    a.busy = true; repaintTop();
    try {
      if (a.mode === 'reset') { await auth.resetPassword(email); a.msg = 'If that email has an account, a reset link is on its way. Check your inbox (and spam).'; }
      else if (a.mode === 'signup') {
        a.name = $('#authName') ? $('#authName').value.trim() : '';
        const r = await auth.signUp(email, pw, a.name);
        if (r.needsConfirm) a.msg = 'Almost there! We sent a confirmation link to your email. Tap it, then come back and sign in.';
        else { a.busy = false; closeTop(); toast('Account created. Welcome! 🎉'); return; }
      } else { await auth.signIn(email, pw); a.busy = false; closeTop(); toast('Signed in 👋'); return; }
    } catch (e) { a.err = e.message; }
    a.busy = false; repaintTop();
  },
  account: async () => {
    const name = $('#acctName').value.trim(), ageRaw = $('#acctAge').value.trim();
    const age = ageRaw === '' ? null : Number(ageRaw);
    if (age !== null && (!Number.isInteger(age) || age < 1 || age > 120)) { ui.auth.err = 'Please enter a valid age, or leave it blank.'; return repaintTop(); }
    ui.auth.err = ''; ui.auth.busy = true; repaintTop();
    try {
      await auth.updateProfile({ name, age });
      const p0 = state.profiles[0];
      if (name && p0 && (p0.name === 'Me' || p0.name === 'Guest')) p0.name = name;
      shuffleGreetings(); save(); ui.auth.busy = false; closeTop(); toast(name ? `Nice to meet you, ${name}! 👋` : 'Saved'); commit();
    } catch (e) { ui.auth.busy = false; ui.auth.err = e.message; repaintTop(); }
  },
  newpass: async () => {
    const pw = $('#newPw').value;
    if (pw.length < 8) { ui.auth.err = 'Your password needs at least 8 characters.'; return repaintTop(); }
    try { await auth.setNewPassword(pw); ui.auth.err = ''; closeTop(); toast('Password updated 🔒'); }
    catch (e) { ui.auth.err = e.message; repaintTop(); }
  },
  'add-item': form => {
    const name = $('#addItem').value, loc = $('#addLoc').value;
    if (addPantryItem(name, loc)) { toast(`Added ${name.trim().toLowerCase()}`); }
    commit(); const i = $('#addItem'); i && i.focus();
  },
  'add-leftover': () => { addPantryItem($('#addLeft').value, 'leftover'); commit(); const i = $('#addLeft'); i && i.focus(); },
  'shop-add': () => {
    const v = $('#shopIn').value.trim().toLowerCase();
    if (v && !state.shopping.some(i => !i.done && sameItem(i.name, v))) state.shopping.push({ id: uid(), name: v, done: false });
    commit(); const i = $('#shopIn'); i && i.focus();
  },
  city: async form => {
    const input = $('input', form); const name = input.value.trim(); if (!name) return;
    try { const g = await geocode(name); await setLocation({ lat: g.lat, lon: g.lon, place: g.place }); toast(`Weather set for ${g.place}`); }
    catch { toast("Couldn't find that city."); }
  },
  cuisine: () => { const v = $('#cuisineIn').value.trim(); if (!v) return; const known = cuisineList().find(c => c.toLowerCase() === v.toLowerCase()); ui.filters.cuisine = known || v.replace(/\b\w/g, c => c.toUpperCase()); commit(); },
  'scan-extra': () => { const v = $('#scanExtra').value.trim(); if (v && ui.scan?.items) { ui.scan.items.push({ name: v.toLowerCase(), on: true, confidence: 1, category: 'other', shelfLifeDays: null }); repaintTop(); } },
  'leftover-search': () => {
    ui.leftover.text = $('#leftIn').value;
    ui.leftover.ideas = ui.leftover.text.trim() ? leftoverIdeas(ui.leftover.text, buildRestrictions(activeProfiles())) : null;
    repaintTop();
  },
};

const CHANGES = {
  expiry: el => { const it = state.pantry.find(p => p.id === el.dataset.id); if (it) { it.expires = el.value || null; commit(); } },
  setting: el => { state.settings[el.dataset.key] = el.checked; save(); },
  rate: el => { state.settings.rate = Number(el.value); save(); render(); },
  access: el => { state.settings.accessCode = el.value; save(); },
  notify: async el => {
    if (el.checked) {
      if (!('Notification' in window)) { el.checked = false; return toast('Notifications are not supported here.'); }
      const p = await Notification.requestPermission();
      if (p !== 'granted') { el.checked = false; toast('Notifications are blocked in your browser settings.'); }
    }
    state.settings.notify = el.checked; save();
  },
  'shop-toggle': el => { const it = state.shopping.find(i => i.id === el.dataset.id); if (it) { it.done = el.checked; commit(); } },
  'pf-name': el => { ui.stack.at(-1).arg.draft.name = el.value; },
  'pf-avoid': el => { ui.stack.at(-1).arg.draft.avoid = el.value; },
  'scan-on': el => { ui.scan.items[el.dataset.idx].on = el.checked; repaintTop(); },
  'scan-name': el => { ui.scan.items[el.dataset.idx].name = el.value; },
  used: el => { ui.finish.keep[el.dataset.id] = !el.checked; },
  'dish-photo': async el => {
    const file = el.files && el.files[0]; if (!file || !ui.finish) return;
    try { ui.finish.photo = await composeShareImage(file); repaintTop(); }
    catch { toast("Couldn't read that photo."); }
  },
};

// ====================================================================== events
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.matches('a')) e.preventDefault();
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); Promise.resolve(fn(el, e)).catch(err => { console.error(err); toast('Something went wrong.'); }); }
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.rcard[data-act]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]'); if (!f) return;
  e.preventDefault(); const fn = FORMS[f.dataset.form]; if (fn) Promise.resolve(fn(f)).catch(console.error);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]'); if (!el) return;
  const fn = CHANGES[el.dataset.change]; if (fn) Promise.resolve(fn(el)).catch(console.error);
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-change="pf-name"],[data-change="pf-avoid"],[data-change="scan-name"]');
  if (el) CHANGES[el.dataset.change](el);
});

for (const id of ['fileCam', 'fileGallery']) {
  document.getElementById(id).addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) runScan(f, e.target.dataset.kind || 'fridge');
  });
}

// ====================================================================== account sync
let cloudTimer;
function scheduleCloud() { clearTimeout(cloudTimer); cloudTimer = setTimeout(() => cloudPush(false).catch(() => {}), 2000); }

async function cloudPush(manual) {
  if (!auth.currentUser()) return;
  ui.sync = { status: 'Syncing…' }; if (ui.tab === 'me') render();
  try {
    await auth.pushState(cloudPayload());
    ui.sync = { status: 'Synced', at: Date.now() };
    if (manual) toast('Synced ☁️');
  } catch (e) {
    ui.sync = { status: "Couldn't sync: " + e.message, err: true };
    if (manual) toast(ui.sync.status);
  }
  if (ui.tab === 'me') render();
}

async function cloudStart(user) {
  ui.sync = { status: 'Syncing…' }; if (ui.tab === 'me') render();
  try {
    const row = await auth.pullState();
    const remote = row && row.data && row.data.v === 1 ? row.data : null;
    if (!remote) await auth.pushState(cloudPayload());
    else if (isPristine()) { adopt(remote); toast('Welcome back! Your data is loaded ☁️'); }
    else {
      await new Promise(r => setTimeout(r, 400));
      const useCloud = await confirmBox("Your account already has saved data, and this device has different data. Which should we keep?", { ok: 'Use my account data', cancel: 'Keep this device' });
      if (useCloud) { adopt(remote); toast('Loaded your account data ☁️'); } else await auth.pushState(cloudPayload());
    }
    hooks.afterSave = scheduleCloud;
    ui.sync = { status: 'Synced', at: Date.now() };
  } catch (e) {
    ui.sync = { status: "Couldn't sync: " + e.message, err: true };
  }
  shuffleGreetings(); render(); repaintTop();
  if (!auth.accountName(user) && layerCount() === 0) { ui.auth.err = ''; openLayer('account', null, { cls: 'small' }); }
}

function initAccount() {
  auth.onAuth(async (event, user) => {
    if (event === 'PASSWORD_RECOVERY') { ui.auth.err = ''; openLayer('newpass', null, { cls: 'small' }); return; }
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && user && ui.syncedFor !== user.id) { ui.syncedFor = user.id; await cloudStart(user); }
    else if (event === 'USER_UPDATED') { shuffleGreetings(); render(); }
    else if (event === 'SIGNED_OUT') { ui.syncedFor = null; hooks.afterSave = null; ui.sync = {}; render(); }
  });
  if (auth.shouldInit()) auth.getClient().catch(() => { /* offline: stay signed out until next load */ });
}

// ====================================================================== notifications & boot
function maybeNotify() {
  if (!state.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  const day = isoDate();
  if (localStorage.getItem('fridgefit:notified') === day) return;
  const exp = expiringItems(state.pantry, 2);
  if (!exp.length) return;
  try {
    new Notification('Use it before you lose it 🥬', { body: `${exp.slice(0, 3).map(i => i.name).join(', ')} ${exp.length > 3 ? 'and more ' : ''}need${exp.length === 1 ? 's' : ''} using soon. Tap to see recipes.`, icon: '/icons/icon-192.png' });
    localStorage.setItem('fridgefit:notified', day);
  } catch { /* some browsers need a service worker */ }
}

function boot() {
  initAccount();
  $('#tabbar').innerHTML = TABS.map(t => `<button data-act="nav" data-tab="${t.id}"><span class="ti">${t.icon}</span><span>${t.label}</span></button>`).join('');
  const hash = location.hash.replace('#', '');
  ui.tab = VIEWS[hash] ? hash : 'home';
  history.replaceState(null, '', '#' + ui.tab);

  updateWasteStreak(state.stats, state.pantry);
  state.badges = earnedBadges(state.made, state.stats);
  shuffleGreetings();
  render();
  if (ui.tab === 'home') startGreeting();
  saveNow();

  loadWeather();
  api.health().then(h => { ui.health = h; if (ui.tab === 'me') render(); });
  maybeNotify();
  setInterval(() => { loadWeather(); maybeNotify(); }, 15 * 60000);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  if (!state.seen.welcome) {
    state.seen.welcome = true; save();
    pushLayer(`<div class="pad center welcome"><span class="big-emoji">🥗</span><h2>Welcome to Fridge Fit</h2>
      <p class="muted">Scan your fridge, get meals made from what you already have, and cook hands-free. First, tell me about your diet and allergies so every recipe is safe for you.</p>
      <div class="col gap"><button class="btn primary big" data-welcome="profile">Set up my profile</button><button class="btn ghost" data-act="close-layer">Skip for now</button></div></div>`, {
      cls: 'small',
      onMount: el => { $('[data-welcome]', el).onclick = () => { closeTop(); setTimeout(() => openProfileEditor(state.profiles[0].id), 260); }; },
    });
  }
}

$('#themeBtn').addEventListener('click', () => ACTIONS['toggle-theme']());
$('#accountBtn').addEventListener('click', () => { if (auth.currentUser()) go('me'); else ACTIONS['open-auth'](); });
$('#shopBtn').addEventListener('click', () => ACTIONS['open-shopping']());
boot();
window.__fridgefit = { state, ui, go };
