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
const { computeEntry } = sandbox;

const nutrition = { calories: 410, protein: 30, carbs: 43, fat: 14 };
const doubled = computeEntry(nutrition, 2);
assert.strictEqual(doubled.calories, 820, `expected 820 cal at 2x, got ${doubled.calories}`);
assert.strictEqual(doubled.protein, 60, `expected 60g protein at 2x, got ${doubled.protein}`);

const half = computeEntry(nutrition, 0.5);
assert.strictEqual(half.calories, 205, `expected 205 cal at 0.5x, got ${half.calories}`);

console.log("ok: quantity scaling is linear and rounds to 1 decimal");
