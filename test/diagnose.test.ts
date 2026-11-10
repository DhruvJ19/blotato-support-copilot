import assert from "node:assert/strict";
import test from "node:test";
import { BlotatoClient } from "../src/blotato/client.ts";
import { diagnosePost } from "../src/blotato/diagnose.ts";
import { createMockFetch } from "../src/blotato/mock-fetch.ts";

function client() {
  const mock = createMockFetch();
  return new BlotatoClient({ mode: "mock", fetchImpl: mock.fetch });
}

test("a published status is not diagnosed as a failure, even when the docs example fills errorMessage", async () => {
  const diagnosis = await diagnosePost(client(), "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(diagnosis.status, "published");
  assert.equal(diagnosis.errorMessage, null);
  assert.equal(diagnosis.escalate, false);
  assert.match(diagnosis.fix, /https:\/\/x\.com\/post\/12345/);
  assert.match(diagnosis.doNot.join(" "), /not describe this post as failed/i);
});

test("unsupported media type maps to a file fix, not a reconnect", async () => {
  const diagnosis = await diagnosePost(client(), "11111111-1111-1111-1111-111111111111");
  assert.equal(diagnosis.status, "failed");
  assert.equal(diagnosis.errorMessage, "Unsupported media type");
  assert.equal(diagnosis.confidence, "high");
  assert.equal(diagnosis.escalate, false);
  assert.match(diagnosis.likelyCause, /refused the file/i);
  assert.match(diagnosis.fix, /MP4/);
  assert.match(diagnosis.doNot.join(" "), /unchanged/);
});

test("the TikTok brand-field error names both required booleans", async () => {
  const diagnosis = await diagnosePost(client(), "22222222-2222-2222-2222-222222222222");
  assert.match(diagnosis.fix, /isYourBrand/);
  assert.match(diagnosis.fix, /isBrandedContent/);
  assert.equal(diagnosis.escalate, false);
});

test("scheduled and in-progress get plain next steps and do not escalate", async () => {
  const scheduled = await diagnosePost(client(), "33333333-3333-3333-3333-333333333333");
  assert.equal(scheduled.status, "scheduled");
  assert.match(scheduled.likelyCause, /2025-03-11T15:30:00.000Z/);
  assert.equal(scheduled.escalate, false);

  const pending = await diagnosePost(client(), "44444444-4444-4444-4444-444444444444");
  assert.equal(pending.status, "in-progress");
  assert.equal(pending.escalate, false);
  assert.match(pending.likelyCause, /does not prove a job/i);
});

test("an unmapped failure is escalated instead of inventing a cause", async () => {
  const diagnosis = await diagnosePost(client(), "55555555-5555-5555-5555-555555555555");
  assert.equal(diagnosis.confidence, "low");
  assert.equal(diagnosis.escalate, true);
  assert.match(diagnosis.likelyCause, /not in the mapped error reference/i);
});

test("a list-post id is reported as not a submission id", async () => {
  const diagnosis = await diagnosePost(client(), "98430");
  assert.equal(diagnosis.status, "not-found");
  assert.equal(diagnosis.httpStatus, 404);
  assert.match(diagnosis.fix, /98430/);
  assert.equal(diagnosis.escalate, false);
});
