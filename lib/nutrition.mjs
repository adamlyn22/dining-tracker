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
