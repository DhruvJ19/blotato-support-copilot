import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { BlotatoClient, parseAccounts, parsePostStatus } from "../src/blotato/client.ts";
import { readConfig } from "../src/blotato/config.ts";
import { BlotatoApiError, PublishBlockedError } from "../src/blotato/errors.ts";
import { createMockFetch } from "../src/blotato/mock-fetch.ts";
import type { CreatePostBody } from "../src/blotato/types.ts";

const documentedAccounts = JSON.parse(readFileSync(new URL("../fixtures/accounts.json", import.meta.url), "utf8"));
const documentedPosts = JSON.parse(readFileSync(new URL("../fixtures/posts-list.json", import.meta.url), "utf8"));
const unauthorized = JSON.parse(readFileSync(new URL("../fixtures/errors/401.json", import.meta.url), "utf8"));
const forbidden = JSON.parse(readFileSync(new URL("../fixtures/errors/403.json", import.meta.url), "utf8"));

function mockClient() {
  const mock = createMockFetch();
  const client = new BlotatoClient({ mode: "mock", fetchImpl: mock.fetch });
  return { mock, client };
}

const twitterDraft: CreatePostBody = {
  post: {
    accountId: "12345",
    content: { text: "Hello, world!", mediaUrls: [], platform: "twitter" },
    target: { targetType: "twitter" },
  },
};

test("list accounts matches the documented items shape", async () => {
  const { client } = mockClient();
  const accounts = await client.listAccounts();
  assert.deepEqual(accounts, documentedAccounts.items);
  assert.equal(accounts[0]?.id, "12345");
  assert.equal(accounts[0]?.platform, "twitter");
  assert.equal(accounts[0]?.username, "@johndoe");
});

test("list accounts filters by platform", async () => {
  const { client, mock } = mockClient();
  const accounts = await client.listAccounts("instagram");
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0]?.id, "456");
  assert.match(mock.requests[0]?.url ?? "", /platform=instagram/);
});

test("account items nested in an extra array still parse", () => {
  const accounts = parseAccounts({
    items: [[documentedAccounts.items[0]]],
  });
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0]?.fullname, "John Doe");
});

test("post status keeps the documented published example, including the illustrated error field", async () => {
  const { client } = mockClient();
  const status = await client.getPostStatus("123e4567-e89b-12d3-a456-426614174000");
  assert.equal(status.status, "published");
  assert.equal(status.publicUrl, "https://x.com/post/12345");
  assert.equal(status.errorMessage, "Unsupported media type");
  assert.equal(parsePostStatus(status).postSubmissionId, status.postSubmissionId);
});

test("list posts returns the documented scheduled, published, and failed rows", async () => {
  const { client } = mockClient();
  const page = await client.listPosts({ since: "2026-03-01T00:00:00.000Z", until: "2026-04-02T00:00:00.000Z" });
  assert.equal(page.items.length, 3);
  assert.equal(page.items[2]?.state.type, "failed");
  if (page.items[2]?.state.type === "failed") {
    assert.equal(page.items[2].state.errorMessage, "Unsupported media type");
  }
  assert.equal(page.items[2]?.account, null);
  assert.equal(page.cursor, documentedPosts.cursor);
  const next = await client.listPosts({ cursor: page.cursor });
  assert.deepEqual(next.items, []);
  assert.equal(next.cursor, undefined);
});

test("failed status filter repeats the status query parameter", async () => {
  const { client, mock } = mockClient();
  const page = await client.listPosts({ status: ["failed"], since: "2026-03-01T00:00:00.000Z" });
  assert.equal(page.items.length, 1);
  assert.match(mock.requests[0]?.url ?? "", /status=failed/);
});

test("createPost refuses to send unless live is exactly true", async () => {
  const { client, mock } = mockClient();
  await assert.rejects(() => client.createPost(twitterDraft, { live: false }), PublishBlockedError);
  assert.equal(mock.requests.length, 0);
});

test("a live create sends POST /v2/posts with the api key header and a root scheduledTime", async () => {
  const mock = createMockFetch();
  const client = new BlotatoClient({
    mode: "live",
    apiKey: "secret-key",
    fetchImpl: mock.fetch,
  });
  const body: CreatePostBody = {
    ...twitterDraft,
    scheduledTime: "2026-12-01T15:04:00Z",
  };
  const result = await client.createPost(body, { live: true });
  assert.equal(result.postSubmissionId, "mock-0000-0000-0000-000000000000");
  assert.equal(mock.requests.length, 1);
  const call = mock.requests[0];
  assert.equal(call?.method, "POST");
  assert.match(call?.url ?? "", /\/v2\/posts$/);
  assert.ok(call?.headerNames.includes("blotato-api-key"));
  const sent = JSON.parse(call?.body ?? "{}") as CreatePostBody;
  assert.equal(sent.scheduledTime, "2026-12-01T15:04:00Z");
  assert.equal("scheduledTime" in sent.post, false);
  assert.equal(sent.post.content.platform, "twitter");
  assert.equal(sent.post.target.targetType, "twitter");
});

test("401 and 403 bodies surface message, reqId, and action without the api key", async () => {
  const apiKey = "super-secret-key";
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    ...unauthorized,
    message: `Unauthorized access ${apiKey}`,
  }), { status: 401 });
  const client = new BlotatoClient({ mode: "live", apiKey, fetchImpl });
  await assert.rejects(
    () => client.listAccounts(),
    (error: unknown) => {
      assert.ok(error instanceof BlotatoApiError);
      assert.equal(error.status, 401);
      assert.equal(error.reqId, "req_unauthorized_example");
      assert.match(error.message, /Unauthorized access/);
      assert.equal(error.message.includes(apiKey), false);
      assert.match(error.message, /\[redacted\]/);
      return true;
    },
  );

  const forbiddenFetch: typeof fetch = async () => new Response(JSON.stringify(forbidden), { status: 403 });
  const billing = new BlotatoClient({ mode: "live", apiKey: "another-key", fetchImpl: forbiddenFetch });
  await assert.rejects(() => billing.listAccounts(), (error: unknown) => {
    assert.ok(error instanceof BlotatoApiError);
    assert.equal(error.subscriptionStatus, "inactive");
    assert.match(error.message, /Check Billing/);
    return true;
  });
});

test("an unconfigured client does not call the network", async () => {
  let called = false;
  const client = new BlotatoClient({
    mode: "unconfigured",
    fetchImpl: async () => {
      called = true;
      return new Response("{}", { status: 200 });
    },
  });
  await assert.rejects(() => client.listAccounts(), /BLOTATO_API_KEY is not set/);
  assert.equal(called, false);
});

test("mock mode wins over a real key so demos stay offline", () => {
  const config = readConfig({ BLOTATO_API_KEY: "present", BLOTATO_MOCK: "1" });
  assert.equal(config.mode, "mock");
  const live = readConfig({ BLOTATO_API_KEY: "present" });
  assert.equal(live.mode, "live");
  const empty = readConfig({ BLOTATO_API_KEY: "   " });
  assert.equal(empty.mode, "unconfigured");
});
