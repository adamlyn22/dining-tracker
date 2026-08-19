# Georgetown Dining Tracker Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the abandoned Next.js/Supabase dining tracker with a static, calorie/macro
logging PWA that reads Georgetown's own published nutrition data — no estimation, no server,
no database.

**Architecture:** A Node scraper walks the hoyaeats.com Leo's + Epi's menu pages, reads the
real breakfast/lunch/dinner tab panels (confirmed live on 2026-08-19 — each tab is a separate
DOM container, not an inferred position), and for every recipe ID never seen before fetches
Georgetown's public nutrition JSON endpoint. It writes two things to `data/`: a small daily
menu file and a nutrition cache that only ever grows. A GitHub Actions cron runs this daily and
commits the JSON. The frontend is a plain HTML/CSS/JS static app (matching gym-tracker and
reader — no framework) that fetches those JSON files from GitHub, lets Adam tap an item, set a
serving quantity, and log it to `localStorage`. It's wrapped in Capacitor for iOS, same as the
other two apps.

**Tech Stack:** Node.js (scripts, vanilla `fetch` + `cheerio`), plain HTML/CSS/JS frontend
(no framework), Capacitor for iOS packaging, GitHub Actions for the daily scrape, GitHub raw
content as the static data host.

**Spec:** This session's handoff brief (Georgetown Dining Tracker — build session), plus the
three open decisions resolved before this plan was written:
1. Meal period is real DOM structure (tabs `tabid-1/2/3` → panels `tabinfo-1/2/3`), not
   inferred from station position — verified live against
   `https://www.hoyaeats.com/locations/fresh-food-company/`.
2. Scope: Leo's + Epi's only for v1.
3. No periodic re-fetch of cached nutrition for v1 — treat recipe nutrition as permanent.

## Global Constraints

- No calorie/macro estimation anywhere — every number comes from Georgetown's own
  `recipe.php` endpoint. No USDA API, no LLM fallback, no API keys.
- No database, no server-rendered backend. Static JSON files + a static frontend.
- Frontend follows `~/Projects/APP-DESIGN-GUIDELINES.md` verbatim: no emojis, no subtitles,
  no blur, no glow, iPhone 13 Pro Max baseline (428×926pt), dark near-black palette, Capacitor
  for iOS.
- Ponytail: stdlib/already-installed deps only. `cheerio` is already a dependency — reuse it.
  No new npm packages beyond Capacitor's own (`@capacitor/core`, `@capacitor/cli`,
  `@capacitor/ios`).
- Assumption flagged for override: pushing this to a **public** GitHub repo so the app can
  `fetch()` `raw.githubusercontent.com` with no auth. The content is just public dining-hall
  menus, so this defaults to public — say so if you want it private (that needs a token and a
  different fetch path).

---

### Task 1: Repo reset — strip Next.js/Supabase, keep the two files worth reusing

**Files:**
- Delete: `supabase/` (whole dir), `middleware.ts`, `vercel.json`, `.env.local.example`,
  `app/api/` (whole dir), `lib/nutrition.ts`, `lib/supabase/` (whole dir)
- Delete (replaced in Task 2): `app/`, `components/`, `lib/scraper.ts`, `lib/locations.ts`,
  `lib/test-scraper.mjs`, `next.config.ts`, `postcss.config.mjs`, `tailwindcss` config,
  `eslint.config.mjs`, `next-env.d.ts`, `tsconfig.json`
- Create: `package.json` (rewritten), `.gitignore`, `README.md` (rewritten)
- Keep as reference while writing Task 2, then delete: none — read `lib/scraper.ts` and
  `lib/locations.ts` now, port their logic in Task 2, delete the originals in this task.

**Interfaces:** N/A — this task only clears the ground.

- [ ] **Step 1: `git init` in `~/Projects/dining-tracker`**

```bash
cd ~/Projects/dining-tracker && git init
```

- [ ] **Step 2: Delete the Next.js/Supabase/Vercel pieces**

```bash
cd ~/Projects/dining-tracker
rm -rf supabase middleware.ts vercel.json .env.local.example app components \
  lib/nutrition.ts lib/scraper.ts lib/locations.ts lib/test-scraper.mjs lib/supabase \
  next.config.ts postcss.config.mjs eslint.config.mjs next-env.d.ts tsconfig.json \
  public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg
rmdir lib public 2>/dev/null || true
```

- [ ] **Step 3: Replace `package.json`**

```json
{
  "name": "dining-tracker",
  "version": "1.0.0",
  "description": "Georgetown dining calorie/macro tracker. Scrapes hoyaeats.com's own published nutrition data, no estimation. Capacitor for iPhone.",
  "main": "app.js",
  "type": "module",
  "scripts": {
    "scrape": "node scripts/scrape.mjs",
    "test": "node scripts/test-scrape.mjs",
    "sync": "npm test && cp index.html app.js store.js style.css www/ && npx cap sync ios",
    "open": "npx cap open ios"
  },
  "license": "ISC",
  "dependencies": {
    "cheerio": "^1.2.0",
    "@capacitor/core": "^8.5.0"
  },
  "devDependencies": {
    "@capacitor/cli": "^8.5.0",
    "@capacitor/ios": "^8.5.0"
  }
}
```

- [ ] **Step 4: `.gitignore`**

```
node_modules/
ios/
www/
.DS_Store
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "strip Next.js/Supabase, reset for static rebuild"
```

---

### Task 2: Scraper — real tab-based meal period parsing

**Files:**
- Create: `lib/locations.mjs`
- Create: `lib/scraper.mjs`
- Create: `scripts/scrape.mjs`
- Test: `scripts/test-scrape.mjs`

**Interfaces:**
- Produces from `lib/locations.mjs`: `LOCATIONS` — `{ leos: {id, name, url}, epis: {id, name, url} }`.
- Produces from `lib/scraper.mjs`: `scrapeLocation(location) -> Promise<ScrapedItem[]>` where
  `ScrapedItem = {name, station, mealPeriod, recipeId, ingredients, tags, allergens}`.
  `mealPeriod` is `"breakfast" | "lunch" | "dinner"`, read directly off the tab label text
  (lowercased, stripped of the time range), never inferred from position.

- [ ] **Step 1: `lib/locations.mjs`**

```js
export const LOCATIONS = {
  leos: { id: "leos", name: "Leo's", url: "https://www.hoyaeats.com/locations/fresh-food-company/" },
  epis: { id: "epis", name: "Epi's", url: "https://www.hoyaeats.com/locations/epicurean-and-company/" },
};
```

- [ ] **Step 2: `lib/scraper.mjs` — parse each tab panel independently**

```js
import * as cheerio from "cheerio";

function extractTags(classes) {
  return (classes || "")
    .split(/\s+/)
    .filter((c) => c.startsWith("prop-"))
    .map((c) => c.replace("prop-", "").replace(/_/g, " "));
}

function extractAllergens(classes) {
  return (classes || "")
    .split(/\s+/)
    .filter((c) => c.startsWith("allergen-has_"))
    .map((c) => c.replace("allergen-has_", "").replace(/_/g, " "));
}

function mealPeriodFromTabLabel(label) {
  // "Breakfast (7am-9:30am)" -> "breakfast"
  const word = label.trim().toLowerCase().split(/[\s(]/)[0];
  if (["breakfast", "lunch", "dinner", "brunch"].includes(word)) return word;
  return "other";
}

export function parseMenuPage(html) {
  const $ = cheerio.load(html);
  const items = [];

  $("[role=tab]").each((_, tabEl) => {
    const tab = $(tabEl);
    const panelId = tab.attr("aria-controls");
    if (!panelId) return;
    const label = tab.find(".c-tabs-nav__link-inner").first().text();
    const mealPeriod = mealPeriodFromTabLabel(label);
    const panel = $(`#${panelId}`);

    panel.find(".menu-station").each((_, stationEl) => {
      const station = $(stationEl);
      const stationName =
        station.find("button.toggle-menu-station-data").first().text().trim() || "General";

      station.find("li.menu-item-li").each((_, li) => {
        const anchor = $(li).find("a.show-nutrition").first();
        const name = anchor.text().trim();
        if (!name) return;

        const classes = anchor.attr("class") ?? "";
        items.push({
          name,
          station: stationName,
          mealPeriod,
          recipeId: anchor.attr("data-recipe") ?? null,
          ingredients: $(li).attr("data-searchable") ?? null,
          tags: extractTags(classes),
          allergens: extractAllergens(classes),
        });
      });
    });
  });

  return items;
}

export async function scrapeLocation(location) {
  const res = await fetch(location.url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${location.url}: ${res.status}`);
  const html = await res.text();
  return parseMenuPage(html).map((item) => ({ ...item, locationId: location.id }));
}
```

- [ ] **Step 3: Self-check — `scripts/test-scrape.mjs`**

Fixture-free check against the live tab structure, since that structure IS the risk this task
resolves. Run before every scrape as the `test` script.

```js
import assert from "node:assert";
import { LOCATIONS } from "../lib/locations.mjs";
import { scrapeLocation } from "../lib/scraper.mjs";

const items = await scrapeLocation(LOCATIONS.leos);

assert(items.length > 50, `expected a real menu, got ${items.length} items`);

const periods = new Set(items.map((i) => i.mealPeriod));
assert(periods.has("breakfast") && periods.has("lunch") && periods.has("dinner"),
  `missing a meal period, got: ${[...periods]}`);

const withRecipe = items.filter((i) => i.recipeId);
assert(withRecipe.length > 0, "no items carried a recipe ID — selector may have drifted");

console.log(`ok: ${items.length} items across ${periods.size} meal periods, ${withRecipe.length} with recipe IDs`);
```

- [ ] **Step 4: Run it**

```bash
cd ~/Projects/dining-tracker && npm install && node scripts/test-scrape.mjs
```

Expected: `ok: N items across 3 meal periods, M with recipe IDs`

- [ ] **Step 5: Commit**

```bash
git add lib/locations.mjs lib/scraper.mjs scripts/test-scrape.mjs package-lock.json
git commit -m "scraper: real tab-based meal period parsing for Leo's + Epi's"
```

---

### Task 3: Nutrition fetcher + daily writer

**Files:**
- Create: `lib/nutrition.mjs`
- Modify: `scripts/scrape.mjs` (the daily driver script)
- Data (generated, not hand-written): `data/nutrition.json`, `data/menu-YYYY-MM-DD.json`

**Interfaces:**
- Produces from `lib/nutrition.mjs`: `fetchNutrition(recipeId) -> Promise<Nutrition | null>`
  where `Nutrition = {name, servingSize, calories, protein, carbs, fat, fiber, sugar, sodium}`.
  Returns `null` on `success:false` — the caller must skip that recipe, not crash the run.
- `data/nutrition.json` shape: `{ [recipeId]: Nutrition }`, only ever added to, never
  overwritten for an existing key (per the "no re-fetch" decision).
- `data/menu-YYYY-MM-DD.json` shape: `{ date, items: [{name, station, mealPeriod, locationId, recipeId}] }`.

- [ ] **Step 1: `lib/nutrition.mjs`**

```js
import * as cheerio from "cheerio";

function num(text) {
  const match = (text || "").match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

export function parseNutritionHtml(html) {
  const $ = cheerio.load(html);
  const name = $("h2").first().text().trim();

  // Each nutrition row is a <th> whose full text is "Label value unit", e.g.
  // "Total Fat 14 g" or "Amount Per Serving 12.99 oz" — label and value aren't
  // separate elements, so match by prefix and slice it off.
  const rowValue = (label) => {
    let found = null;
    $("table.nutrition-facts-table th").each((_, th) => {
      const text = $(th).text().replace(/\s+/g, " ").trim();
      if (text.toLowerCase().startsWith(label.toLowerCase())) {
        found = text.slice(label.length).trim();
      }
    });
    return found;
  };

  return {
    name,
    servingSize: rowValue("Amount Per Serving") || null,
    calories: num(rowValue("Calories")),
    protein: num(rowValue("Protein")),
    carbs: num(rowValue("Total Carbohydrate")),
    fat: num(rowValue("Total Fat")),
    fiber: num(rowValue("Dietary Fiber")),
    sugar: num(rowValue("Sugars")),
    sodium: num(rowValue("Sodium")),
  };
}

export async function fetchNutrition(recipeId) {
  const url = `https://www.hoyaeats.com/wp-content/themes/nmc_dining/ajax-content/recipe.php?recipe=${recipeId}&hide_allergens=0`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success) return null;
  return parseNutritionHtml(json.html);
}
```

- [ ] **Step 2: `scripts/scrape.mjs` — the daily driver**

```js
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { LOCATIONS } from "../lib/locations.mjs";
import { scrapeLocation } from "../lib/scraper.mjs";
import { fetchNutrition } from "../lib/nutrition.mjs";

const NUTRITION_PATH = new URL("../data/nutrition.json", import.meta.url);
const nutrition = existsSync(NUTRITION_PATH) ? JSON.parse(readFileSync(NUTRITION_PATH, "utf8")) : {};

const results = await Promise.all(Object.values(LOCATIONS).map(scrapeLocation));
const items = results.flat();

const newRecipeIds = [...new Set(items.map((i) => i.recipeId).filter((id) => id && !nutrition[id]))];
console.log(`${items.length} menu items, ${newRecipeIds.length} new recipes to fetch`);

for (const id of newRecipeIds) {
  const info = await fetchNutrition(id);
  if (info) nutrition[id] = info;
  else console.error(`recipe ${id}: fetch failed or returned success:false, skipped`);
  await new Promise((r) => setTimeout(r, 300)); // ponytail: fixed delay, raise if hoyaeats starts rate-limiting
}

writeFileSync(NUTRITION_PATH, JSON.stringify(nutrition, null, 2));

const date = new Date().toISOString().split("T")[0];
const menuItems = items.map(({ name, station, mealPeriod, locationId, recipeId }) => ({
  name, station, mealPeriod, locationId, recipeId,
}));
writeFileSync(new URL(`../data/menu-${date}.json`, import.meta.url), JSON.stringify({ date, items: menuItems }, null, 2));

console.log(`wrote data/menu-${date}.json, nutrition cache now has ${Object.keys(nutrition).length} recipes`);
```

- [ ] **Step 3: Run it once for real and eyeball the output**

```bash
mkdir -p data && node scripts/scrape.mjs
cat data/nutrition.json | node -e "const d=JSON.parse(require('fs').readFileSync(0)); console.log(Object.keys(d).length, 'recipes'); console.log(Object.values(d)[0])"
```

Expected: recipe count > 0, and the sample recipe has non-null `calories`, `protein`, `carbs`, `fat`.

- [ ] **Step 4: Commit**

```bash
git add lib/nutrition.mjs scripts/scrape.mjs data/
git commit -m "nutrition fetcher + daily menu writer, growing recipe cache"
```

---

### Task 4: GitHub Actions daily cron

**Files:**
- Create: `.github/workflows/scrape.yml`

**Interfaces:** N/A — this task schedules Task 3's script and commits its output. Requires the
repo to exist on GitHub (Task 6 covers pushing it) before the schedule will actually fire.

- [ ] **Step 1: `.github/workflows/scrape.yml`**

```yaml
name: Daily menu scrape
on:
  schedule:
    - cron: "0 11 * * *"  # 7am ET (11am UTC) — before breakfast tab goes live
  workflow_dispatch: {}
permissions:
  contents: write
jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: node scripts/scrape.mjs
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/
          git diff --staged --quiet || git commit -m "scrape: $(date -u +%Y-%m-%d)"
          git push
```

- [ ] **Step 2: Commit (this file only takes effect after Task 6 pushes the repo)**

```bash
git add .github/workflows/scrape.yml
git commit -m "daily scrape cron via GitHub Actions"
```

---

### Task 5: Frontend shell — menu view

**Files:**
- Create: `index.html`
- Create: `style.css`
- Create: `app.js`

**Interfaces:**
- Consumes: `data/menu-YYYY-MM-DD.json` and `data/nutrition.json`, fetched from
  `https://raw.githubusercontent.com/<owner>/<repo>/main/data/...` (placeholder owner/repo
  filled in once Task 6 picks the actual GitHub repo name).
- Produces for Task 6: `renderMenu(menuItems, nutritionById)` appends one row per item to
  `#menu-list`, grouped by `mealPeriod` then `station`; each row is `<button class="item-row" data-recipe-id="...">`.
  Task 6 attaches the tap handler to `.item-row`.

- [ ] **Step 1: `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#08080d">
  <title>Dining Tracker</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main id="app">
    <header id="tabs">
      <button class="tab active" data-view="menu">Menu</button>
      <button class="tab" data-view="log">Log</button>
    </header>
    <section id="menu-view" class="view active">
      <div id="menu-list"></div>
    </section>
    <section id="log-view" class="view">
      <div id="log-list"></div>
    </section>
    <div id="qty-sheet" class="sheet hidden">
      <div class="sheet-card">
        <div id="qty-item-name"></div>
        <div class="qty-stepper">
          <button id="qty-minus">-</button>
          <span id="qty-value">1</span>
          <button id="qty-plus">+</button>
        </div>
        <button id="qty-confirm">Log it</button>
      </div>
    </div>
  </main>
  <script src="store.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `style.css` — house tokens from APP-DESIGN-GUIDELINES.md**

```css
:root {
  --bg: #08080d; --surface: #14141c; --surface2: #1c1c28; --card: #0a0a0f;
  --border: rgba(255,255,255,.07); --hair: rgba(255,255,255,.14);
  --text: #e4e4f0; --text-muted: #8a8aa3; --text-dim: #6b6b87;
  --accent: #38bdf8; --accent2: #2dd4bf;
  --display: 'Sora', system-ui, sans-serif;
  --body: -apple-system, 'SF Pro Text', system-ui, sans-serif;
  --ease: cubic-bezier(.22,1,.36,1);
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text); font-family: var(--body);
  padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);
  -webkit-font-smoothing: antialiased;
}
#tabs { display: flex; gap: 8px; padding: 12px 16px; }
.tab {
  flex: 1; padding: 10px; border-radius: 12px; border: 1px solid var(--border);
  background: transparent; color: var(--text-muted); font-family: var(--display);
}
.tab.active { color: var(--text); border-color: var(--hair); background: var(--surface); }
.view { display: none; padding: 0 16px 100px; }
.view.active { display: block; }
.meal-group h2 { font-family: var(--display); font-size: 15px; color: var(--text-dim); margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .04em; }
.station-name { font-size: 12px; color: var(--text-dim); margin: 12px 0 4px; }
.item-row {
  width: 100%; text-align: left; padding: 12px; margin-bottom: 6px; border-radius: 10px;
  background: var(--card); border: 1px solid var(--border); color: var(--text);
  display: flex; justify-content: space-between; font-family: var(--body); font-size: 15px;
}
.item-cal { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.sheet { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; }
.sheet.hidden { display: none; }
.sheet-card { width: 100%; background: var(--surface); border-radius: 20px 20px 0 0; padding: 24px; padding-bottom: calc(24px + env(safe-area-inset-bottom)); }
.qty-stepper { display: flex; align-items: center; gap: 20px; justify-content: center; margin: 20px 0; }
.qty-stepper button { width: 44px; height: 44px; border-radius: 22px; border: 1px solid var(--hair); background: var(--surface2); color: var(--text); font-size: 20px; }
#qty-value { font-family: var(--display); font-size: 24px; font-variant-numeric: tabular-nums; min-width: 40px; text-align: center; }
#qty-confirm { width: 100%; padding: 14px; border-radius: 12px; border: none; background: var(--accent); color: #08080d; font-family: var(--display); font-weight: 600; }
```

- [ ] **Step 3: Commit**

```bash
git add index.html style.css
git commit -m "frontend shell: menu list + log tabs, house design tokens"
```

---

### Task 6: Logging interaction + local store, wire it up

**Files:**
- Create: `store.js`
- Modify: `app.js` (fill in the data-fetch + render + tap-to-log wiring)
- Test: `scripts/test-store.mjs` (runs `store.js`'s pure functions under Node)

**Interfaces:**
- Consumes: `renderMenu` contract from Task 5, `.item-row[data-recipe-id]` DOM contract.
- Produces from `store.js`: `addLogEntry(entry)`, `getTodayLog()`, `computeEntry(nutrition, quantity)`.
  `entry = {recipeId, name, quantity, calories, protein, carbs, fat, loggedAt}`. All calorie/macro
  math on the entry is `perServingValue * quantity`, computed once at log time and stored on the
  entry — never recomputed from a live nutrition lookup later, so a log entry survives a
  nutrition-cache edit.

- [ ] **Step 1: `store.js` — the part that's pure and testable**

```js
function computeEntry(nutrition, quantity) {
  const scale = (v) => (v == null ? null : Math.round(v * quantity * 10) / 10);
  return {
    calories: scale(nutrition.calories),
    protein: scale(nutrition.protein),
    carbs: scale(nutrition.carbs),
    fat: scale(nutrition.fat),
  };
}

function todayKey() {
  return `log-${new Date().toISOString().split("T")[0]}`;
}

function getTodayLog() {
  return JSON.parse(localStorage.getItem(todayKey()) || "[]");
}

function addLogEntry(recipeId, name, nutrition, quantity) {
  const log = getTodayLog();
  log.push({
    recipeId, name, quantity,
    ...computeEntry(nutrition, quantity),
    loggedAt: new Date().toISOString(),
  });
  localStorage.setItem(todayKey(), JSON.stringify(log));
  return log;
}
```

- [ ] **Step 2: Self-check — `scripts/test-store.mjs`**

`store.js` is a plain classic script (loaded via `<script src>`, no module system, no
`export`). Load it into a `vm` context for the test instead of `import`-ing it, so the test
runs the exact file the browser runs rather than a rewritten module version.

```js
import assert from "node:assert";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../store.js", import.meta.url), "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { computeEntry } = sandbox;

const nutrition = { calories: 410, protein: 30, carbs: 43, fat: 14 };
const doubled = computeEntry(nutrition, 2);
assert.strictEqual(doubled.calories, 820, `expected 820 cal at 2x, got ${doubled.calories}`);
assert.strictEqual(doubled.protein, 60, `expected 60g protein at 2x, got ${doubled.protein}`);

const half = computeEntry(nutrition, 0.5);
assert.strictEqual(half.calories, 205, `expected 205 cal at 0.5x, got ${half.calories}`);

console.log("ok: quantity scaling is linear and rounds to 1 decimal");
```

- [ ] **Step 3: Run it**

```bash
node scripts/test-store.mjs
```

Expected: `ok: quantity scaling is linear and rounds to 1 decimal`

- [ ] **Step 4: `app.js` — fetch, render, tap-to-log**

```js
const REPO_RAW = "https://raw.githubusercontent.com/OWNER/dining-tracker/main"; // filled in Task 8 once the repo exists

async function loadData() {
  const date = new Date().toISOString().split("T")[0];
  const cacheKey = `menu-cache-${date}`;
  try {
    const [menuRes, nutritionRes] = await Promise.all([
      fetch(`${REPO_RAW}/data/menu-${date}.json`),
      fetch(`${REPO_RAW}/data/nutrition.json`),
    ]);
    const menu = await menuRes.json();
    const nutrition = await nutritionRes.json();
    localStorage.setItem(cacheKey, JSON.stringify({ menu, nutrition }));
    return { menu, nutrition };
  } catch (e) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
    throw e;
  }
}

function renderMenu(menuItems, nutritionById) {
  const list = document.getElementById("menu-list");
  list.innerHTML = "";
  const byPeriod = { breakfast: [], lunch: [], dinner: [], other: [] };
  menuItems.forEach((i) => (byPeriod[i.mealPeriod] ?? byPeriod.other).push(i));

  for (const period of ["breakfast", "lunch", "dinner"]) {
    if (!byPeriod[period].length) continue;
    const group = document.createElement("div");
    group.className = "meal-group";
    group.innerHTML = `<h2>${period}</h2>`;

    const byStation = {};
    byPeriod[period].forEach((i) => (byStation[i.station] ??= []).push(i));

    for (const [station, stationItems] of Object.entries(byStation)) {
      const label = document.createElement("div");
      label.className = "station-name";
      label.textContent = station;
      group.appendChild(label);

      stationItems.forEach((item) => {
        const info = nutritionById[item.recipeId];
        const row = document.createElement("button");
        row.className = "item-row";
        row.dataset.recipeId = item.recipeId ?? "";
        row.innerHTML = `<span>${item.name}</span><span class="item-cal">${info?.calories ?? "—"} cal</span>`;
        group.appendChild(row);
      });
    }
    list.appendChild(group);
  }
}

function renderLog() {
  const list = document.getElementById("log-list");
  const log = getTodayLog();
  list.innerHTML = log.length
    ? log.map((e) => `<div class="item-row"><span>${e.quantity}x ${e.name}</span><span class="item-cal">${e.calories} cal</span></div>`).join("")
    : `<div class="station-name">Nothing logged yet today.</div>`;
}

let pendingItem = null;
let pendingQty = 1;

function openQtySheet(item, nutrition) {
  pendingItem = item;
  pendingQty = 1;
  document.getElementById("qty-item-name").textContent = item.name;
  document.getElementById("qty-value").textContent = "1";
  document.getElementById("qty-sheet").classList.remove("hidden");
}

async function init() {
  const { menu, nutrition } = await loadData();
  renderMenu(menu.items, nutrition);
  renderLog();

  document.getElementById("menu-list").addEventListener("click", (e) => {
    const row = e.target.closest(".item-row");
    if (!row || !row.dataset.recipeId) return;
    const item = menu.items.find((i) => i.recipeId === row.dataset.recipeId);
    const info = nutrition[row.dataset.recipeId];
    if (item && info) openQtySheet(item, info);
  });

  document.getElementById("qty-minus").onclick = () => {
    pendingQty = Math.max(0.5, pendingQty - 0.5);
    document.getElementById("qty-value").textContent = pendingQty;
  };
  document.getElementById("qty-plus").onclick = () => {
    pendingQty += 0.5;
    document.getElementById("qty-value").textContent = pendingQty;
  };
  document.getElementById("qty-confirm").onclick = () => {
    const info = nutrition[pendingItem.recipeId];
    addLogEntry(pendingItem.recipeId, pendingItem.name, info, pendingQty);
    document.getElementById("qty-sheet").classList.add("hidden");
    renderLog();
  };

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`${tab.dataset.view}-view`).classList.add("active");
    };
  });
}

init();
```

- [ ] **Step 5: Commit**

```bash
git add store.js app.js scripts/test-store.mjs
git commit -m "logging interaction: tap item, set quantity, log to localStorage"
```

---

### Task 7: Capacitor wrap + local dev preview

**Files:**
- Create: `capacitor.config.json`
- Create: `.claude/launch.json`
- Create: `www/` (populated by `npm run sync`, gitignored)

**Interfaces:** N/A — packaging only.

- [ ] **Step 1: `capacitor.config.json`**

```json
{
  "appId": "com.adamlyn.diningtracker",
  "appName": "Dining Tracker",
  "webDir": "www",
  "ios": { "contentInset": "never" },
  "server": { "iosScheme": "capacitor" }
}
```

- [ ] **Step 2: `.claude/launch.json` — for `preview_start` during dev**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "dining-tracker-static",
      "runtimeExecutable": "python3",
      "runtimeArgs": ["-m", "http.server", "4322", "--directory", "/Users/adamlyn/Projects/dining-tracker"],
      "port": 4322
    }
  ]
}
```

- [ ] **Step 3: Install Capacitor and do the first sync**

```bash
cd ~/Projects/dining-tracker
npm install
mkdir -p www
npx cap add ios
npm run sync
```

- [ ] **Step 4: Commit (www/ and ios/ stay gitignored, matching reader/gym-tracker)**

```bash
git add capacitor.config.json .claude/launch.json
git commit -m "Capacitor iOS packaging + dev preview config"
```

---

### Task 8: Push to GitHub, point the frontend at the real repo

**Files:**
- Modify: `app.js` (replace the `OWNER` placeholder in `REPO_RAW`)

**Interfaces:** N/A — this closes the loop the earlier tasks left open (Task 4's cron needs a
remote to push to; Task 6's `app.js` needs a real raw-content URL).

- [ ] **Step 1: Create the GitHub repo (public, per the default in Global Constraints) and push**

```bash
cd ~/Projects/dining-tracker
gh repo create dining-tracker --public --source=. --remote=origin
git push -u origin main
```

- [ ] **Step 2: Fill in the real owner in `app.js`**

Replace `const REPO_RAW = "https://raw.githubusercontent.com/OWNER/dining-tracker/main";`
with the actual GitHub username from `gh repo view --json owner -q .owner.login`.

- [ ] **Step 3: Confirm the Action fires and data lands**

```bash
gh workflow run scrape.yml
gh run watch
```

Expected: run succeeds, `data/menu-<today>.json` and `data/nutrition.json` appear in the repo.

- [ ] **Step 4: Commit + push**

```bash
git add app.js
git commit -m "point frontend at the real GitHub raw-content URL"
git push
```

---

### Task 9: Vault + memory cleanup

**Files:**
- Modify: `~/second-brain/Projects/dining-hall-tracker.md`

**Interfaces:** N/A.

- [ ] **Step 1:** Update the vault note to reflect the rebuild — remove the "abandoned"
  framing, record the hoyaeats nutrition-endpoint finding, the new no-database/static-JSON
  architecture, and a link to this plan file. Log the session per the vault's `CLAUDE.md`
  rules (`obsidian-log` skill).

- [ ] **Step 2:** Update memory: `project_dining_tracker.md` (new) covering the revived
  project, the hoyaeats endpoint, the architecture, and where the code lives — replacing
  whatever the old (if any) memory said about it being killed.

---

## Self-Review

**Spec coverage:** meal-period risk (Task 2, verified against real DOM), scope decision
(Task 2/3 hardcode Leo's+Epi's only), no-re-fetch decision (Task 3's cache is additive-only,
no TTL logic), no-estimation constraint (every number traces to `recipe.php`), quantity-based
logging as a real interaction (Task 6's stepper + linear scaling), static/no-DB architecture
(Tasks 2-4 are files + a cron, no server), Capacitor packaging (Task 7), design guidelines
(Task 5's `style.css` tokens copied verbatim from the house doc). Vault/memory update from the
handoff's closing instruction is Task 9.

**Placeholder scan:** the one deliberate placeholder is `OWNER` in Task 6's `app.js`, which
Task 8 explicitly exists to resolve once the repo has a real name — flagged inline, not left
implicit.

**Type consistency:** `ScrapedItem`/menu item shape (`name, station, mealPeriod, locationId,
recipeId, ingredients, tags, allergens`) is produced in Task 2, trimmed to
`{name, station, mealPeriod, locationId, recipeId}` for the committed daily file in Task 3, and
consumed with exactly those field names in Task 6's `renderMenu`/tap handler. `Nutrition` shape
(`name, servingSize, calories, protein, carbs, fat, fiber, sugar, sodium`) is produced in
Task 3 and consumed in Task 6's `computeEntry`/render using only the four macro fields it
needs — consistent subset, no renamed fields.
