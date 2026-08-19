const DEFAULT_GOAL = 2000;

// Macro goals default to a fixed split of the calorie goal. Any one can be overridden in
// grams; the ones you leave alone keep tracking the calorie goal instead of freezing.
const MACRO_SPLIT = { protein: 0.30, carbs: 0.40, fat: 0.30 };
const CAL_PER_G = { protein: 4, carbs: 4, fat: 9 };
const MACROS = ["protein", "carbs", "fat"];

function todayKey() {
  return `log-${new Date().toISOString().split("T")[0]}`;
}

function getGoal() {
  return Number(localStorage.getItem("goal")) || DEFAULT_GOAL;
}

function setGoal(value) {
  localStorage.setItem("goal", String(value));
}

function derivedMacroGoals(calorieGoal) {
  const out = {};
  for (const key of MACROS) {
    out[key] = Math.round((calorieGoal * MACRO_SPLIT[key]) / CAL_PER_G[key]);
  }
  return out;
}

function macroGoals(calorieGoal, overrides = {}) {
  const derived = derivedMacroGoals(calorieGoal);
  for (const key of MACROS) {
    if (overrides[key] > 0) derived[key] = overrides[key];
  }
  return derived;
}

function getMacroOverrides() {
  return JSON.parse(localStorage.getItem("macroGoals") || "{}");
}

// An input left exactly as it was prefilled counts as untouched: it keeps whatever
// override state it already had, so a macro you never edited goes on tracking the calorie
// goal instead of freezing at the number that happened to be showing in the sheet.
function resolveMacroOverrides(prefill, values, prior) {
  const next = {};
  for (const key of MACROS) {
    const value = values[key] === prefill[key] ? prior[key] : values[key];
    if (value > 0) next[key] = value;
  }
  return next;
}

function saveMacroOverrides(overrides) {
  localStorage.setItem("macroGoals", JSON.stringify(overrides));
}

function computeEntry(nutrition, quantity) {
  const scale = (v) => (v == null ? null : Math.round(v * quantity * 10) / 10);
  return {
    calories: scale(nutrition.calories),
    protein: scale(nutrition.protein),
    carbs: scale(nutrition.carbs),
    fat: scale(nutrition.fat),
  };
}

function getTodayLog() {
  return JSON.parse(localStorage.getItem(todayKey()) || "[]");
}

function saveLog(log) {
  localStorage.setItem(todayKey(), JSON.stringify(log));
}

function addLogEntry(recipeId, name, nutrition, quantity, mealPeriod) {
  const log = getTodayLog();
  log.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    recipeId, name, quantity, mealPeriod,
    ...computeEntry(nutrition, quantity),
    loggedAt: new Date().toISOString(),
  });
  saveLog(log);
  return log;
}

function deleteLogEntry(id) {
  const log = getTodayLog().filter((e) => e.id !== id);
  saveLog(log);
  return log;
}

function logTotals(log) {
  return log.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fat: acc.fat + (e.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}
