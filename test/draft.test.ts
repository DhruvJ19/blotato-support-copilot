import assert from "node:assert/strict";
import test from "node:test";
import { BlotatoClient } from "../src/blotato/client.ts";
import { draftPost } from "../src/blotato/draft.ts";
import { createMockFetch } from "../src/blotato/mock-fetch.ts";

const now = new Date("2026-11-10T08:00:00.000Z");

function setup() {
  const mock = createMockFetch();
  const client = new BlotatoClient({ mode: "live", apiKey: "secret-key", fetchImpl: mock.fetch });
  return { mock, client };
}

test("the default draft is a dry run and does not call the API", async () => {
  const { mock, client } = setup();
  const preview = await draftPost(client, {
    accountId: "12345",
    platform: "twitter",
    text: "Hello from support",
  }, now);
  assert.equal(preview.mode, "dry-run");
  assert.equal(preview.published, false);
  assert.equal(preview.valid, true);
  assert.equal(mock.requests.length, 0);
  assert.equal(preview.request?.post.content.platform, "twitter");
  assert.equal(preview.request?.post.target.targetType, "twitter");
  assert.equal(preview.request?.scheduledTime, undefined);
  assert.equal(preview.request?.useNextFreeSlot, undefined);
});

test("live: false and a string live value still do not publish", async () => {
  const { mock, client } = setup();
  const preview = await draftPost(client, {
    accountId: "12345",
    platform: "twitter",
    text: "Hello",
    live: false,
  }, now);
  assert.equal(preview.published, false);
  const sneaky = await draftPost(client, {
    accountId: "12345",
    platform: "twitter",
    text: "Hello",
    live: "true" as unknown as boolean,
  }, now);
  assert.equal(sneaky.published, false);
  assert.equal(mock.requests.length, 0);
});

test("--live equivalent sends one POST and keeps scheduledTime beside post", async () => {
  const { mock, client } = setup();
  const preview = await draftPost(client, {
    accountId: "12345",
    platform: "twitter",
    text: "Scheduled hello",
    scheduledTime: "2026-12-01T15:04:00Z",
    live: true,
  }, now);
  assert.equal(preview.published, true);
  assert.equal(preview.response?.postSubmissionId, "mock-0000-0000-0000-000000000000");
  assert.equal(mock.requests.length, 1);
  const sent = JSON.parse(mock.requests[0]?.body ?? "{}") as {
    scheduledTime?: string;
    post: { scheduledTime?: string; content: { text: string } };
  };
  assert.equal(sent.scheduledTime, "2026-12-01T15:04:00Z");
  assert.equal(sent.post.scheduledTime, undefined);
  assert.equal(sent.post.content.text, "Scheduled hello");
});

test("an invalid live draft is not sent", async () => {
  const { mock, client } = setup();
  const preview = await draftPost(client, {
    accountId: "tiktok_1",
    platform: "tiktok",
    text: "Missing the brand questions",
    mediaUrls: ["https://example.com/clip.mp4"],
    live: true,
  }, now);
  assert.equal(preview.published, false);
  assert.equal(preview.valid, false);
  assert.match(preview.issues.join(" "), /isYourBrand/);
  assert.equal(mock.requests.length, 0);
});

test("TikTok with both flags is valid and still dry-run by default", async () => {
  const { mock, client } = setup();
  const preview = await draftPost(client, {
    accountId: "tiktok_1",
    platform: "tiktok",
    text: "A clip",
    mediaUrls: ["https://example.com/clip.mp4"],
    isYourBrand: false,
    isBrandedContent: false,
  }, now);
  assert.equal(preview.valid, true);
  assert.equal(preview.request?.post.target.isYourBrand, false);
  assert.equal(preview.request?.post.target.isBrandedContent, false);
  assert.equal(mock.requests.length, 0);
});

test("Facebook without a page id, combined schedule fields, and a Drive preview link are blocked", async () => {
  const { client } = setup();
  const facebook = await draftPost(client, {
    accountId: "67890",
    platform: "facebook",
    text: "Hello page",
  }, now);
  assert.match(facebook.issues.join(" "), /pageId/);

  const both = await draftPost(client, {
    accountId: "12345",
    platform: "twitter",
    text: "Hi",
    scheduledTime: "2026-12-01T15:04:00Z",
    useNextFreeSlot: true,
  }, now);
  assert.match(both.issues.join(" "), /one schedule method/i);

  const drive = await draftPost(client, {
    accountId: "456",
    platform: "instagram",
    text: "Photo",
    mediaUrls: ["https://drive.google.com/file/d/18-UgDEaKG7YR7AewIDd_Qi4QCLCX5Kop/view"],
  }, now);
  assert.match(drive.issues.join(" "), /preview page/);
});

test("a schedule time without a timezone is rejected before a live call", async () => {
  const { mock, client } = setup();
  const preview = await draftPost(client, {
    accountId: "12345",
    platform: "twitter",
    text: "Hi",
    scheduledTime: "2026-12-01T15:04:00",
    live: true,
  }, now);
  assert.equal(preview.published, false);
  assert.match(preview.issues.join(" "), /timezone/);
  assert.equal(mock.requests.length, 0);
});
