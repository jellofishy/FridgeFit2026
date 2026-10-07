import { HttpError, guard, readJson, callClaude, extractJson, errorResponse, json, clean } from '../lib/anthropic.mjs';

const SYSTEM = `You are the vision system of a kitchen app. You look at a photo of a fridge, freezer, pantry shelf, spice rack or leftovers and list the food items you can actually see.
Rules:
- Return ONLY JSON: {"items":[{"name":"...","category":"...","confidence":0.0-1.0,"shelfLifeDays":N or null}]}
- name: short, singular, generic grocery name in lowercase ("tomato", "greek yogurt", "cumin"). No brands, no quantities.
- category: one of produce, protein, dairy, grains, condiments, spices, drinks, leftovers, other.
- shelfLifeDays: realistic number of days the item will usually stay good from now if it is perishable and stored in a fridge; null for shelf-stable pantry goods and spices.
- Only list food you can identify. Do not guess hidden contents of opaque containers, and do not invent items. Merge duplicates. Max 40 items.
- If a label is readable, you may use it (e.g. a jar labelled "tahini").`;

const HINTS = {
  fridge: 'This is a photo of a fridge or freezer.',
  pantry: 'This is a photo of a pantry shelf or cupboard (dry goods, cans, jars).',
  spices: 'This is a photo of a spice rack or spice cabinet. Use category "spices".',
  leftovers: 'This is a photo of leftover cooked food. Use category "leftovers" and shelfLifeDays 3.',
};

export default async (req) => {
  try {
    guard(req);
    const body = await readJson(req);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image || '');
    if (!m) throw new HttpError(400, 'bad_image', 'Please send a JPEG, PNG or WebP photo.');
    if (m[2].length > 5_000_000) throw new HttpError(413, 'too_large', 'That photo is too large. Try again.');
    const kind = HINTS[body.kind] ? body.kind : 'fridge';

    const text = await callClaude({
      system: SYSTEM,
      maxTokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          { type: 'text', text: `${HINTS[kind]} List the food items you can see as JSON.` },
        ],
      }],
    });
    const parsed = extractJson(text);
    const cats = ['produce', 'protein', 'dairy', 'grains', 'condiments', 'spices', 'drinks', 'leftovers', 'other'];
    const items = (parsed.items || []).slice(0, 40).map((i) => ({
      name: clean(i.name, 50).toLowerCase().trim(),
      category: cats.includes(i.category) ? i.category : 'other',
      confidence: Math.min(1, Math.max(0, Number(i.confidence) || 0.6)),
      shelfLifeDays: Number.isFinite(Number(i.shelfLifeDays)) && i.shelfLifeDays !== null ? Math.max(1, Math.min(365, Math.round(Number(i.shelfLifeDays)))) : null,
    })).filter((i) => i.name);
    return json({ items });
  } catch (e) {
    return errorResponse(e);
  }
};
