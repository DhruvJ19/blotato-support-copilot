import { BlotatoClient } from "../blotato/client.ts";

/**
 * Live read-only check. Lists accounts and, when BLOTATO_SUBMISSION_ID is set,
 * reads that one submission. Never creates, schedules, or deletes a post.
 */
const apiKey = process.env.BLOTATO_API_KEY?.trim();

if (!apiKey) {
  console.log("BLOTATO_API_KEY is not set. Skipped the live read. No request was sent.");
  process.exit(0);
}

const baseUrl = (process.env.BLOTATO_API_BASE_URL?.trim() || "https://backend.blotato.com/v2").replace(/\/$/, "");
const client = new BlotatoClient({ mode: "live", apiKey, baseUrl });

try {
  const accounts = await client.listAccounts();
  console.log(`Connected accounts: ${accounts.length}`);
  for (const account of accounts) {
    console.log(`- ${account.platform}\t${account.username}\t${account.id}`);
  }

  const submissionId = process.env.BLOTATO_SUBMISSION_ID?.trim();
  if (!submissionId) {
    console.log("BLOTATO_SUBMISSION_ID is not set. Skipped the status lookup.");
    process.exit(0);
  }

  const status = await client.getPostStatus(submissionId);
  console.log("Post status:");
  console.log(JSON.stringify({
    postSubmissionId: status.postSubmissionId,
    status: status.status,
    scheduledTime: status.scheduledTime,
    publicUrl: status.publicUrl,
    errorMessage: status.status === "failed" ? status.errorMessage : null,
  }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : "Smoke check failed.";
  console.error(message);
  process.exit(1);
}
