Status: draft onboarding flow
Source: support copilot, checked against the public API docs on 2026-11-10

# First week on Blotato

Work down the list. Stop at the first step that fails and fix that step before the next one. The goal is one real published post you can point at, then automation.

## Account

- [ ] Sign in to Blotato.
- [ ] Open Settings > Billing and confirm the plan you expect (`starter`, `creator`, or `agency`).
- [ ] Open Settings > API only when you are ready for a paid plan. Generating a key ends the free trial.
- [ ] Copy the full API key, including any trailing `=`, into a secret store. Do not put it in a ticket or a git repo.

## Connect one network

- [ ] Use a private browser window. Log into only the account you want to connect, then connect it in Accounts.
- [ ] Instagram: the account is Professional or Business. Approve every permission on the prompt.
- [ ] Facebook: select a Page. Copy the Page id. Personal profiles and Groups are not posting targets.
- [ ] Confirm the account appears in Accounts, or in `GET /v2/users/me/accounts`.
- [ ] Write down the account id from that list. A Page id is a second value, from subaccounts.

## Publish once, by hand

- [ ] From the Blotato website, publish one short text post to X, LinkedIn, or Threads, or one image post to Instagram.
- [ ] Confirm you can see it on the social network while logged into that same account.
- [ ] Find Posts > Failed and open it once, so you know where a later failure shows up.

## Then the API

- [ ] `GET /v2/users/me/accounts` with the `blotato-api-key` header. You should see the account from the step above.
- [ ] Draft the first API post as a dry run. In this repo: `npm run draft -- --account <id> --platform twitter --text "Hello"`. Nothing is sent.
- [ ] Read the printed JSON. `content.platform` and `target.targetType` match. `scheduledTime`, if you set one, is next to `post` and has a timezone.
- [ ] Publish only when you mean to, with `--live` (or `live: true` on the MCP tool). Save the `postSubmissionId`.
- [ ] `GET /v2/posts/{postSubmissionId}` until the status is `published` or `failed`. Wait at least 10 seconds between checks.
- [ ] If it failed, read `errorMessage` and fix that cause. Do not resend the same body.

## If you use n8n

- [ ] Import `n8n/blotato-support-agent.json`.
- [ ] Set `BLOTATO_API_KEY` in the n8n environment. Do not paste the key into the workflow.
- [ ] Send a test ticket to the webhook. The last node holds the reply with `sendToCustomer: false`.
- [ ] Confirm the workflow has no `POST /v2/posts` step. Publishing stays a separate, explicit action.

## You are done when

- [ ] One post is visible on the network.
- [ ] You can find a failed post and its error without guessing.
- [ ] The API key is in a secret, and a teammate can list accounts with `scripts/smoke_readonly`.
