/* ============================================================
 * Game Agent Lab · 可复现自测脚本
 * 运行：node tools/selftest.js
 * 作用：在不打开浏览器的情况下，离线复算全部评测指标，
 *      用于校验前端展示的数字是否与引擎真实输出一致。
 * ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
global.window = {};
const load = (p) => eval(fs.readFileSync(path.join(ROOT, p), "utf8"));
load("src/kb.js");
load("src/testset.js");
load("src/engine.js");

const KB = window.KB, TS = window.TESTSET;
const engine = window.ENGINE.createEngine(KB, TS);

const pct = (v) => (v * 100).toFixed(1).padStart(5) + "%";
const METRICS = [
  ["准确性", "accuracy"], ["完整性", "completeness"], ["依据可追溯", "traceability"],
  ["时效性", "freshness"], ["稳定性", "stability"], ["综合得分", "overall"]
];

console.log("=".repeat(66));
console.log("Game Agent Lab · 自测报告");
console.log("知识库快照：" + KB.meta.snapshot + "（" + KB.entries.length + " 条）　游戏版本：" + KB.meta.currentVersion);
console.log("测试集：" + TS.meta.name + " " + TS.meta.version + "（" + TS.cases.length + " 题）");
console.log("=".repeat(66));

const runs = {};
["v1", "v2"].forEach((k) => { runs[k] = engine.evaluate(k); });

console.log("\n【指标对比】");
console.log("指标".padEnd(12) + "v1 初版".padStart(10) + "v2 优化".padStart(10) + "变化".padStart(12));
console.log("-".repeat(46));
METRICS.forEach(([label, key]) => {
  const a = runs.v1.metrics[key], b = runs.v2.metrics[key];
  const d = (b - a) * 100;
  console.log(label.padEnd(12) + pct(a).padStart(10) + pct(b).padStart(10) +
              ((d >= 0 ? "+" : "") + d.toFixed(1) + " pt").padStart(12));
});

console.log("\n【通过数】");
console.log("  内容通过（行为正确 + 要点覆盖≥50%）　v1 " +
  runs.v1.passContentCount + "/" + runs.v1.total + "　→　v2 " + runs.v2.passContentCount + "/" + runs.v2.total);
console.log("  完整验收（内容通过 + 依据可追溯）　　v1 " +
  runs.v1.passCount + "/" + runs.v1.total + "　→　v2 " + runs.v2.passCount + "/" + runs.v2.total);

console.log("\n【v1 失败原因归因】");
Object.keys(runs.v1.causeAgg).forEach((k) => console.log("  " + runs.v1.causeAgg[k] + " 处　" + k));

console.log("\n【v2 未通过题目】");
const failed = runs.v2.results.filter((r) => !r.passed);
if (!failed.length) console.log("  无");
failed.forEach((r) => console.log("  " + r.case.id + "　" + r.case.type + "　" + r.case.question + "\n       归因：" + r.cause));

console.log("\n【稳定性明细（换一种问法后结论变化）】");
const unstable = runs.v2.stabilityRuns.filter((x) => !x.consistent);
if (!unstable.length) console.log("  无");
unstable.forEach((x) => console.log("  " + x.id + "　" + x.a + " → " + x.b + "　（首要依据 " + x.aTop + " → " + x.bTop + "）"));

console.log("\n" + "=".repeat(66));
console.log("说明：以上数字由节点环境直接调用与浏览器完全相同的引擎代码算出，");
console.log("      与 Demo 页面「效果评测」页展示结果一致，可逐题复核。");
console.log("=".repeat(66));
