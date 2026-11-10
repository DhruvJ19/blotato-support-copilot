import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const workflow = JSON.parse(readFileSync(new URL("../n8n/blotato-support-agent.json", import.meta.url), "utf8")) as {
  nodes: Array<{ name: string; type: string; parameters: Record<string, unknown> }>;
  connections: Record<string, { main: Array<Array<{ node: string }>> }>;
};

test("the support workflow is importable JSON with a human review hold and read-only HTTP", () => {
  assert.equal(workflow.nodes.some((node) => node.name === "Ticket webhook"), true);
  assert.equal(workflow.nodes.some((node) => node.name === "Hold for human review"), true);
  const http = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.httpRequest");
  assert.equal(http.length, 2);
  for (const node of http) {
    assert.equal(node.parameters.method, "GET");
    assert.match(String(node.parameters.url), /backend\.blotato\.com\/v2\//);
  }
  const blob = JSON.stringify(workflow);
  assert.equal(http.some((node) => node.parameters.method !== "GET"), false);
  assert.match(blob, /never calls POST \/v2\/posts/);
  const hold = workflow.nodes.find((node) => node.name === "Hold for human review");
  assert.match(String(hold?.parameters.jsCode), /sendToCustomer: false/);
  assert.equal(workflow.connections["Draft reply"]?.main[0]?.[0]?.node, "Hold for human review");
});

test("the n8n classifier matches the ticket buckets", () => {
  const classify = workflow.nodes.find((node) => node.name === "Classify ticket");
  const run = new Function("$input", String(classify?.parameters.jsCode)) as (input: {
    first: () => { json: unknown };
  }) => Array<{ json: { category: string; submissionId: string } }>;

  const billing = run({
    first: () => ({
      json: {
        body: { customerName: "Sam", subject: "Charged twice", message: "I was charged twice. Nothing failed to publish." },
      },
    }),
  });
  assert.equal(billing[0]?.json.category, "billing");

  const howTo = run({
    first: () => ({ json: { body: { message: "How do I connect Instagram?" } } }),
  });
  assert.equal(howTo[0]?.json.category, "how-to");

  const technical = run({
    first: () => ({
      json: {
        body: { message: "My post failed. submission id 22222222-2222-2222-2222-222222222222" },
      },
    }),
  });
  assert.equal(technical[0]?.json.category, "technical");
  assert.equal(technical[0]?.json.submissionId, "22222222-2222-2222-2222-222222222222");
});
