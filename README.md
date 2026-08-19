# Dining Tracker

Georgetown dining calorie/macro logger. Reads hoyaeats.com's own published nutrition
data for every menu item — no calorie estimation, no USDA lookup, no LLM fallback.

## How it works

A daily GitHub Actions cron scrapes Leo's and Epi's menu pages, reads the real
breakfast/lunch/dinner tab structure on each page, and fetches nutrition for any
recipe ID it hasn't seen before. Recipe nutrition is treated as permanent once
cached — the cache only grows. It commits `data/nutrition.json` (the growing cache)
and `data/menu-YYYY-MM-DD.json` (today's menu) to this repo.

The frontend is a plain HTML/CSS/JS static app — no framework — that fetches those
JSON files from `raw.githubusercontent.com`, lets you tap a menu item, set a serving
quantity, and log it to `localStorage`. Wrapped in Capacitor for iOS.

## Dev

```bash
npm install
npm run scrape   # run the scraper once, writes to data/
npm test         # scraper + store self-checks
```

Serve the static frontend locally with any static file server (see
`.claude/launch.json` for the configured dev preview on port 4322).

## iOS

```bash
npm run sync   # copies web files into www/, runs cap sync
npm run open   # opens the Xcode project
```
