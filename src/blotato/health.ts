import type { BlotatoClient } from "./client.ts";
import { explainError } from "./diagnose.ts";
import { platformLabel } from "./platforms.ts";
import type { Account, ListedPost } from "./types.ts";

export interface HealthReport {
  markdown: string;
  skipped: boolean;
  accountCount: number;
  failureCount: number;
}

export async function buildHealthReport(options: {
  client: BlotatoClient | null;
  now?: Date;
  skipReason?: string;
}): Promise<HealthReport> {
  const now = options.now ?? new Date();
  if (!options.client || options.skipReason) {
    return {
      markdown: skippedMarkdown(now, options.skipReason ?? "BLOTATO_API_KEY is not set."),
      skipped: true,
      accountCount: 0,
      failureCount: 0,
    };
  }

  const mock = options.client.mode === "mock";
  const until = mock ? "2026-04-02T00:00:00.000Z" : now.toISOString();
  const since = mock ? "2026-03-01T00:00:00.000Z" : new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const accounts = await options.client.listAccounts();
  const failures = await listFailed(options.client, since, until);
  return {
    markdown: renderReport({ now, since, until, mock, accounts, failures }),
    skipped: false,
    accountCount: accounts.length,
    failureCount: failures.length,
  };
}

async function listFailed(client: BlotatoClient, since: string, until: string): Promise<ListedPost[]> {
  const items: ListedPost[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const response = await client.listPosts({
      since,
      until,
      status: ["failed"],
      limit: 50,
      ...(cursor ? { cursor } : {}),
    });
    for (const item of response.items) {
      if (item.state.type === "failed") items.push(item);
    }
    if (!response.cursor) break;
    cursor = response.cursor;
  }
  return items;
}

function skippedMarkdown(now: Date, reason: string): string {
  return `# Blotato daily health

Date: ${now.toISOString().slice(0, 10)}
Mode: skipped

${reason} No request was sent.

Set BLOTATO_API_KEY and run \`npm run health\` again for a live read of connected accounts and failed posts.
`;
}

function renderReport(input: {
  now: Date;
  since: string;
  until: string;
  mock: boolean;
  accounts: Account[];
  failures: ListedPost[];
}): string {
  const accountRows = input.accounts.length === 0
    ? "No connected accounts came back. Ask the customer to open Accounts and connect a network before debugging a single post.\n"
    : [
      "| Platform | Name | Username | Account id |",
      "| --- | --- | --- | --- |",
      ...input.accounts.map((account) => `| ${platformLabel(account.platform)} | ${escapeCell(account.fullname)} | ${escapeCell(account.username)} | ${account.id} |`),
    ].join("\n");

  const failureSections = input.failures.length === 0
    ? "No failed posts in this window.\n"
    : input.failures.map((post) => renderFailure(post)).join("\n");

  const escalations = input.failures.filter((post) => {
    if (post.state.type !== "failed" || !post.state.errorMessage) return true;
    return explainError(post.state.errorMessage).escalate;
  });

  const modeNote = input.mock
    ? "Mode: mock. The window covers the documented list-posts example from the API docs, not the last 24 hours. No network call was made.\n"
    : "Mode: live. Reads only: GET /v2/users/me/accounts and GET /v2/posts?status=failed. Nothing was published, scheduled, or deleted.\n";

  return `# Blotato daily health

Date: ${input.now.toISOString().slice(0, 10)}
${modeNote}
Window: ${input.since} to ${input.until}

## Connected accounts

${input.accounts.length} account${input.accounts.length === 1 ? "" : "s"}.

${accountRows}

## Failed posts in this window

${input.failures.length} failed.

${failureSections}
## Needs a person

${escalations.length === 0
    ? "Every failure in this window matches a known fix. A support reply can carry that fix. No engineering escalation from this report."
    : `${escalations.length} failure${escalations.length === 1 ? "" : "s"} need a person because the error is missing or unmapped. Keep the list id and the exact error. Do not republish those posts from this report.`}
`;
}

function renderFailure(post: ListedPost): string {
  if (post.state.type !== "failed") return "";
  const explained = post.state.errorMessage
    ? explainError(post.state.errorMessage)
    : {
      likelyCause: "The list row failed and did not include an error message.",
      fix: "Open Posts > Failed for this row and copy the error before retrying.",
      confidence: "low" as const,
      escalate: true,
    };
  const accountLine = post.account
    ? `${post.account.name} (${post.account.id})`
    : "The account field is null, so that social login is no longer connected. Reconnect it after the error below is fixed, or the next try can fail for a second reason.";
  return `### ${post.state.errorMessage ?? "Failed, no error message"}

- When: ${post.postTime}
- Platform: ${platformLabel(post.platform)}
- Account: ${accountLine}
- List id: ${post.id} (this is a failed-post id, not a postSubmissionId)
- Confidence: ${explained.confidence}
- Escalate: ${explained.escalate ? "yes" : "no"}
- Likely cause: ${explained.likelyCause}
- Fix: ${explained.fix}
`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
