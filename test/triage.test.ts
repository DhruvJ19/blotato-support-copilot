import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { BlotatoClient } from "../src/blotato/client.ts";
import { createMockFetch } from "../src/blotato/mock-fetch.ts";
import { classifyTicket, triageTicket, type TicketInput } from "../src/blotato/triage.ts";

function ticket(name: string): TicketInput {
  return JSON.parse(readFileSync(new URL(`../fixtures/tickets/${name}.json`, import.meta.url), "utf8")) as TicketInput;
}

function client() {
  const mock = createMockFetch();
  return { mock, client: new BlotatoClient({ mode: "mock", fetchImpl: mock.fetch }) };
}

test("billing, how-to, and technical tickets land in different queues", () => {
  assert.equal(classifyTicket(ticket("billing")).category, "billing");
  assert.equal(classifyTicket(ticket("how-to")).category, "how-to");
  assert.equal(classifyTicket(ticket("technical-tiktok")).category, "technical");
  assert.equal(classifyTicket({ message: "How do I find failed posts?" }).category, "how-to");
});

test("a billing reply does not promise a refund and does not publish", async () => {
  const { mock, client: blotato } = client();
  const result = await triageTicket(ticket("billing"), blotato);
  assert.equal(result.category, "billing");
  assert.equal(result.escalate, false);
  assert.match(result.reply, /have not issued a refund/i);
  assert.match(result.reply, /Settings > Billing/);
  assert.equal(result.internalLog, null);
  assert.ok(result.connectedPlatforms.includes("Instagram"));
  assert.equal(mock.requests.every((request) => request.method === "GET"), true);
});

test("a known TikTok failure gets the fix and stays off the engineering queue", async () => {
  const { mock, client: blotato } = client();
  const result = await triageTicket(ticket("technical-tiktok"), blotato);
  assert.equal(result.escalate, false);
  assert.match(result.reply, /isYourBrand/);
  assert.match(result.reply, /have not published a replacement/i);
  assert.equal(result.internalLog, null);
  assert.equal(mock.requests.some((request) => request.method === "POST"), false);
});

test("an unmapped failure escalates with a log and no customer-facing retry instructions that invent a cause", async () => {
  const result = await triageTicket(ticket("technical-unknown"), client().client);
  assert.equal(result.escalate, true);
  assert.match(result.reply, /technical team/);
  assert.match(result.internalLog ?? "", /LOG SUMMARY/);
  assert.match(result.internalLog ?? "", /55555555-5555-5555-5555-555555555555/);
  assert.match(result.internalLog ?? "", /flux capacitor/);
  assert.doesNotMatch(result.reply, /API key/i);
});

test("a technical ticket without an id asks for the submission id", async () => {
  const result = await triageTicket({
    customerName: "Rae",
    message: "My post failed to publish and I do not know why.",
  }, client().client);
  assert.equal(result.category, "technical");
  assert.equal(result.escalate, false);
  assert.match(result.reply, /postSubmissionId/);
});
