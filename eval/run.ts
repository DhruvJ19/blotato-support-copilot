// Eval runner for the support copilot. Usage: node eval/run.ts [--min 0.9]
// Scores ticket routing and error-to-fix mapping against hand-labelled cases.
// A wrong mapped fix is the costly failure (the customer is told the wrong fix with confidence),
// so it is counted separately from "unmapped", which hands the case to a person.
import { readFileSync, writeFileSync } from "node:fs";
import { classifyTicket } from "../src/blotato/triage.ts";
import { explainError } from "../src/blotato/diagnose.ts";

const here = new URL(".", import.meta.url);
const cases = JSON.parse(readFileSync(new URL("cases.json", here), "utf8"));
const src = readFileSync(new URL("../src/blotato/diagnose.ts", here), "utf8");
const causeToId = new Map<string, string>();
for (const m of src.matchAll(/id: "([a-z-]+)",[\s\S]*?cause: "([^"]+)"/g)) causeToId.set(m[2], m[1]);

const min = Number(process.argv[process.argv.indexOf("--min") + 1]) || 0.9;
const lines: string[] = [];
let tOk = 0; const tFail: string[] = []; const confusion: Record<string, Record<string, number>> = {};
for (const c of cases.triage) {
  const got = classifyTicket({ subject: c.subject, message: c.message }).category;
  (confusion[c.expect] ??= {})[got] = (confusion[c.expect][got] ?? 0) + 1;
  if (got === c.expect) tOk++; else tFail.push(`${c.id} expected ${c.expect}, got ${got}: "${c.message}"`);
}
let eOk = 0, wrongFix = 0, missed = 0; const eFail: string[] = [];
for (const c of cases.errors) {
  const r = explainError(c.error);
  const got = causeToId.get(r.likelyCause) ?? "unmapped";
  if (got === c.expect) { eOk++; continue; }
  if (got === "unmapped") missed++; else wrongFix++;
  eFail.push(`${c.id} expected ${c.expect}, got ${got}: "${c.error}"`);
}
// Held-out routing cases: written after the routing fix, never tuned against. Reported, not gated.
const holdout = JSON.parse(readFileSync(new URL("holdout.json", here), "utf8")).triage;
const hFail: string[] = [];
for (const c of holdout) {
  const got = classifyTicket({ subject: c.subject, message: c.message }).category;
  if (got !== c.expect) hFail.push(`${c.id} expected ${c.expect}, got ${got}: "${c.message}"`);
}
const tAcc = tOk / cases.triage.length, eAcc = eOk / cases.errors.length;
lines.push(`# Eval report (${new Date().toISOString()})`, "",
  `Ticket routing: ${tOk}/${cases.triage.length} correct (${(tAcc * 100).toFixed(0)}%)`,
  `Held-out routing (never tuned on): ${holdout.length - hFail.length}/${holdout.length} correct`,
  `Error to fix mapping: ${eOk}/${cases.errors.length} correct (${(eAcc * 100).toFixed(0)}%); wrong fix given: ${wrongFix}; sent to a person as unmapped when a rule existed: ${missed}`, "",
  "## Routing confusion (rows expected, columns got)", "",
  "| expected | billing | how-to | technical |", "|---|---|---|---|",
  ...Object.entries(confusion).map(([k, v]) => `| ${k} | ${v.billing ?? 0} | ${v["how-to"] ?? 0} | ${v.technical ?? 0} |`), "",
  "## Failures", "", ...(tFail.concat(eFail).map((f) => `- ${f}`)), "", "## Held-out misses (known, left unfixed on purpose)", "", ...hFail.map((f) => `- ${f}`), "");
const out = lines.join("\n");
writeFileSync(new URL("report.md", here), out);
console.log(out);
if (tAcc < min || eAcc < min || wrongFix > 0) { console.error(`FAIL: below ${min} or a wrong fix was given`); process.exit(1); }
