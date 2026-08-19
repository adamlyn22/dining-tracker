import assert from "node:assert";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// store.js is a plain classic script (loaded via <script src> in the browser, no
// module system) — load it the same way here instead of import, so the test
// exercises the exact file the browser runs, not a rewritten module version.
const src = readFileSync(new URL("../store.js", import.meta.url), "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { computeEntry, macroGoals, logTotals, resolveMacroOverrides } = sandbox;

const nutrition = { calories: 410, protein: 30, carbs: 43, fat: 14 };
const doubled = computeEntry(nutrition, 2);
assert.strictEqual(doubled.calories, 820, `expected 820 cal at 2x, got ${doubled.calories}`);
assert.strictEqual(doubled.protein, 60, `expected 60g protein at 2x, got ${doubled.protein}`);

const half = computeEntry(nutrition, 0.5);
assert.strictEqual(half.calories, 205, `expected 205 cal at 0.5x, got ${half.calories}`);

// With nothing overridden, macro goals must add back up to the calorie goal or the bars lie.
const goals = macroGoals(2000);
const impliedCals = goals.protein * 4 + goals.carbs * 4 + goals.fat * 9;
assert(Math.abs(impliedCals - 2000) <= 5,
  `macro goals imply ${impliedCals} cal, expected ~2000`);

// An override wins for its own macro and leaves the other two derived.
const overridden = macroGoals(2000, { protein: 185 });
assert.strictEqual(overridden.protein, 185, `expected the 185g protein override to win, got ${overridden.protein}`);
assert.strictEqual(overridden.carbs, goals.carbs, "carbs should stay derived when only protein is overridden");
assert.strictEqual(overridden.fat, goals.fat, "fat should stay derived when only protein is overridden");

// The whole point of the prefill comparison: an untouched field must not become a frozen
// override, while an edited one must, and an existing override must survive being untouched.
const prefill = { protein: 150, carbs: 200, fat: 67 };
const untouched = resolveMacroOverrides(prefill, { ...prefill }, {});
assert.strictEqual(JSON.stringify(untouched), "{}", `leaving every field alone should store no overrides, got ${JSON.stringify(untouched)}`);

const edited = resolveMacroOverrides(prefill, { ...prefill, protein: 185 }, {});
assert.strictEqual(JSON.stringify(edited), JSON.stringify({ protein: 185 }), `editing protein alone should store only protein, got ${JSON.stringify(edited)}`);

const kept = resolveMacroOverrides(prefill, { ...prefill }, { protein: 150 });
assert.strictEqual(JSON.stringify(kept), JSON.stringify({ protein: 150 }), `an existing override must survive an untouched save, got ${JSON.stringify(kept)}`);

const totals = logTotals([
  { calories: 410, protein: 30, carbs: 43, fat: 14 },
  { calories: 90, protein: 18, carbs: 1.7, fat: 0 },
]);
assert.strictEqual(totals.calories, 500, `expected 500 total cal, got ${totals.calories}`);
assert.strictEqual(totals.protein, 48, `expected 48g total protein, got ${totals.protein}`);

console.log("ok: quantity scaling linear, macro goals sum to the calorie goal, totals add up");
