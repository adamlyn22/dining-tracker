const DEFAULT_GOAL = 2000;

// ponytail: macro goals are derived from the calorie goal at a fixed split rather than
// stored separately — one knob to set instead of four. Change the split here, or promote
// these to real settings if the fixed ratio ever gets in the way.
const MACRO_SPLIT = { protein: 0.30, carbs: 0.40, fat: 0.30 };
const CAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

function todayKey() {
  return `log-${new Date().toISOString().split("T")[0]}`;
}

function getGoal() {
  return Number(localStorage.getItem("goal")) || DEFAULT_GOAL;
}

function setGoal(value) {
  localStorage.setItem("goal", String(value));
}

function macroGoals(calorieGoal) {
  return {
    protein: Math.round((calorieGoal * MACRO_SPLIT.protein) / CAL_PER_G.protein),
    carbs: Math.round((calorieGoal * MACRO_SPLIT.carbs) / CAL_PER_G.carbs),
    fat: Math.round((calorieGoal * MACRO_SPLIT.fat) / CAL_PER_G.fat),
  };
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
