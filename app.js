const REPO_RAW = "https://raw.githubusercontent.com/adamlyn22/dining-tracker/main";
// Local dev server serves data/ directly; only the Capacitor-wrapped app needs the GitHub fetch.
const DATA_BASE = location.hostname === "localhost" ? "." : REPO_RAW;

const MEALS = ["breakfast", "lunch", "dinner"];
const $ = (id) => document.getElementById(id);

let MENU = [];
let NUTRITION = {};
let pickerMeal = null;
let pending = null;
let pendingQty = 1;

/* ---------------- data ---------------- */

async function loadData() {
  const date = new Date().toISOString().split("T")[0];
  const cacheKey = `menu-cache-${date}`;
  try {
    const [menuRes, nutritionRes] = await Promise.all([
      fetch(`${DATA_BASE}/data/menu-${date}.json`),
      fetch(`${DATA_BASE}/data/nutrition.json`),
    ]);
    if (!menuRes.ok || !nutritionRes.ok) throw new Error("fetch failed");
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

/* ---------------- diary ---------------- */

function renderSummary(log) {
  const goal = getGoal();
  const t = logTotals(log);
  const food = Math.round(t.calories);
  const left = goal - food;

  $("cal-goal").textContent = goal;
  $("cal-food").textContent = food;
  $("cal-left").textContent = left;
  $("cal-left").classList.toggle("over", left < 0);

  const fill = $("cal-fill");
  fill.style.width = `${Math.min(100, (food / goal) * 100)}%`;
  fill.classList.toggle("over", left < 0);

  const goals = macroGoals(goal);
  for (const key of ["protein", "carbs", "fat"]) {
    const have = Math.round(t[key]);
    $(`m-${key}`).textContent = `${have} / ${goals[key]} g`;
    $(`f-${key}`).style.width = `${Math.min(100, (have / goals[key]) * 100)}%`;
  }
}

function entryEl(entry) {
  const wrap = document.createElement("div");
  wrap.className = "entry";

  const del = document.createElement("button");
  del.className = "entry-del";
  del.textContent = "Delete";

  const body = document.createElement("div");
  body.className = "entry-body";
  const qty = entry.quantity === 1 ? "" : `${entry.quantity} servings`;
  body.innerHTML =
    `<div><div class="entry-name"></div>${qty ? `<div class="entry-sub">${qty}</div>` : ""}</div>` +
    `<div class="entry-cal">${Math.round(entry.calories)}</div>`;
  body.querySelector(".entry-name").textContent = entry.name;

  const remove = () => {
    body.style.transform = "translateX(-100%)";
    setTimeout(() => render(deleteLogEntry(entry.id)), 180);
  };
  del.onclick = remove;

  // Swipe left to reveal delete. Pointer events cover both touch and mouse.
  let startX = null, dx = 0;
  body.addEventListener("pointerdown", (e) => { startX = e.clientX; body.style.transition = "none"; });
  body.addEventListener("pointermove", (e) => {
    if (startX === null) return;
    dx = Math.min(0, Math.max(-88, e.clientX - startX));
    body.style.transform = `translateX(${dx}px)`;
  });
  const settle = () => {
    if (startX === null) return;
    body.style.transition = "";
    body.style.transform = dx < -44 ? "translateX(-88px)" : "translateX(0)";
    startX = null; dx = 0;
  };
  body.addEventListener("pointerup", settle);
  body.addEventListener("pointercancel", settle);
  body.addEventListener("pointerleave", settle);

  wrap.append(del, body);
  return wrap;
}

function renderMeals(log) {
  const container = $("meals");
  container.innerHTML = "";

  for (const meal of MEALS) {
    // Entries logged before meals existed have no mealPeriod — show them under breakfast
    // rather than letting them count toward totals while being invisible in every section.
    const entries = log.filter((e) => (e.mealPeriod || "breakfast") === meal);
    const cals = Math.round(entries.reduce((s, e) => s + (e.calories || 0), 0));

    const section = document.createElement("div");
    section.className = "meal";
    section.innerHTML =
      `<div class="meal-head"><span class="meal-name">${meal}</span><span class="meal-cal">${cals}</span></div>`;

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Nothing logged";
      section.appendChild(empty);
    } else {
      entries.forEach((e) => section.appendChild(entryEl(e)));
    }

    const add = document.createElement("button");
    add.className = "add-row";
    add.textContent = "Add food";
    add.onclick = () => openPicker(meal);
    section.appendChild(add);

    container.appendChild(section);
  }
}

function render(log = getTodayLog()) {
  renderSummary(log);
  renderMeals(log);
}

/* ---------------- picker ---------------- */

function renderPicker(query = "") {
  const list = $("picker-list");
  list.innerHTML = "";
  const q = query.trim().toLowerCase();

  // Searching looks across the whole day's menu; browsing stays scoped to the meal you tapped.
  let items = q
    ? MENU.filter((i) => i.name.toLowerCase().includes(q))
    : MENU.filter((i) => i.mealPeriod === pickerMeal);

  const seen = new Set();
  items = items.filter((i) => {
    const key = `${i.recipeId}-${i.station}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No matches";
    list.appendChild(empty);
    return;
  }

  const byStation = {};
  items.forEach((i) => (byStation[i.station] ??= []).push(i));

  for (const [station, stationItems] of Object.entries(byStation)) {
    const label = document.createElement("div");
    label.className = "station";
    label.textContent = station;
    list.appendChild(label);

    stationItems.forEach((item) => {
      const info = NUTRITION[item.recipeId];
      const btn = document.createElement("button");
      btn.className = "pick";
      btn.innerHTML =
        `<div><div class="pick-name"></div><div class="pick-sub"></div></div>` +
        `<div class="pick-cal">${info?.calories ?? "—"}</div>`;
      btn.querySelector(".pick-name").textContent = item.name;
      btn.querySelector(".pick-sub").textContent = info?.servingSize ?? "";
      btn.onclick = () => info && openQty(item, info);
      list.appendChild(btn);
    });
  }
}

function openPicker(meal) {
  pickerMeal = meal;
  $("picker-title").textContent = meal[0].toUpperCase() + meal.slice(1);
  $("search").value = "";
  renderPicker();
  $("picker-list").scrollTop = 0;
  $("picker").classList.add("active");
  $("diary").classList.add("pushed");
}

function closePicker() {
  $("picker").classList.remove("active");
  $("diary").classList.remove("pushed");
}

/* ---------------- quantity sheet ---------------- */

function openQty(item, info) {
  pending = { item, info };
  pendingQty = 1;
  $("qty-item-name").textContent = item.name;
  $("qty-serving").textContent = info.servingSize ? `Serving: ${info.servingSize}` : "";
  updateQty();
  $("qty-sheet").classList.remove("hidden");
}

function updateQty() {
  $("qty-value").textContent = pendingQty;
  const m = computeEntry(pending.info, pendingQty);
  $("qty-macros").textContent =
    `${Math.round(m.calories)} cal · ${m.protein}P · ${m.carbs}C · ${m.fat}F`;
}

/* ---------------- init ---------------- */

async function init() {
  const { menu, nutrition } = await loadData();
  MENU = menu.items;
  NUTRITION = nutrition;
  render();

  $("picker-back").onclick = closePicker;
  $("search").addEventListener("input", (e) => renderPicker(e.target.value));

  $("qty-minus").onclick = () => { pendingQty = Math.max(0.5, pendingQty - 0.5); updateQty(); };
  $("qty-plus").onclick = () => { pendingQty += 0.5; updateQty(); };
  $("qty-cancel").onclick = () => $("qty-sheet").classList.add("hidden");
  $("qty-confirm").onclick = () => {
    addLogEntry(pending.item.recipeId, pending.item.name, pending.info, pendingQty, pickerMeal);
    $("qty-sheet").classList.add("hidden");
    closePicker();
    render();
  };

  $("open-settings").onclick = () => {
    $("goal-input").value = getGoal();
    $("goal-sheet").classList.remove("hidden");
  };
  $("goal-cancel").onclick = () => $("goal-sheet").classList.add("hidden");
  $("goal-save").onclick = () => {
    const v = Number($("goal-input").value);
    if (v >= 800 && v <= 6000) setGoal(v);
    $("goal-sheet").classList.add("hidden");
    render();
  };
}

init();
