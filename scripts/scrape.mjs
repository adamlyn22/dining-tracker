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
