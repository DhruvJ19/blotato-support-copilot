import assert from "node:assert/strict";
import test from "node:test";
import { BlotatoClient } from "../src/blotato/client.ts";
import { buildHealthReport } from "../src/blotato/health.ts";
import { createMockFetch } from "../src/blotato/mock-fetch.ts";

test("a missing key skips the report without calling fetch", async () => {
  let called = false;
  const report = await buildHealthReport({
    client: null,
    now: new Date("2026-11-10T08:00:00.000Z"),
    skipReason: "BLOTATO_API_KEY is not set.",
  });
  assert.equal(report.skipped, true);
  assert.match(report.markdown, /No request was sent/);
  assert.equal(called, false);
});

test("the mock report includes the documented failed row and a plain fix", async () => {
  const mock = createMockFetch();
  const client = new BlotatoClient({ mode: "mock", fetchImpl: mock.fetch });
  const report = await buildHealthReport({
    client,
    now: new Date("2026-11-10T08:00:00.000Z"),
  });
  assert.equal(report.skipped, false);
  assert.equal(report.accountCount, 4);
  assert.equal(report.failureCount, 1);
  assert.match(report.markdown, /Unsupported media type/);
  assert.match(report.markdown, /98430/);
  assert.match(report.markdown, /not a postSubmissionId/);
  assert.match(report.markdown, /account field is null/);
  assert.equal(mock.requests.every((request) => request.method === "GET"), true);
  assert.equal(mock.requests.some((request) => request.method === "POST"), false);
});
