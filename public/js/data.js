// Static reference data: diets, allergies, ingredient tagging rules, substitutions, copy.

export const DIETS = [
  { id: 'gluten-free', label: 'Gluten-free', emoji: '🌾', forbid: ['gluten'] },
  { id: 'celiac', label: 'Celiac-safe (strict)', emoji: '🛡️', forbid: ['gluten', 'gluten-risk'] },
  { id: 'vegetarian', label: 'Vegetarian', emoji: '🥕', forbid: ['meat', 'pork', 'poultry', 'fish', 'shellfish', 'gelatin'] },
  { id: 'vegan', label: 'Vegan', emoji: '🌱', forbid: ['meat', 'pork', 'poultry', 'fish', 'shellfish', 'gelatin', 'dairy', 'egg', 'honey'] },
  { id: 'pescatarian', label: 'Pescatarian', emoji: '🐟', forbid: ['meat', 'pork', 'poultry'] },
  { id: 'keto', label: 'Keto', emoji: '🥑', forbid: ['high-carb', 'sugar'], maxCarbs: 20 },
  { id: 'low-carb', label: 'Low-carb', emoji: '🥦', forbid: [], maxCarbs: 35 },
  { id: 'paleo', label: 'Paleo', emoji: '🍖', forbid: ['grain', 'dairy', 'legume', 'sugar', 'soy'] },
  { id: 'dairy-free', label: 'Dairy-free', emoji: '🥛', forbid: ['dairy'] },
  { id: 'lactose-free', label: 'Lactose-free', emoji: '🧀', forbid: ['lactose'] },
  { id: 'halal', label: 'Halal', emoji: '☪️', forbid: ['pork', 'alcohol', 'gelatin'] },
  { id: 'kosher', label: 'Kosher', emoji: '✡️', forbid: ['pork', 'shellfish'], kosher: true },
  { id: 'low-sodium', label: 'Low-sodium', emoji: '🧂', forbid: ['sodium'] },
  { id: 'diabetic', label: 'Diabetic-friendly', emoji: '🩺', forbid: ['sugar'], maxCarbs: 55 },
];

export const ALLERGIES = [
  { id: 'peanuts', label: 'Peanuts', emoji: '🥜', forbid: ['peanuts'] },
  { id: 'tree-nuts', label: 'Tree nuts', emoji: '🌰', forbid: ['nuts'] },
  { id: 'milk', label: 'Milk', emoji: '🥛', forbid: ['dairy'] },
  { id: 'eggs', label: 'Eggs', emoji: '🥚', forbid: ['egg'] },
  { id: 'soy', label: 'Soy', emoji: '🫘', forbid: ['soy'] },
  { id: 'wheat', label: 'Wheat', emoji: '🌾', forbid: ['gluten'] },
  { id: 'fish', label: 'Fish', emoji: '🐟', forbid: ['fish'] },
  { id: 'shellfish', label: 'Shellfish', emoji: '🦐', forbid: ['shellfish'] },
  { id: 'sesame', label: 'Sesame', emoji: '⚪', forbid: ['sesame'] },
];

// ---------------------------------------------------------------------------
// Ingredient tagging. OVERRIDES win outright (first match); otherwise every RULE that matches adds its tag.
// ---------------------------------------------------------------------------
export const OVERRIDES = [
  [/flax(seed)? egg|chia egg|egg replacer|egg substitute/, []],
  [/peanut/, ['peanuts', 'legume']],
  [/(almond|cashew|hazelnut|walnut|pecan|pistachio) (milk|butter|flour|meal|cream)/, ['nuts']],
  [/coconut (milk|cream|oil|aminos|yogurt|flour|water|sugar)/, []],
  [/(oat|rice|hemp|pea) milk/, []],
  [/soy ?(milk|yogurt)/, ['soy', 'legume']],
  [/butternut|nutmeg|water chestnut|cocoa butter|shea butter|cream of tartar|nutritional yeast/, []],
  [/eggplant|aubergine/, []],
  [/butter beans?|lima beans?/, ['legume']],
  [/green beans?|string beans?|snap peas?|snow peas?/, []],
  [/sunflower (seed )?butter|sunflower seeds?|pumpkin seeds?/, []],
  [/cauliflower rice|zucchini noodles?|zoodles?|spaghetti squash|rice vinegar|rice wine vinegar|rice paper/, []],
  [/(rice|glass|bean thread|cellophane|sweet potato|shirataki) (noodle|vermicelli)s?|rice vermicelli|rice sticks?/, ['high-carb', 'grain']],
  [/(rice|corn|chickpea|gram|besan|tapioca|potato|cassava|buckwheat) (flour|starch)|cornstarch|corn starch|buckwheat/, ['high-carb']],
  [/almond flour|almond meal/, ['nuts']],
  [/corn tortillas?|tortilla chips?|corn chips?|taco shells?|polenta|cornmeal|grits/, ['high-carb', 'grain']],
  [/coconut/, []],
  [/hummus/, ['sesame', 'legume']],
  [/tahini|halva|halvah/, ['sesame']],
  [/soy sauce|shoyu|teriyaki/, ['soy', 'gluten', 'sodium']],
  [/tamari/, ['soy', 'sodium']],
  [/gochujang/, ['soy', 'gluten', 'sodium', 'gluten-risk']],
  [/doenjang|miso/, ['soy', 'sodium', 'gluten-risk']],
  [/hoisin/, ['soy', 'gluten', 'sodium', 'sugar']],
  [/fish sauce/, ['fish', 'sodium']],
  [/oyster sauce/, ['shellfish', 'sodium', 'gluten']],
  [/worcestershire/, ['fish', 'sodium', 'gluten-risk']],
  [/kimchi/, ['fish', 'sodium']],
  [/(vegetable|veggie|mushroom) (broth|stock|bouillon)/, ['sodium', 'gluten-risk']],
  [/(chicken|turkey) (broth|stock|bouillon)/, ['poultry', 'sodium', 'gluten-risk']],
  [/(beef|bone) (broth|stock|bouillon)/, ['meat', 'sodium', 'gluten-risk']],
  [/\b(broth|stock|bouillon)\b/, ['sodium', 'gluten-risk']],
];

export const RULES = [
  ['meat', /\b(beef|steak|mince|lamb|mutton|veal|goat|brisket|venison|ground meat|meatball|sirloin|ribeye|oxtail)\b/],
  ['pork', /\b(pork|bacon|ham|prosciutto|pancetta|chorizo|pepperoni|lard|salami|sausage|hot dog|bratwurst)\b/],
  ['poultry', /\b(chicken|turkey|duck|goose|hen)\b/],
  ['fish', /\b(fish|salmon|tuna|cod|tilapia|halibut|trout|sardines?|anchov(y|ies)|mackerel|haddock|sea bass|snapper|herring|mahi)\b/],
  ['shellfish', /\b(shrimps?|prawns?|crab|lobster|scallops?|clams?|mussels?|oysters?|squid|calamari|crawfish|crayfish)\b/],
  ['gelatin', /\b(gelatin|gelatine|marshmallows?|gummy|gummies)\b/],
  ['dairy', /\b(milk|cheese|butter|cream|yogh?urt|ghee|paneer|parmesan|parmigiano|mozzarella|cheddar|feta|ricotta|mascarpone|whey|custard|halloumi|kefir|buttermilk|queso|gouda|brie|labneh|half[- ]and[- ]half|casein|gruyere|provolone|swiss|pecorino|cotija|ice cream|goat cheese)\b/],
  ['egg', /\b(eggs?|mayonnaise|mayo|aioli|meringue|egg noodles?)\b/],
  ['gluten', /\b(wheat|flour|bread|breadcrumbs?|panko|pasta|spaghetti|penne|fettuccine|linguine|macaroni|lasagn?a|noodles?|ramen|udon|soba|couscous|bulgur|semolina|barley|rye|seitan|tortillas?|pita|naan|chapati|roti|baguette|buns?|bagels?|crackers?|cereal|beer|biscuits?|croissants?|wontons?|dumpling|farro|spelt|orzo|gnocchi|pizza|cake|cookies?|oats?|oatmeal|granola|malt|croutons?)\b/],
  ['gluten-risk', /\b(oats?|oatmeal|granola|sausage|hot dog|seasoning|spice mix|curry paste|ketchup|mustard|salad dressing|dressing|malt|imitation|soup mix|gravy|marinade)\b/],
  ['nuts', /\b(almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|macadamias?|brazil nuts?|pine nuts?|chestnuts?|nuts?|praline|marzipan|nutella|pesto|granola)\b/],
  ['soy', /\b(soy|soya|tofu|tempeh|edamame|natto|soybeans?)\b/],
  ['sesame', /\b(sesame|tahini)\b/],
  ['honey', /\b(honey)\b/],
  ['alcohol', /\b(wine|beer|rum|vodka|sake|mirin|brandy|bourbon|sherry|liqueur|whiskey|vermouth|cooking wine)\b/],
  ['sugar', /\b(sugar|honey|maple|syrup|jam|jelly|chocolate|candy|cake|cookies?|molasses|agave|nutella|ice cream|condensed milk|marshmallows?|cereal|granola|ketchup|jaggery|mirin)\b/],
  ['grain', /\b(rice|oats?|oatmeal|quinoa|barley|corn|couscous|bulgur|millet|wheat|flour|bread|breadcrumbs?|panko|pasta|spaghetti|penne|fettuccine|linguine|macaroni|lasagn?a|noodles?|ramen|udon|soba|tortillas?|pita|naan|chapati|roti|buns?|bagels?|cereal|crackers?|semolina|farro|orzo|gnocchi|polenta|granola|croutons?|arborio)\b/],
  ['high-carb', /\b(potato|potatoes|sweet potato|banana|mango|raisins?|dates?|plantain|cassava|yam)\b/],
  ['legume', /\b(beans?|lentils?|chickpeas?|peas?|peanuts?|soy|tofu|tempeh|edamame|hummus|dal|dhal|mung|garbanzo)\b/],
  ['sodium', /\b(bacon|ham|salami|prosciutto|pepperoni|sausage|hot dog|olives?|pickles?|capers?|feta|halloumi|parmesan|ketchup|anchov(y|ies)|sauerkraut|chips|jerky|canned soup|bouillon|cured|smoked)\b/],
  ['lactose', /\b(milk|cream|yogh?urt|ricotta|mascarpone|cottage|paneer|custard|kefir|buttermilk|queso|half[- ]and[- ]half|ice cream|labneh|feta|mozzarella|whey|condensed|cheese)\b/],
];

// Qualifiers in an ingredient name that strip a tag ("gluten-free pasta", "vegan butter").
const MODS = [
  [/\bgluten[- ]free\b/g, ['gluten', 'gluten-risk']],
  [/\b(dairy[- ]free|non[- ]dairy)\b/g, ['dairy', 'lactose']],
  [/\blactose[- ]free\b/g, ['lactose']],
  [/\b(vegan|plant[- ]based)\b/g, ['dairy', 'lactose', 'egg', 'honey', 'meat', 'pork', 'poultry', 'fish', 'shellfish', 'gelatin']],
  [/\b(low|reduced|no)[- ]sodium\b|\bunsalted\b/g, ['sodium']],
  [/\bsugar[- ]free\b/g, ['sugar']],
];
const LACTOSE_LOW = /\b(butter|ghee|parmesan|parmigiano|cheddar|gouda|swiss|pecorino|gruyere|manchego|aged)\b/;

export function ingredientTags(rawName) {
  let name = String(rawName || '').toLowerCase().trim();
  const strip = new Set();
  for (const [re, tags] of MODS) {
    if (re.test(name)) { tags.forEach(t => strip.add(t)); name = name.replace(re, ' ').replace(/\s+/g, ' ').trim(); }
    re.lastIndex = 0;
  }
  const tags = new Set();
  const ov = OVERRIDES.find(([re]) => re.test(name));
  if (ov) ov[1].forEach(t => tags.add(t));
  else for (const [tag, re] of RULES) if (re.test(name)) tags.add(tag);
  if (tags.has('lactose') && LACTOSE_LOW.test(name) && !/\b(milk|cream|yogh?urt)\b/.test(name)) tags.delete('lactose');
  if (tags.has('grain')) tags.add('high-carb');
  if (tags.has('sugar') && /\b(honey|maple|syrup|sugar)\b/.test(name)) tags.add('high-carb');
  strip.forEach(t => tags.delete(t));
  return tags;
}

// ---------------------------------------------------------------------------
// Substitutions: first option that passes the active restrictions is used.
// ---------------------------------------------------------------------------
export const SUBS = [
  [/^butter$|^ghee$/, ['olive oil', 'coconut oil', 'vegan butter']],
  [/^(whole |skim )?milk$/, ['coconut milk', 'oat milk', 'soy milk', 'almond milk', 'rice milk']],
  [/cream$/, ['coconut cream', 'coconut milk', 'cashew cream']],
  [/yogh?urt/, ['coconut yogurt', 'soy yogurt', 'almond yogurt']],
  [/sour cream/, ['coconut yogurt', 'mashed avocado']],
  [/(parmesan|cheddar|mozzarella|cheese|feta|queso|gouda|paneer)/, ['nutritional yeast', 'vegan cheese', 'avocado']],
  [/^eggs?$/, ['flax egg', 'mashed banana', 'tofu', 'chickpea flour']],
  [/mayo/, ['vegan mayo', 'mashed avocado', 'coconut yogurt']],
  [/^honey$/, ['maple syrup', 'agave syrup']],
  [/^(white |brown )?sugar$/, ['maple syrup', 'monk fruit sweetener']],
  [/soy sauce/, ['tamari', 'coconut aminos', 'low-sodium soy sauce']],
  [/fish sauce/, ['coconut aminos', 'tamari', 'soy sauce']],
  [/oyster sauce/, ['coconut aminos', 'tamari']],
  [/(spaghetti|penne|fettuccine|linguine|macaroni|pasta|orzo)/, ['gluten-free pasta', 'rice noodles', 'zucchini noodles']],
  [/(egg noodles|noodles)/, ['rice noodles', 'gluten-free pasta', 'zucchini noodles']],
  [/^(flour tortillas?|tortillas?)$/, ['corn tortillas', 'lettuce leaves']],
  [/^(bread|bun|pita|naan)$/, ['gluten-free bread', 'corn tortillas', 'lettuce leaves']],
  [/(breadcrumbs|panko)/, ['gluten-free breadcrumbs', 'crushed cornflakes', 'ground flaxseed']],
  [/^(all-purpose |plain |wheat )?flour$/, ['rice flour', 'cornstarch', 'chickpea flour']],
  [/^(couscous|bulgur)$/, ['quinoa', 'cauliflower rice', 'rice']],
  [/^oats$|rolled oats/, ['gluten-free oats', 'quinoa flakes', 'chia seeds']],
  [/^rice$|basmati|jasmine|cooked rice/, ['cauliflower rice', 'quinoa']],
  [/arborio/, ['cauliflower rice', 'quinoa']],
  [/^potatoes?$/, ['cauliflower', 'turnip', 'celeriac']],
  [/(peanut butter)/, ['sunflower seed butter', 'tahini', 'almond butter']],
  [/^peanuts$|^cashews$|^almonds$|^walnuts$|nuts/, ['pumpkin seeds', 'sunflower seeds']],
  [/tahini/, ['sunflower seed butter']],
  [/^(mirin|white wine|red wine|cooking wine|wine)$/, ['vegetable broth', 'rice vinegar', 'apple juice']],
  [/^beer$/, ['vegetable broth']],
  [/^(chicken|turkey)( breast| thigh)?s?$|chicken/, ['tofu', 'chickpeas', 'mushrooms', 'turkey', 'beef']],
  [/(beef|lamb|steak|ground beef|mince)/, ['mushrooms', 'lentils', 'chicken thigh', 'tofu']],
  [/(pork|bacon|ham|sausage|chorizo|pancetta|pork belly)/, ['mushrooms', 'chicken thigh', 'tofu']],
  [/(shrimp|prawns?)/, ['chicken breast', 'tofu', 'mushrooms', 'zucchini']],
  [/(salmon|fish|cod|tuna|white fish)/, ['chicken breast', 'tofu', 'chickpeas', 'mushrooms']],
  [/tofu/, ['chickpeas', 'chicken breast', 'mushrooms']],
  [/(chicken|beef|pork) (broth|stock)/, ['vegetable broth', 'water']],
  [/vegetable broth/, ['low-sodium vegetable broth', 'water']],
  [/ketchup/, ['tomato paste', 'crushed tomatoes']],
  [/(lemon|lime) juice/, ['vinegar']],
];

export const STAPLE_RE = /^(salt|black pepper|pepper|water|olive oil|cooking oil|vegetable oil|oil|ice)$/;

// ---------------------------------------------------------------------------
// Pantry helpers
// ---------------------------------------------------------------------------
export const LOCATIONS = [
  { id: 'fridge', label: 'Fridge', emoji: '🧊' },
  { id: 'pantry', label: 'Pantry', emoji: '🥫' },
  { id: 'spices', label: 'Spices', emoji: '🧂' },
  { id: 'leftover', label: 'Leftovers', emoji: '🍲' },
];

export const CATEGORY_EMOJI = {
  produce: '🥬', protein: '🍗', dairy: '🧀', grains: '🍚', condiments: '🫙', spices: '🧂', drinks: '🥤', leftovers: '🍲', other: '🍽️',
};

// default shelf life (days) when nothing better is known; null = doesn't expire soon
export const SHELF_LIFE = [
  [/(leftover)/, 3],
  [/(spinach|lettuce|arugula|herb|basil|cilantro|parsley|dill|mint|berries|strawberr|raspberr|mushroom|sprouts)/, 4],
  [/(chicken|beef|pork|fish|salmon|shrimp|turkey|lamb|mince|ground|sausage|bacon)/, 3],
  [/(milk|cream|yogh?urt|tofu)/, 7],
  [/(avocado|tomato|banana|zucchini|cucumber|pepper|broccoli|cauliflower)/, 6],
  [/(egg)/, 21],
  [/(cheese|butter|carrot|cabbage|apple|orange|lemon|lime|celery|onion|potato|garlic|kimchi)/, 20],
];

export const COMMON_ITEMS = ['eggs', 'milk', 'butter', 'onion', 'garlic', 'tomato', 'chicken breast', 'rice', 'pasta', 'cheese', 'spinach', 'carrot', 'potato', 'bell pepper', 'lemon', 'bread'];

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------
export const GREETINGS = [
  'Hi beautiful', 'Hi hungry', 'What are we cooking today?', 'Hey chef ✨', 'Hello, sunshine',
  'Feeling snacky?', "Let's make something yummy", "Look what's in the fridge!", 'Hi gorgeous',
  'Dinner dilemma? I got you', "Hungry? Let's fix that", 'Your fridge has potential', 'Ready to get cozy in the kitchen?',
];

export const MEALS = [
  { id: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { id: 'lunch', label: 'Lunch', emoji: '🥗' },
  { id: 'dinner', label: 'Dinner', emoji: '🍽️' },
];

export const TIME_FILTERS = [
  { id: '15', label: '15 min' },
  { id: '30', label: '30 min' },
  { id: 'long', label: 'Longer' },
  { id: 'prep', label: 'Meal prep' },
];

export const MOODS = [
  { id: 'comfort', label: 'Comfort', emoji: '🫶' },
  { id: 'spicy', label: 'Spicy', emoji: '🌶️' },
  { id: 'sweet', label: 'Sweet', emoji: '🍯' },
  { id: 'light', label: 'Light', emoji: '🥬' },
];

export const GOALS = [
  { id: 'high-protein', label: 'High-protein', emoji: '💪' },
  { id: 'muscle', label: 'Muscle gain', emoji: '🏋️' },
  { id: 'light', label: 'Light meals', emoji: '🪶' },
];

export const LABEL_REMINDER = "A camera can't see hidden ingredients like gluten in sauces or traces of nuts. Please double-check product labels.";

// ---------------------------------------------------------------------------
// Leftover ideas (offline). `needs` are extra ingredients checked against the profile.
// ---------------------------------------------------------------------------
export const LEFTOVER_IDEAS = [
  { keys: ['rice'], ideas: [
    { title: 'Crispy fried rice', needs: ['egg', 'soy sauce', 'green onion'], how: 'Fry cold rice in a hot pan with oil until it crackles, push aside, scramble in an egg, then toss with soy sauce, peas and green onion.' },
    { title: 'Stuffed peppers', needs: ['bell pepper', 'cheese', 'tomato'], how: 'Mix rice with chopped tomato and cheese, spoon into halved bell peppers and bake at 190°C / 375°F for 25 minutes.' },
    { title: 'Cinnamon rice pudding', needs: ['milk', 'cinnamon', 'sugar'], how: 'Simmer rice with milk, a little sugar and cinnamon for 10 minutes until creamy.' },
  ] },
  { keys: ['chicken', 'turkey'], ideas: [
    { title: 'Chicken quesadilla', needs: ['tortilla', 'cheese'], how: 'Shred the chicken, layer with cheese in a tortilla and crisp on both sides in a dry pan.' },
    { title: 'Chicken salad wrap', needs: ['yogurt', 'celery', 'tortilla'], how: 'Mix shredded chicken with yogurt, chopped celery, salt and pepper; roll into a wrap with greens.' },
    { title: 'Quick chicken soup', needs: ['carrot', 'onion', 'chicken broth'], how: 'Simmer carrot, onion and broth for 15 minutes, then add the chicken to warm through.' },
  ] },
  { keys: ['pasta', 'spaghetti', 'noodle', 'macaroni'], ideas: [
    { title: 'Pasta frittata', needs: ['egg', 'cheese'], how: 'Stir pasta into beaten eggs with cheese, pour into an oiled pan and cook 4 minutes per side.' },
    { title: 'Cold pasta salad', needs: ['tomato', 'cucumber', 'olive oil', 'lemon'], how: 'Toss pasta with chopped tomato, cucumber, olive oil, lemon juice, salt and pepper.' },
    { title: 'Crispy pasta bake', needs: ['tomato', 'mozzarella'], how: 'Mix pasta with tomato sauce, top with mozzarella and bake until bubbling and golden.' },
  ] },
  { keys: ['bread', 'toast', 'baguette', 'bun'], ideas: [
    { title: 'French toast', needs: ['egg', 'milk', 'cinnamon'], how: 'Soak stale slices in beaten egg, milk and cinnamon, then pan-fry until golden.' },
    { title: 'Garlic croutons', needs: ['olive oil', 'garlic'], how: 'Cube the bread, toss with olive oil, garlic and salt, bake at 200°C / 400°F for 10 minutes.' },
    { title: 'Tomato panzanella', needs: ['tomato', 'cucumber', 'olive oil'], how: 'Toss torn bread with tomato, cucumber, olive oil and vinegar and let it soak for 10 minutes.' },
  ] },
  { keys: ['potato', 'potatoes', 'mash'], ideas: [
    { title: 'Crispy potato hash', needs: ['onion', 'egg'], how: 'Dice potatoes and fry with onion until crisp; top with a fried egg.' },
    { title: 'Potato pancakes', needs: ['egg', 'flour', 'onion'], how: 'Mash potato with egg, a spoon of flour and chopped onion; pan-fry little patties until golden.' },
  ] },
  { keys: ['beef', 'steak', 'pork', 'lamb', 'meat', 'roast'], ideas: [
    { title: 'Quick tacos', needs: ['tortilla', 'onion', 'lime'], how: 'Slice the meat thin, warm in a pan with chili powder and cumin, and pile into tortillas with onion and lime.' },
    { title: 'Meat & veggie stir-fry', needs: ['soy sauce', 'bell pepper', 'garlic'], how: 'Stir-fry garlic and bell pepper, add sliced meat and a splash of soy sauce for 2 minutes.' },
  ] },
  { keys: ['salmon', 'fish', 'tuna', 'cod'], ideas: [
    { title: 'Flaked fish cakes', needs: ['egg', 'breadcrumbs', 'lemon'], how: 'Mix flaked fish with egg, breadcrumbs and lemon zest, shape into patties and pan-fry 3 minutes per side.' },
    { title: 'Fish salad bowl', needs: ['lettuce', 'cucumber', 'lemon'], how: 'Flake fish over greens and cucumber with lemon juice and olive oil.' },
  ] },
  { keys: ['egg', 'eggs'], ideas: [
    { title: 'Egg salad toast', needs: ['yogurt', 'bread', 'mustard'], how: 'Chop boiled eggs, mix with yogurt, mustard, salt and pepper, and pile on toast.' },
  ] },
  { keys: ['bean', 'beans', 'lentil', 'lentils', 'chickpea', 'chickpeas'], ideas: [
    { title: 'Loaded bean burrito', needs: ['tortilla', 'salsa', 'cheese'], how: 'Warm the beans with a pinch of cumin, roll up with salsa and cheese.' },
    { title: 'Crispy bean patties', needs: ['onion', 'breadcrumbs'], how: 'Mash beans with chopped onion and breadcrumbs, shape into patties and pan-fry until crisp.' },
  ] },
  { keys: ['soup', 'stew', 'curry', 'chili'], ideas: [
    { title: 'Over-rice bowl', needs: ['rice'], how: 'Reheat gently and ladle over fresh rice or toasted bread for a whole new meal.' },
    { title: 'Baked stuffed potato', needs: ['potato', 'cheese'], how: 'Bake a potato, split it, and top with the reheated leftovers.' },
  ] },
  { keys: ['vegetable', 'veggies', 'veg', 'broccoli', 'carrot', 'roasted', 'spinach', 'zucchini', 'pepper'], ideas: [
    { title: 'Leftover-veggie frittata', needs: ['egg', 'cheese'], how: 'Scatter the veggies into an oiled pan, pour over beaten eggs and cook until set.' },
    { title: 'Blender veggie soup', needs: ['vegetable broth', 'garlic'], how: 'Simmer veggies with garlic and broth for 10 minutes, then blend until smooth.' },
  ] },
  { keys: ['banana', 'apple', 'fruit', 'berries', 'berry', 'mango', 'peach'], ideas: [
    { title: 'Smoothie', needs: ['yogurt', 'milk'], how: 'Blend overripe fruit with yogurt and a splash of milk.' },
    { title: 'Warm fruit compote', needs: ['cinnamon'], how: 'Simmer chopped fruit with a spoon of water and cinnamon for 8 minutes; serve over oats or yogurt.' },
  ] },
  { keys: ['pizza'], ideas: [
    { title: 'Pizza breakfast scramble', needs: ['egg'], how: 'Chop the pizza, crisp it in a pan and scramble eggs over the top.' },
  ] },
  { keys: ['tortilla', 'tortillas', 'wrap'], ideas: [
    { title: 'Baked tortilla chips', needs: ['olive oil'], how: 'Cut into triangles, brush with oil and salt, bake at 200°C / 400°F for 8 minutes.' },
  ] },
];
