import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES } from '../public/js/recipes.js';
import { ingredientTags } from '../public/js/data.js';
import { buildRestrictions, adaptRecipe, evaluateAll, prepPantry, words, cookStreak, updateWasteStreak, safeSubstitutes, leftoverIdeas, NO_RESTRICTIONS } from '../public/js/engine.js';

const profile = (diets = [], allergies = [], avoid = '') => ({ diets, allergies, avoid });
const has = (tags, t) => ingredientTags(tags).has(t);

test('ingredient tagging basics', () => {
  assert.ok(has('butter', 'dairy'));
  assert.ok(!has('peanut butter', 'dairy'));
  assert.ok(has('peanut butter', 'peanuts'));
  assert.ok(!has('coconut milk', 'dairy'));
  assert.ok(has('almond milk', 'nuts'));
  assert.ok(!has('eggplant', 'egg'));
  assert.ok(has('soy sauce', 'gluten'));
  assert.ok(!has('tamari', 'gluten'));
  assert.ok(!has('gluten-free pasta', 'gluten'));
  assert.ok(has('gluten-free pasta', 'high-carb'));
  assert.ok(!has('vegan cheese', 'dairy'));
  assert.ok(!has('butternut squash', 'nuts'));
  assert.ok(!has('nutmeg', 'nuts'));
  assert.ok(has('shrimp', 'shellfish'));
  assert.ok(has('bacon', 'pork'));
  assert.ok(!has('flax egg', 'egg'));
  assert.ok(has('hummus', 'sesame'));
  assert.ok(!has('low-sodium soy sauce', 'sodium'));
  assert.ok(has('corn tortillas', 'grain') && !has('corn tortillas', 'gluten'));
});

test('matching is forgiving but not sloppy', () => {
  const ctx = { restr: NO_RESTRICTIONS, assumeStaples: true, pantry: [{ id: 1, name: 'Chicken' }, { id: 2, name: 'red onions' }, { id: 3, name: 'coconut milk' }, { id: 4, name: 'Tomatoes' }] };
  const ev = evaluateAll(RECIPES, ctx);
  const alfredo = ev.find(e => e.recipe.id === 'chicken-alfredo');
  assert.ok(alfredo.have.some(i => i.name === 'chicken breast'));
  assert.ok(alfredo.missing.some(i => i.name === 'heavy cream'));
  const scramble = ev.find(e => e.recipe.id === 'veggie-scramble');
  assert.ok(scramble.have.some(i => i.name === 'tomato'));
  assert.ok(scramble.have.some(i => i.name === 'onion'));
  assert.ok(!scramble.have.some(i => i.name === 'milk'));
  assert.deepEqual(words('2 Large Tomatoes'.replace(/^\d+ /, '')), ['tomato']);
});

test('every offered recipe respects every restriction (invariant)', () => {
  const cases = [
    profile(['vegan']), profile(['vegetarian']), profile(['gluten-free']), profile(['celiac']), profile(['pescatarian']),
    profile(['keto']), profile(['low-carb']), profile(['paleo']), profile(['dairy-free']), profile(['lactose-free']),
    profile(['halal']), profile(['kosher']), profile(['low-sodium']), profile(['diabetic']),
    profile([], ['peanuts']), profile([], ['tree-nuts']), profile([], ['eggs']), profile([], ['soy']), profile([], ['shellfish']),
    profile([], ['milk', 'wheat', 'sesame', 'fish']),
  ];
  const forbidMap = {};
  for (const c of cases) {
    const restr = buildRestrictions([c]);
    const evs = evaluateAll(RECIPES, { restr, pantry: [], assumeStaples: true });
    for (const ev of evs) {
      for (const ing of ev.recipe.ingredients) {
        if (ing.optional && false) continue;
        const tags = ingredientTags(ing.name);
        const bad = [...tags].filter(t => restr.forbid.has(t));
        const kosherMix = restr.kosher && tags.has('dairy') && ev.recipe.ingredients.some(i => { const t = ingredientTags(i.name); return t.has('meat') || t.has('poultry'); });
        assert.equal(bad.length + (kosherMix ? 1 : 0), 0, `${JSON.stringify(c)} => ${ev.recipe.title} contains ${ing.name} (${bad})`);
      }
      if (restr.maxCarbs != null) assert.ok(ev.recipe.nutrition.carbs <= restr.maxCarbs, `${ev.recipe.title} carbs`);
    }
    forbidMap[JSON.stringify(c)] = evs.length;
  }
  // sanity: every profile still leaves a decent number of options
  for (const [k, n] of Object.entries(forbidMap)) assert.ok(n >= 5, `${k} left only ${n} recipes`);
  console.log(forbidMap);
});

test('family profiles: union of restrictions', () => {
  const kid = profile([], ['tree-nuts', 'peanuts']);
  const parent = profile(['vegan']);
  const restr = buildRestrictions([kid, parent]);
  const evs = evaluateAll(RECIPES, { restr, pantry: [], assumeStaples: true });
  assert.ok(evs.length > 3);
  for (const ev of evs) for (const i of ev.recipe.ingredients) {
    const t = ingredientTags(i.name);
    assert.ok(!t.has('nuts') && !t.has('peanuts') && !t.has('dairy') && !t.has('egg') && !t.has('meat') && !t.has('poultry'), `${ev.recipe.title}:${i.name}`);
  }
});

test('adaptation swaps and rewrites steps', () => {
  const alfredo = RECIPES.find(r => r.id === 'chicken-alfredo');
  const out = adaptRecipe(alfredo, buildRestrictions([profile(['vegan'])]));
  assert.ok(out.ok);
  assert.ok(out.swaps.some(s => s.from === 'chicken breast'));
  assert.ok(!/chicken/i.test(out.recipe.title));
  assert.ok(!out.recipe.steps.join(' ').toLowerCase().includes('chicken'));
  const eggs = RECIPES.find(r => r.id === 'veggie-scramble');
  assert.equal(adaptRecipe(eggs, buildRestrictions([profile([], ['eggs'])])).ok, false);
});

test('custom avoid list', () => {
  const restr = buildRestrictions([profile([], [], 'mushroom, cilantro')]);
  const evs = evaluateAll(RECIPES, { restr, pantry: [], assumeStaples: true });
  assert.ok(!evs.some(e => e.recipe.ingredients.some(i => /mushroom|cilantro/.test(i.name) && !i.optional)));
});

test('substitutes respect allergies', () => {
  const restr = buildRestrictions([profile([], ['tree-nuts', 'soy'])]);
  const subs = safeSubstitutes('milk', restr);
  assert.ok(subs.length && !subs.includes('almond milk') && !subs.includes('soy milk'));
  assert.ok(safeSubstitutes('butter', buildRestrictions([profile(['vegan'])])).includes('olive oil'));
});

test('streaks', () => {
  const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return { at: d.toISOString() }; };
  assert.equal(cookStreak([day(0), day(1), day(2)]), 3);
  assert.equal(cookStreak([day(1), day(2)]), 2);
  assert.equal(cookStreak([day(3)]), 0);
  const stats = { wasteStreak: 6, lastWasteCheck: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })() };
  updateWasteStreak(stats, [{ name: 'milk', expires: '2999-01-01' }]);
  assert.equal(stats.wasteStreak, 7);
  stats.lastWasteCheck = '2000-01-01';
  updateWasteStreak(stats, [{ name: 'milk', expires: '2000-01-02' }]);
  assert.equal(stats.wasteStreak, 0);
});

test('leftover ideas honour restrictions', () => {
  assert.ok(leftoverIdeas('leftover rice', NO_RESTRICTIONS).length >= 2);
  const vegan = buildRestrictions([profile(['vegan'])]);
  assert.ok(!leftoverIdeas('rice', vegan).some(i => i.title === 'Crispy fried rice'));
});
