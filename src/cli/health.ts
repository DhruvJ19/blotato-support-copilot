import { mkdirSync, writeFileSync } from "node:fs";
import { BlotatoClient } from "../blotato/client.ts";
import { readConfig } from "../blotato/config.ts";
import { buildHealthReport } from "../blotato/health.ts";

const config = readConfig();
const now = new Date();
const client = config.mode === "unconfigured"
  ? null
  : new BlotatoClient({
    mode: config.mode,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseUrl: config.baseUrl,
  });

const report = await buildHealthReport({
  client,
  now,
  ...(config.mode === "unconfigured" ? { skipReason: "BLOTATO_API_KEY is not set." } : {}),
});

mkdirSync("reports", { recursive: true });
const file = `reports/health-${now.toISOString().slice(0, 10)}.md`;
writeFileSync(file, report.markdown);
console.log(report.markdown);
console.error(`Wrote ${file}`);
process.exit(0);
