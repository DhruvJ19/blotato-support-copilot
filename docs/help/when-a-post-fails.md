Status: draft for help.blotato.com
Source: support copilot, checked against the public API docs on 2026-11-10

# When a post fails

A create call that returns `201` means Blotato accepted the post. It does not mean the social network has published it yet. Keep the `postSubmissionId` from that response. That is the id you check later.

## Check the outcome

Call `GET https://backend.blotato.com/v2/posts/{postSubmissionId}` with your `blotato-api-key` header. Wait at least 10 seconds between checks.

| Status | What it means | What to do |
| --- | --- | --- |
| `published` | The post went out. | Use `publicUrl` when it is present. A missing link is not the same thing as a failure. |
| `scheduled` | It is waiting for its time. | Tell the customer the `scheduledTime` and stop checking. |
| `in-progress` | No published, failed, or scheduled record was found for this id. | Confirm the id came from the create response. This status also comes back for an id that was never accepted. It does not prove a job is in the queue. |
| `failed` | Publishing stopped. | Read `errorMessage` and fix that cause. Then submit a new post. |

Only a `failed` status uses `errorMessage`. Ignore that field on any other status.

## Use the right id

The status endpoint wants the `postSubmissionId` from the create response. A row from `GET /v2/posts` has a different id: a schedule id, a published-post id, or a failed-post id. Those ids return "not found" on the status endpoint. The sample failed row `98430` is one of those list ids.

## Fix the cause, then retry

Sending the same body again usually fails the same way.

- **Unsupported media type**, a bad format, or a bad aspect ratio: the file itself was refused. Export a fresh MP4 (H.264 video, AAC audio) that matches the network. Clips longer than 120 seconds have to be fixed before upload.
- **Could not read the media link**: the URL opened a preview page or a login wall. The file has to download in a private browser window. Google Drive `/view` links need a direct download URL, or use the presigned upload flow.
- **TikTok brand fields**: every TikTok post needs both `target.isYourBrand` and `target.isBrandedContent`, even when both are false.
- **Facebook Page**: post to a Page. `post.accountId` is the account id. `target.pageId` comes from that account's subaccounts.
- **Rate limit or a daily cap**: wait out the window in the error. Retry from Posts > Failed after that.
- **Stale login** ("not permitted", `invalid_grant`, access token): reconnect that network in Accounts. Do not paste tokens into chat.

## Scheduling trips

`scheduledTime` and `useNextFreeSlot` sit next to `post`, not inside it. If they are nested inside `post`, Blotato ignores them and the post publishes immediately. Pick one method. A request with neither field publishes immediately.

## What to send support

The submission id, the network, the exact `errorMessage`, the time with timezone, and what you already tried. Leave out the API key. Failed posts are also listed in the app under Posts > Failed, and API calls are in the developer logs.
