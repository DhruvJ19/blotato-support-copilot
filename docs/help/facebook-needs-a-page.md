Status: draft for help.blotato.com
Source: support copilot, checked against the public API docs on 2026-11-10

# Facebook posts go to a Page

Blotato publishes to a Facebook Page. It does not publish to a personal profile or a Group. A post that only has an account id, with no Page id, fails even when the Facebook login looks connected.

## The two ids

1. Open Accounts, or call `GET /v2/users/me/accounts`, and copy the Facebook **account id**.
2. Call `GET /v2/users/me/accounts/{accountId}/subaccounts`, or use **Copy Page ID** in Accounts, and copy the **Page id**.
3. Send the account id as `post.accountId`.
4. Send the Page id as `post.target.pageId`.
5. Set both `content.platform` and `target.targetType` to `facebook`.

A Page id in the account id field produces "account not found". An account id in the Page field produces a wrong Page id error.

## Permissions

If the error mentions `pages_read_engagement` and `pages_manage_posts`, the login is missing Page access. Reconnect Facebook and leave the Page and those permissions checked. You do not need to remove the whole integration as a first step.

The "(#100) global id is not allowed" error means the id on the call is not a Page this login can post to. List the subaccounts again with the same API key and use a Page from that response. A saved dropdown from an old workflow is not proof the id still works.

## Limits

Each Page can take 25 posts in 24 hours through this path. A second Page has its own count. When the error names that cap, wait and retry from Posts > Failed. Changing the video will not raise the cap.

## A good first post

Connect the Page, confirm it appears under Accounts, then publish one short post from the Blotato website before you automate it. Save the `postSubmissionId` if you use the API, and check that id until the status is `published` or `failed`.
