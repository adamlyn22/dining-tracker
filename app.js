const REPO_RAW = "https://raw.githubusercontent.com/adamlyn22/dining-tracker/main";
// Local dev server serves data/ directly; only the Capacitor-wrapped app needs the GitHub fetch.
const DATA_BASE = location.hostname === "localhost" ? "." : REPO_RAW;

async function loadData() {
  const date = new Date().toISOString().split("T")[0];
  const cacheKey = `menu-cache-${date}`;
  try {
    const [menuRes, nutritionRes] = await Promise.all([
      fetch(`${DATA_BASE}/data/menu-${date}.json`),
      fetch(`${DATA_BASE}/data/nutrition.json`),
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

function openQtySheet(item) {
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
    if (item && info) openQtySheet(item);
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
