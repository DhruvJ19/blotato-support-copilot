# Blotato Support Copilot

A small support desk on top of the [Blotato REST API](https://help.blotato.com/rest-api-reference/api-reference). It is built for the work on Blotato's customer-support seat: non-technical tickets, billing questions, mild publish failures, help-doc updates, and the 24/7 agent that has to look at a submission before it answers.

The base URL is `https://backend.blotato.com/v2`. Every request sends `blotato-api-key`. This repo ships with no key. Tests and `npm run demo` use JSON fixtures copied from the documented response shapes. Set `BLOTATO_API_KEY` and the same code talks to the live API. It lists accounts and reads post status. It does not publish, schedule, or delete anything unless you pass `--live` (or `live: true` on the draft tool).

## What it is

| Piece | Where | What a support teammate uses it for |
| --- | --- | --- |
| MCP server | `src/mcp/` | Claude Code, Cursor, or any MCP client. Four tools, stdio. |
| Triage skill | `.claude/skills/blotato-support/SKILL.md` | Classifies a ticket, calls the tools, drafts a reply, escalates with a log. |
| n8n workflow | `n8n/blotato-support-agent.json` | Webhook ticket in, classify, read the API, draft, hold for a person. |
| Daily health check | `.github/workflows/daily-health.yml` | Connected accounts and recent failed posts, or a clean skip when the secret is absent. |
| Help drafts | `docs/help/` and `docs/onboarding-checklist.md` | Three help-center updates and a first-week checklist. |
| Read-only smoke test | `scripts/smoke_readonly` | One live check the repo owner can run with a real key. |

## Why each MCP tool exists

The server name is `blotato-mcp-server`.

**`blotato_list_accounts`** calls `GET /v2/users/me/accounts`. Billing and how-to replies need to know which networks are actually connected, and a publish needs the account id from this list. Page ids are not in this response. Facebook and LinkedIn pages come from subaccounts. The tool is read-only.

**`blotato_get_post_status`** calls `GET /v2/posts/:postSubmissionId`. A `201` from create only means Blotato accepted the post. The status call is how you learn `published`, `scheduled`, `failed`, or `in-progress`. `in-progress` also means "no record for this id". The id has to be the `postSubmissionId` from the create response. A row id from `GET /v2/posts` will not work. The tool does not retry or delete.

**`blotato_diagnose_failed_post`** pulls that status, and when the status is `failed` it maps `errorMessage` to a likely cause and a fix in plain words. The phrases come from the public error reference (unsupported media, TikTok's `isYourBrand` / `isBrandedContent` pair, a stale token, a Facebook Page id, a daily cap, and so on). An error we have not mapped is escalated instead of guessed. Published, scheduled, and in-progress each get their own next step, because those are the tickets that otherwise get a blind retry.

**`blotato_draft_post`** builds the `POST /v2/posts` body and checks it: platform matches on `content` and `target`, Facebook has a `pageId`, TikTok has both brand booleans, media URLs are public files, and `scheduledTime` sits next to `post` with a timezone. The default is a dry run. The HTTP client throws unless `live` is exactly `true`, and an invalid draft is not sent even then. There is no delete method.

## Setup

Node.js 22.18 or newer.

```bash
npm install
npm test
npm run typecheck
```

Mock mode, no key, no network:

```bash
export BLOTATO_MOCK=1
npm run demo
npm run triage -- --file fixtures/tickets/technical-tiktok.json
npm run draft -- --account 12345 --platform twitter --text "Hello"
```

Live reads. The key stays in the environment. `.env.example` shows the names. Nothing in this repo loads a dotenv file, so a stray `.env` cannot surprise you.

```bash
export BLOTATO_API_KEY="paste-the-full-key"
bash scripts/smoke_readonly
BLOTATO_SUBMISSION_ID="the-id-from-create" bash scripts/smoke_readonly
npm run health
```

`scripts/smoke_readonly` lists accounts and, only when `BLOTATO_SUBMISSION_ID` is set, fetches that one status. No key prints a skip line and exits 0. A rejected key exits 1 and does not echo the key.

Publish, only when you mean it:

```bash
npm run draft -- --account 12345 --platform twitter --text "Hello" --at 2026-12-01T15:04:00Z --live
```

Without `--live` the command prints the JSON and sends nothing. `--at` sets `scheduledTime` beside `post`. Combining it with `--slot` is rejected, because the API treats those as two schedule methods.

MCP, from this directory. `.mcp.json` starts the same server. With no key the tools return a clear error. With `BLOTATO_MOCK=1` they answer from fixtures. With `BLOTATO_API_KEY` they read the live API.

```bash
claude mcp add blotato-support -- node src/mcp/index.ts
```

n8n 1.x (the export uses IF 2.2, HTTP Request 4.2, and Code 2): import `n8n/blotato-support-agent.json`. It arrives inactive. Set `BLOTATO_API_KEY` in the n8n environment, not in the workflow. The webhook path is `blotato-support-ticket`. The sample pinned ticket is Ava's TikTok failure. The last node is **Hold for human review** and returns `sendToCustomer: false`. Both HTTP nodes are `GET`. If the key is missing they fail soft and the draft still comes back.

The daily health workflow is `.github/workflows/daily-health.yml`. It runs at 13:15 UTC and on demand. Add a repository secret named `BLOTATO_API_KEY`. An empty secret writes `reports/health-YYYY-MM-DD.md` saying the check was skipped, and the job stays green. CI (`.github/workflows/ci.yml`) runs the tests, the typecheck, the demo, the skip-path health check, and the skip-path smoke test.

## Demo walkthrough

`npm run demo` is the whole path on fixtures. No key, no network, no publish.

1. **Sam, charged twice.** "Nothing failed to publish" stays a billing ticket. The reply does not promise a refund and points at Settings > Billing. The run lists accounts with `GET` only.
2. **Mia, connect Instagram.** Classified as how-to. The reply covers a private window, a Professional account, a Facebook Page, and the rule that a missing schedule time publishes immediately.
3. **Ava, TikTok.** Submission `22222222-2222-2222-2222-222222222222` is `failed` with the documented `isYourBrand` / `isBrandedContent` error. The reply names both fields. It does not escalate, because the fix is known, and it does not republish.
4. **Noah, unmapped error.** "The flux capacitor rejected the caption" is not in the error reference. The customer reply says the technical team has it. The internal note is a `LOG SUMMARY` with the submission id and the exact error.
5. **Dry-run draft.** A tweet with `scheduledTime` of `2026-12-01T15:04:00Z`. `published` is false. The time is a sibling of `post`.
6. **Documented status example.** Id `123e4567-e89b-12d3-a456-426614174000` is the help-page example: `status: published` and `errorMessage: "Unsupported media type"` in the same object. The diagnosis treats it as published.
7. **Health report.** Four accounts from the accounts example, and the failed TikTok row `98430` from the list-posts example. The report says `98430` is a list id, not a submission id, and that `account: null` means the login is gone.

Then, with a real key, `bash scripts/smoke_readonly` should print your accounts. That is the live check. Do it before you ever pass `--live`.

## Biggest challenge and how I debugged it

I had no API key, so every fixture had to be copied from the docs and then defended against the docs. Three of those pages disagree with themselves, and each one would have produced a wrong customer reply.

**The status example reports a published post and a failure at the same time.** The [Get post status](https://help.blotato.com/rest-api-reference/openapi-reference/publishing) example is one JSON object with `status: "published"`, a `publicUrl`, and `errorMessage: "Unsupported media type"`. That is every field's sample stuffed into a single object. My first mapper treated any `errorMessage` as a failure. A customer whose post was live would have been told to re-export the video. I stored that example byte for byte in `fixtures/post-status.json` and changed the diagnosis so `errorMessage` is read only when `status` is `failed`. `test/diagnose.test.ts` fails if that regresses.

**The accounts example is wrapped in an extra array.** The OpenAPI schema on the [accounts page](https://help.blotato.com/rest-api-reference/openapi-reference/accounts) says `items` is an array of objects with `id`, `platform`, `fullname`, and `username`. The rendered example I pulled while researching the same page showed `items: [[{ id, platform, fullname, username }]]`. A strict parser would throw on the first live account list if the extra brackets are real, and would also throw on the schema shape if I coded to the rendered example. `unwrapItems` flattens a single extra layer. The fixture follows the schema. `test/client.test.ts` feeds the double-wrapped shape and expects one account.

**A "scheduled" draft publishes immediately if the time is in the wrong place.** The [publish guide](https://help.blotato.com/rest-api-reference/publish-post) says `scheduledTime` and `useNextFreeSlot` are siblings of `post`. Nested inside `post`, they are ignored, and the post goes out now. That is the bug I most wanted a support tool to refuse to recreate. `buildDraft` puts the time on the root, rejects a timestamp with no timezone, and rejects setting both schedule methods. `test/draft.test.ts` parses the body that `--live` would send and asserts `post.scheduledTime` is absent. The HTTP client still throws unless `live === true`, so the dry run never gets as far as `fetch`. I checked that with a fetch double that counts calls.

Two smaller ones showed up in the compiler and the tests, not in the docs.

TypeScript 7 rejected `CreatePostResult` because I had typed `scheduledTime: string | undefined`. That requires the property to exist. The `201` body omits it for an immediate post, so the object I returned had an optional property and `tsc` reported: `Property 'scheduledTime' is optional in type ... but required in type 'CreatePostResult'`. The field is now optional.

The billing sample says "Nothing failed to publish." The failure regex matched `failed to publish` and would have filed a refund as a technical ticket. I noticed it while writing the fixture, added a guard for "nothing failed" / "didn't fail" / "did not fail", and locked it with a unit test plus the n8n code node. `test/n8n.test.ts` actually runs that code-node source: the refund stays billing, "How do I connect Instagram?" stays how-to, and Ava's submission id stays technical.

A safety test also failed on the first run because the mock server answered `DELETE` by name. The production client has no delete call. I changed the mock so any method other than `GET` or `POST` is a 405, and the test now scans `src/`, `scripts/`, `n8n/`, and `.github/` for a delete verb or a `/schedules` path.

## Demo video

Dhruv's walkthrough: _add the link here._

Record against `npm run demo`, then `bash scripts/smoke_readonly` with a real key. The demo script is the mocked path. The smoke script is the live read. Neither one publishes.
