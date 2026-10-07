import { guard, readJson, callClaude, extractJson, errorResponse, json, cleanList, clean } from '../lib/anthropic.mjs';

const SYSTEM = `You are a careful, creative home-cooking assistant inside a recipe app. You invent practical recipes from the ingredients a person already has.
Hard rules:
1. SAFETY FIRST: every recipe MUST obey the diet and allergy restrictions in the request. Never include an ingredient that violates them, including hidden sources (e.g. soy sauce contains soy and wheat; pesto contains nuts; fish sauce is fish; mayonnaise is egg; broth may be meat). If a restriction cannot be met, leave the recipe out.
2. Mostly use the listed ingredients. You may add at most 2 extra non-staple ingredients per recipe. Salt, pepper, oil and water are free.
3. Respect the requested filters (meal, max time, mood, cuisine, goal, weather) when given.
4. Steps must be short, numbered-in-order sentences that are easy to read aloud (no step numbers inside the text, no markdown).
5. Give realistic per-serving nutrition estimates.
Return ONLY JSON in this shape:
{"recipes":[{"title":"","emoji":"","meal":["dinner"],"cuisine":"","time":25,"difficulty":"Easy","servings":2,"moods":["comfort"],"mealPrep":false,"ingredients":[{"q":"200 g","name":"spaghetti","optional":false}],"steps":["..."],"nutrition":{"calories":0,"protein":0,"carbs":0,"fat":0}}]}
"meal" is any of breakfast, lunch, dinner. "moods" is any of comfort, spicy, sweet, light, warming, fresh. "difficulty" is Easy, Medium or Hard. Ingredient names are lowercase, singular, generic.`;

const LEFTOVER_NOTE = 'The person has LEFTOVERS and wants creative ways to turn them into a brand-new meal (not just reheating). Build each recipe around the leftovers.';

export default async (req) => {
  try {
    guard(req);
    const b = await readJson(req, 100_000);
    const count = Math.min(4, Math.max(1, Number(b.count) || 3));
    const f = b.filters || {};
    const r = b.restrictions || {};
    const lines = [
      `Ingredients available: ${cleanList(b.ingredients, 80).join(', ') || '(none listed)'}`,
      b.leftovers ? `Leftovers to use up: ${cleanList(b.leftovers, 10).join(', ')}` : '',
      `Diets that EVERY recipe must follow: ${cleanList(r.diets, 20).join(', ') || 'none'}`,
      `Allergies (absolutely none of these): ${cleanList(r.allergies, 20).join(', ') || 'none'}`,
      `Also avoid: ${cleanList(r.avoid, 20).join(', ') || 'nothing'}`,
      f.meal ? `Meal: ${clean(f.meal, 20)}` : '',
      f.maxTime ? `Ready in at most ${Number(f.maxTime) || 30} minutes` : '',
      f.mealPrep ? 'Must be a good meal-prep recipe' : '',
      f.mood ? `Mood/craving: ${clean(f.mood, 20)}` : '',
      f.cuisine ? `Cuisine: ${clean(f.cuisine, 30)}` : '',
      f.goal ? `Fitness goal: ${clean(f.goal, 20)}` : '',
      f.weather ? `Weather today: ${clean(f.weather, 80)}` : '',
      cleanList(b.exclude, 30).length ? `Do not repeat these recipes: ${cleanList(b.exclude, 30).join('; ')}` : '',
      '',
      b.leftovers ? LEFTOVER_NOTE : '',
      `Write ${count} recipes.`,
    ].filter((l) => l !== '');

    const text = await callClaude({ system: SYSTEM, maxTokens: 3500, messages: [{ role: 'user', content: lines.join('\n') }] });
    const parsed = extractJson(text);
    return json({ recipes: Array.isArray(parsed) ? parsed : parsed.recipes || [] });
  } catch (e) {
    return errorResponse(e);
  }
};
