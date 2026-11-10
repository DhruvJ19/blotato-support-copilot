import { z } from "zod";
import type { BlotatoClient } from "../blotato/client.ts";
import { diagnosePost } from "../blotato/diagnose.ts";
import { draftPost, type DraftInput } from "../blotato/draft.ts";
import { BlotatoApiError, BlotatoConfigError } from "../blotato/errors.ts";
import { assertNever } from "../blotato/guard.ts";
import { PLATFORMS, type PostStatus } from "../blotato/types.ts";

const accountPlatform = z.enum([
  "twitter",
  "instagram",
  "linkedin",
  "facebook",
  "tiktok",
  "pinterest",
  "threads",
  "bluesky",
  "youtube",
  "other",
]);

export const listAccountsInput = z.object({
  platform: accountPlatform.optional().describe("Only return accounts for this platform. Omit to list every connected account."),
}).strict();

export const postStatusInput = z.object({
  postSubmissionId: z.string().min(1).describe("The postSubmissionId from the create-post response. Not a schedule id or a list-row id."),
}).strict();

export const draftInput = z.object({
  accountId: z.string().min(1).describe("Account id from blotato_list_accounts."),
  text: z.string().describe("Caption. Required by the API. Hashtags count toward Blotato's 5-hashtag guardrail on Instagram, Facebook, and TikTok."),
  platform: z.enum(PLATFORMS).describe("Social platform. content.platform and target.targetType are set to this same value."),
  mediaUrls: z.array(z.string()).optional().describe("Public file URLs. Use [] for a text-only post. Preview-page links are rejected."),
  pageId: z.string().optional().describe("Facebook Page id, or a LinkedIn company page id. Required for Facebook."),
  boardId: z.string().optional().describe("Pinterest board id. Required for Pinterest."),
  title: z.string().optional().describe("Optional title for Pinterest or YouTube."),
  isYourBrand: z.boolean().optional().describe("TikTok. Required, even when false. True only when the post promotes your own brand."),
  isBrandedContent: z.boolean().optional().describe("TikTok. Required, even when false. True for a paid partnership."),
  privacyLevel: z.string().optional().describe("Optional TikTok privacy level, such as SELF_ONLY."),
  privacyStatus: z.string().optional().describe("Optional YouTube privacy: public, private, or unlisted."),
  scheduledTime: z.string().optional().describe("ISO 8601 time with a timezone. Placed next to post, not inside it. Omit to leave the post unscheduled."),
  useNextFreeSlot: z.boolean().optional().describe("Schedule into the next open slot. Do not combine with scheduledTime."),
  live: z.boolean().optional().describe("Publish only when this is exactly true AND the user explicitly asked to publish. Omit it for a dry run. A dry run never calls POST /v2/posts."),
}).strict();

export type ToolPayload = { text: string; isError?: boolean };

function ok(value: unknown): ToolPayload {
  return { text: JSON.stringify(value, null, 2) };
}

function fail(error: unknown): ToolPayload {
  const message = error instanceof Error ? error.message : "Unknown tool error";
  return { text: message, isError: true };
}

export async function handleListAccounts(client: BlotatoClient, input: z.infer<typeof listAccountsInput>): Promise<ToolPayload> {
  try {
    const items = await client.listAccounts(input.platform);
    return ok({
      items,
      count: items.length,
      note: "Ids here are account ids. Facebook and LinkedIn page ids come from subaccounts and are not in this list.",
    });
  } catch (error) {
    return fail(error);
  }
}

export async function handleGetPostStatus(client: BlotatoClient, input: z.infer<typeof postStatusInput>): Promise<ToolPayload> {
  try {
    const status = await client.getPostStatus(input.postSubmissionId);
    return ok({
      ...status,
      note: statusNote(status),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function handleDiagnose(client: BlotatoClient, input: z.infer<typeof postStatusInput>): Promise<ToolPayload> {
  try {
    const diagnosis = await diagnosePost(client, input.postSubmissionId);
    return ok(diagnosis);
  } catch (error) {
    if (error instanceof BlotatoApiError || error instanceof BlotatoConfigError) return fail(error);
    return fail(error);
  }
}

function statusNote(status: PostStatus): string {
  switch (status.status) {
    case "published":
      return "Published. errorMessage is only meaningful when status is failed. The docs example fills every field at once, so ignore errorMessage here.";
    case "failed":
      return "Failed. Read errorMessage, then call blotato_diagnose_failed_post for the plain-language fix. Do not retry the same payload.";
    case "scheduled":
      return status.scheduledTime
        ? `Scheduled for ${status.scheduledTime}. This is not published. Stop polling.`
        : "Scheduled. This is not published. Stop polling.";
    case "in-progress":
      return "No published, failed, or scheduled record was found. Confirm this is the postSubmissionId from the create response. in-progress does not prove a job is queued.";
    default:
      return assertNever(status.status, "post status");
  }
}

export async function handleDraft(client: BlotatoClient, input: z.infer<typeof draftInput>): Promise<ToolPayload> {
  const draft: DraftInput = {
    accountId: input.accountId,
    text: input.text,
    platform: input.platform,
    ...(input.mediaUrls ? { mediaUrls: input.mediaUrls } : {}),
    ...(input.pageId ? { pageId: input.pageId } : {}),
    ...(input.boardId ? { boardId: input.boardId } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.isYourBrand !== undefined ? { isYourBrand: input.isYourBrand } : {}),
    ...(input.isBrandedContent !== undefined ? { isBrandedContent: input.isBrandedContent } : {}),
    ...(input.privacyLevel ? { privacyLevel: input.privacyLevel } : {}),
    ...(input.privacyStatus ? { privacyStatus: input.privacyStatus } : {}),
    ...(input.scheduledTime ? { scheduledTime: input.scheduledTime } : {}),
    ...(input.useNextFreeSlot !== undefined ? { useNextFreeSlot: input.useNextFreeSlot } : {}),
    live: input.live === true,
  };
  try {
    const preview = await draftPost(client, draft);
    return ok(preview);
  } catch (error) {
    return fail(error);
  }
}
