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
