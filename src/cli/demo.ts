import { readFileSync } from "node:fs";
import { BlotatoClient } from "../blotato/client.ts";
import { diagnosePost } from "../blotato/diagnose.ts";
import { draftPost } from "../blotato/draft.ts";
import { buildHealthReport } from "../blotato/health.ts";
import { triageTicket, type TicketInput } from "../blotato/triage.ts";

const client = new BlotatoClient({ mode: "mock" });
const now = new Date("2026-11-10T08:00:00.000Z");

function loadTicket(name: string): TicketInput {
  return JSON.parse(readFileSync(new URL(`../../fixtures/tickets/${name}.json`, import.meta.url), "utf8")) as TicketInput;
}

const tickets = ["billing", "how-to", "technical-tiktok", "technical-unknown"];

console.log("Blotato Support Copilot demo");
console.log("Mode: mock fixtures recorded from the public API docs. No network. No publish.");
console.log("");

for (const name of tickets) {
  const ticket = loadTicket(name);
  const result = await triageTicket(ticket, client);
  console.log(`--- ${name} ---`);
  console.log(`category: ${result.category} (${result.confidence})`);
  console.log(`escalate: ${result.escalate ? "yes" : "no"}`);
  if (result.diagnosis) console.log(`status: ${result.diagnosis.status}`);
  console.log("");
  console.log(result.reply);
  if (result.internalLog) {
    console.log("");
    console.log(result.internalLog);
  }
  console.log("");
}

const draft = await draftPost(client, {
  accountId: "12345",
  platform: "twitter",
  text: "Hello from the support copilot",
  scheduledTime: "2026-12-01T15:04:00Z",
}, now);
console.log("--- dry-run draft ---");
console.log(`published: ${draft.published}`);
console.log(`valid: ${draft.valid}`);
console.log(`scheduledTime is beside post: ${draft.request?.scheduledTime === "2026-12-01T15:04:00Z"}`);
console.log("");

const published = await diagnosePost(client, "123e4567-e89b-12d3-a456-426614174000");
console.log("--- documented status example ---");
console.log(`raw docs example includes an error string, diagnosis status is ${published.status}, escalate ${published.escalate}`);
console.log("");

const health = await buildHealthReport({ client, now });
console.log(health.markdown);
