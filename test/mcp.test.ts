import assert from "node:assert/strict";
import test from "node:test";
import { BlotatoClient } from "../src/blotato/client.ts";
import { createMockFetch } from "../src/blotato/mock-fetch.ts";
import { handleDiagnose, handleDraft, handleGetPostStatus, handleListAccounts } from "../src/mcp/handlers.ts";
import { createSupportServer } from "../src/mcp/server.ts";

function client() {
  const mock = createMockFetch();
  return { mock, client: new BlotatoClient({ mode: "mock", fetchImpl: mock.fetch }) };
}

test("the MCP server registers the four support tools", () => {
  const server = createSupportServer(client().client);
  const registered = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  assert.deepEqual(Object.keys(registered).sort(), [
    "blotato_diagnose_failed_post",
    "blotato_draft_post",
    "blotato_get_post_status",
    "blotato_list_accounts",
  ]);
});

test("draft tool defaults to dry run", async () => {
  const { mock, client: blotato } = client();
  const result = await handleDraft(blotato, {
    accountId: "12345",
    platform: "twitter",
    text: "Hello",
  });
  assert.equal(result.isError, undefined);
  const body = JSON.parse(result.text) as { published: boolean; mode: string };
  assert.equal(body.mode, "dry-run");
  assert.equal(body.published, false);
  assert.equal(mock.requests.length, 0);
});

test("diagnose and status tools return the documented failed post", async () => {
  const { client: blotato } = client();
  const status = await handleGetPostStatus(blotato, { postSubmissionId: "11111111-1111-1111-1111-111111111111" });
  assert.match(status.text, /"status": "failed"/);
  const diagnosis = await handleDiagnose(blotato, { postSubmissionId: "11111111-1111-1111-1111-111111111111" });
  assert.match(diagnosis.text, /refused the file/);
});

test("list accounts tool returns the fixture count", async () => {
  const result = await handleListAccounts(client().client, {});
  const body = JSON.parse(result.text) as { count: number };
  assert.equal(body.count, 4);
});

test("a missing key is a tool error, not a crash, and a live draft without a key does not publish", async () => {
  let calls = 0;
  const blotato = new BlotatoClient({
    mode: "unconfigured",
    fetchImpl: async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    },
  });
  const listed = await handleListAccounts(blotato, {});
  assert.equal(listed.isError, true);
  assert.match(listed.text, /BLOTATO_API_KEY/);
  const draft = await handleDraft(blotato, {
    accountId: "12345",
    platform: "twitter",
    text: "Do not send",
    live: true,
  });
  assert.equal(draft.isError, true);
  assert.equal(calls, 0);
});
