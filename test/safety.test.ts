import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function filesUnder(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    if (entry === "node_modules" || entry === "reports") continue;
    const stat = statSync(path);
    if (stat.isDirectory()) found.push(...filesUnder(path));
    else if (/\.(ts|json|md|yml|yaml|sh)$/.test(entry) || entry === "smoke_readonly") found.push(path);
  }
  return found;
}

test("the repo never calls DELETE and the smoke path cannot publish", () => {
  const files = filesUnder("src").concat(filesUnder("scripts")).concat(filesUnder("n8n")).concat(filesUnder(".github"));
  const offenders: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (/\bDELETE\b/.test(text) || /\/schedules\b/.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);

  const smoke = readFileSync("src/cli/smoke.ts", "utf8");
  assert.equal(smoke.includes("createPost"), false);
  assert.equal(smoke.includes("draftPost"), false);
  assert.match(smoke, /listAccounts/);
  assert.match(smoke, /getPostStatus/);

  const client = readFileSync("src/blotato/client.ts", "utf8");
  assert.match(client, /options\.live !== true/);
  assert.match(client, /method: "GET" \| "POST"/);
});
