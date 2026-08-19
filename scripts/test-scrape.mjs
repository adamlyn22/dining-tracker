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
