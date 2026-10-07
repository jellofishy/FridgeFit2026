import { guard, readJson, callClaude, errorResponse, json, cleanList, clean } from '../lib/anthropic.mjs';

const SYSTEM = `You are the voice of a friendly cooking helper. The user is cooking right now with messy hands and your answer will be read aloud by text-to-speech.
- Answer in one to three short, natural spoken sentences. No markdown, no lists, no emojis, no symbols.
- Be concrete and practical. For doneness or food safety give temperatures in both Celsius and Fahrenheit.
- ALWAYS respect the person's diet and allergy restrictions: never suggest a substitute or ingredient that breaks them. If a common answer would break a restriction, give a safe one instead.
- If you are not sure or it is a safety risk, say so briefly.
- You can see the recipe they are making and the step they are on; use it.`;

export default async (req) => {
  try {
    guard(req);
    const b = await readJson(req, 60_000);
    const q = clean(b.question, 400);
    if (!q) return json({ answer: "I didn't catch a question." });
    const rec = b.recipe || {};
    const ctx = [
      `Recipe: ${clean(rec.title, 100)}`,
      `Ingredients: ${cleanList(rec.ingredients, 40, 80).join('; ')}`,
      `Steps: ${cleanList(rec.steps, 20, 300).map((s, i) => `${i + 1}. ${s}`).join(' ')}`,
      Number.isInteger(b.step) ? `Currently on step ${b.step + 1}.` : '',
      `Diets to follow: ${cleanList(b.restrictions?.diets, 20).join(', ') || 'none'}`,
      `Allergies: ${cleanList(b.restrictions?.allergies, 20).join(', ') || 'none'}`,
      `Also avoid: ${cleanList(b.restrictions?.avoid, 20).join(', ') || 'nothing'}`,
      '',
      `Question: ${q}`,
    ].filter(Boolean).join('\n');
    const answer = await callClaude({ system: SYSTEM, maxTokens: 300, messages: [{ role: 'user', content: ctx }] });
    return json({ answer: answer.trim() });
  } catch (e) {
    return errorResponse(e);
  }
};
