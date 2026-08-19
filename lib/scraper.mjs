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
