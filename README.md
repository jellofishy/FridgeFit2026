# 🥗 Fridge Fit

**Cook what you already have.** Scan your fridge with your phone camera, and Fridge Fit finds breakfast, lunch and dinner recipes from what's inside, safe for your diet and allergies, then reads them to you hands-free while you cook.

## What it does

- **Scan** your fridge, pantry, spices or leftovers with the camera. AI image recognition lists the ingredients; you review before anything is added. Add or remove items by hand any time.
- **Greets you** with a rotating cute message ("Hi beautiful", "Hi hungry", "What are we cooking today?"…).
- **Diet & allergy profiles**: gluten-free, celiac-safe, vegetarian, vegan, pescatarian, keto, low-carb, paleo, dairy-free, lactose-free, halal, kosher, low-sodium, diabetic-friendly, plus peanut, tree nut, milk, egg, soy, wheat, fish, shellfish and sesame allergies and a custom "avoid" list. Save **separate family profiles** and pick who's eating; meals must work for everyone selected.
  - Safety is enforced in code, not just in an AI prompt: every recipe (built-in *and* AI-generated) is checked ingredient by ingredient, and unsafe ingredients are swapped for safe ones (or the recipe is hidden).
  - A gentle reminder to double-check product labels appears throughout, because a camera can't see hidden gluten, traces of nuts, etc.
- **Filters**: time (15 / 30 / longer / meal prep), mood (comfort, spicy, sweet, light), cuisine explorer (Korean, Mexican, Italian, Indian, Uzbek, Japanese, Thai… or type any cuisine), fitness goal (high-protein, muscle gain, light).
- **Weather-smart picks**: uses your location (or a city) with the free, key-less [Open-Meteo](https://open-meteo.com) API: cozy soups when it's cold or rainy, fresh and light when it's hot.
- **Recipes** show steps, cook time, difficulty and calories/protein/carbs/fat. "You're only 1 ingredient away from Chicken Alfredo", safe substitutions, and one-tap shopping list.
- **Use it before you lose it**: expiry dates, alerts, and recipes that use what's about to go bad. **Leftover ideas** for turning last night's dinner into something new.
- **Hands-free cooking mode**: reads every step aloud; say "next", "back", "repeat", "set a timer for 10 minutes", or ask anything ("What can I use instead of butter?", "How do I know when the chicken is done?") and hear the AI answer spoken back. Uses your browser's built-in speech features.
- **Made** list (most recent first) with a ✓ button, "Cook again", photo sharing with a small **"Made with Fridge Fit"** tag in the corner, cooking streaks and badges (e.g. "7 days of no food waste").
- Light/dark theme toggle that remembers your choice. Phone-first, installable to your home screen.
- Profiles, Made list, shopping list and settings are saved **in your browser** (localStorage). No accounts.

## How it's built

- `public/`: the static front end (plain HTML/CSS/JS modules, no build step).
- `netlify/functions/`: serverless functions that hold your API key so it **never reaches the browser**:
  - `identify`: photo → ingredient list
  - `recipes`: AI recipe ideas (also leftovers and cuisines the built-ins don't cover)
  - `ask`: spoken cooking questions
  - `health`: tells the app whether the AI key is configured
- The app works without any key (manual ingredients + 57 built-in recipes). The key unlocks camera scanning, AI recipes and spoken answers.
- AI provider: [Anthropic Claude](https://console.anthropic.com/) (vision + text). One key covers everything.

## Deploy to Netlify (step by step)

1. **Get an API key.** Create an account at <https://console.anthropic.com/>, add a little credit, and under *API keys* create a key (starts with `sk-ant-`). Copy it somewhere safe.
2. **Create the Netlify site.** Sign in at <https://app.netlify.com/> → **Add new site → Import an existing project** → choose **GitHub** → authorize and pick this repository (`FridgeFit2026`).
3. **Build settings.** Netlify reads `netlify.toml`, so just confirm: *Build command*: empty, *Publish directory*: `public`, *Functions directory*: `netlify/functions`.
4. **Add your API key.** In the site: **Site configuration → Environment variables → Add a variable**:

   | Key | Value | Required |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | your `sk-ant-…` key | **yes** |
   | `ANTHROPIC_MODEL` | e.g. `claude-sonnet-5-5` for higher quality (default: fast, low-cost `claude-haiku-4-5-20251001`) | no |
   | `ACCESS_CODE` | any secret word. If set, people must enter it under *Me → Settings* before the AI features work | no, but recommended |

   Mark the key as a secret value.
5. **Deploy.** Click **Deploy** (or **Deploys → Trigger deploy → Deploy site** if you added variables after the first deploy; variables only apply to new deploys).
6. **Check it.** Open your `https://….netlify.app` URL on your phone → *Me → Settings → AI helper* should say **✅ Connected**. Then scan your fridge! Camera, microphone and location work because Netlify serves HTTPS.

> **Protect your credits.** Anyone who finds your site URL can use the AI endpoints (and spend your credits). Set `ACCESS_CODE`, and set a monthly spend limit in the Anthropic console.

### Run locally (optional)

```bash
npm i -g netlify-cli
cp .env.example .env      # put your key in .env (never commit it)
netlify dev               # http://localhost:8888, serves the site and the functions
npm test                  # runs the diet/allergy safety tests
```

## Notes & limits

- **Voice**: speech input needs Chrome, Edge or Safari. Read-aloud works almost everywhere. Text input is always available as a fallback.
- **Expiry reminders** show in the app and as a browser notification when the app is open (background push is not included).
- **Function timeouts**: Netlify limits how long a function can run (roughly 10–60 s depending on plan). The defaults (fast model, 3 recipes per request) are chosen to fit.
- **Photos & privacy**: photos are sent to your Netlify function and on to Anthropic for recognition and are not stored by this app. Shared dish photos are only saved as small thumbnails in your browser.
- **Nutrition numbers** are estimates. This app is not medical advice. Always read labels and consult a professional for medical diets.
