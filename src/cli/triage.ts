import { readFileSync } from "node:fs";
import { BlotatoClient } from "../blotato/client.ts";
import { readConfig } from "../blotato/config.ts";
import { triageTicket, type TicketInput } from "../blotato/triage.ts";
import { readOption } from "./args.ts";

const file = readOption(process.argv.slice(2), "--file");
if (!file) {
  console.error("Usage: npm run triage -- --file fixtures/tickets/technical-tiktok.json");
  process.exit(2);
}

const ticket = JSON.parse(readFileSync(file, "utf8")) as TicketInput;
const config = readConfig();
const forcedMock = config.mode === "unconfigured";
const client = new BlotatoClient({
  mode: forcedMock ? "mock" : config.mode,
  ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  baseUrl: config.baseUrl,
});

const result = await triageTicket(ticket, client);
console.log(JSON.stringify({
  mode: forcedMock ? "mock" : config.mode,
  category: result.category,
  confidence: result.confidence,
  reasons: result.reasons,
  submissionId: result.submissionId,
  escalate: result.escalate,
  connectedPlatforms: result.connectedPlatforms,
  diagnosis: result.diagnosis,
  reply: result.reply,
  internalLog: result.internalLog,
}, null, 2));
