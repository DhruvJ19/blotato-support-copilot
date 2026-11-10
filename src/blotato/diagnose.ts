import { BlotatoApiError } from "./errors.ts";
import { assertNever } from "./guard.ts";
import type { BlotatoClient } from "./client.ts";
import type { PostStatusName } from "./types.ts";

export type DiagnosisConfidence = "high" | "medium" | "low";

export interface Diagnosis {
  postSubmissionId: string;
  status: PostStatusName | "not-found" | "lookup-failed";
  errorMessage: string | null;
  httpStatus: number | null;
  reqId: string | null;
  likelyCause: string;
  fix: string;
  confidence: DiagnosisConfidence;
  escalate: boolean;
  alreadyChecked: string[];
  doNot: string[];
}

interface ErrorRule {
  id: string;
  matches: (error: string) => boolean;
  cause: string;
  fix: string;
  confidence: DiagnosisConfidence;
  escalate: boolean;
}

/**
 * Ordered specific to general. Phrases come from the public error reference
 * and the publish docs, not from guesses about unpublished incidents.
 */
const RULES: ErrorRule[] = [
  {
    id: "api-key",
    matches: (error) => /wrong blotato api key|authorization failed|unauthorized access|invalid api key/i.test(error),
    cause: "Blotato rejected the API key.",
    fix: "In Settings > API, copy the full key again, including any = signs at the end, and paste it with no spaces. Check it with a read, such as listing accounts, before any publish.",
    confidence: "high",
    escalate: false,
  },
  {
    id: "tiktok-brand-fields",
    matches: (error) => /isyourbrand|isbrandedcontent/i.test(error),
    cause: "TikTok rejected the post because the request left out the paid-partnership questions. Blotato does not fill these in.",
    fix: "Submit a new post with both target.isYourBrand and target.isBrandedContent set to true or false. Put them on target, not inside content. isYourBrand is true only when the post promotes your own brand. isBrandedContent is true for a paid partnership. Retrying the same payload fails the same way.",
    confidence: "high",
    escalate: false,
  },
  {
    id: "page-permissions",
    matches: (error) => /wrong page id|pages_manage_posts|pages_read_engagement|global id .+ is not allowed/i.test(error),
    cause: "Facebook did not accept the Page, or the login is missing Page permissions. Blotato posts to a Page, not a personal profile or a Group.",
    fix: "In Accounts, use Copy Page ID, or list subaccounts for that Facebook account. Reconnect Facebook and leave the Page plus the posting permissions checked. Send that pageId on target.pageId and the account id on post.accountId.",
    confidence: "high",
    escalate: false,
  },
  {
    id: "account-id",
    matches: (error) => /wrong account id|account .+ not found/i.test(error),
    cause: "The account id on the request is not a current id for this API key and platform.",
    fix: "List accounts with the same key and copy the id from that response. A Page id is a different value. For a LinkedIn company Page, post.accountId is the account id and target.pageId is the page id from subaccounts.",
    confidence: "high",
    escalate: false,
  },
  {
    id: "hashtags",
    matches: (error) => /maximum of 5 hashtags/i.test(error),
    cause: "Blotato stopped the post because the caption has more than 5 hashtags. This is a Blotato limit, and the goal is reach.",
    fix: "Trim the caption to 5 hashtags or fewer and submit a new post.",
    confidence: "high",
    escalate: false,
  },
  {
    id: "duplicate-text",
    matches: (error) => /duplicate content/i.test(error),
    cause: "X rejected the post because this account already published that exact text.",
    fix: "Change the caption and submit a new post. If a second copy is waiting in Scheduled, remove that scheduled copy in the app so it does not also go out.",
    confidence: "high",
    escalate: false,
  },
  {
    id: "no-slot",
    matches: (error) => /no available slot/i.test(error),
    cause: "Next-free-slot scheduling found no open slot for this platform, account, and Page.",
    fix: "Add a weekly slot for that account, or send an exact scheduledTime and leave useNextFreeSlot off. Do not delete the scheduling fields to force it through. A request with neither field publishes immediately.",
    confidence: "high",
    escalate: false,
  },
  {
    id: "rate-limit",
    matches: (error) => /maximum number of \d+ posts|exceeded the number of videos|too many requests|exceeded rate limits|rate limit/i.test(error),
    cause: "Publishing is capped for this account right now. The file is not the first thing to change.",
    fix: "Wait out the window in the error, often 24 hours for a daily post cap or about an hour for a platform rate limit, then retry from Posts > Failed. If the same rate-limit error remains after a real wait, reconnect the account once. A stale token can keep tripping the limiter.",
    confidence: "high",
    escalate: false,
  },
  {
    id: "credits",
    matches: (error) => /ran out of ai credits|insufficient credits/i.test(error),
    cause: "The workspace is out of AI credits. That blocks video and image generation. It is a billing limit, not a broken social login.",
    fix: "Open Settings > Billing and check the credit balance before generating another visual. A finished post that only needs publishing does not use those credits.",
    confidence: "high",
    escalate: false,
  },
  {
    id: "reconnect",
    matches: (error) => /not permitted to perform this action|invalid_grant|error validating access token|account requires reconnect|has not authorized application|sessions for the user are not allowed|could not refresh tiktok access_token/i.test(error),
    cause: "The social account's login token is stale. A password change, a removed app, or an expired Meta or TikTok session does this.",
    fix: "In Accounts, choose Reconnect on that network and approve the prompt while logged into only that account. Then retry from Posts > Failed. Do not ask the customer to paste a token or an API key into the chat.",
    confidence: "high",
    escalate: false,
  },
  {
    id: "instagram-spam",
    matches: (error) => /restrict certain activity|instagram rejected your post/i.test(error),
    cause: "Instagram blocked the post on its spam checks.",
    fix: "Use fewer hashtags, shorten the caption, and wait longer between posts. If it keeps happening, publish a few posts by hand in the Instagram app, then retry from Posts > Failed.",
    confidence: "high",
    escalate: false,
  },
  {
    id: "media-shape",
    matches: (error) => /unsupported media type|unsupported media format|invalid file format|invalid video dimensions|aspect ratio is not supported|unsupported picture size/i.test(error),
    cause: "The platform refused the file. The format, size, or shape does not match what that network accepts.",
    fix: "Open the media link in a private window and confirm the file itself downloads. Export a fresh MP4 with H.264 video and AAC audio when it is a video. Clips longer than 120 seconds have to be fixed before upload, because Blotato will not convert those. Submit a new post and keep the original submission id.",
    confidence: "high",
    escalate: false,
  },
  {
    id: "media-fetch",
    matches: (error) => /could not upload media to storage|failed to upload stream|failed to fetch media|failed to read media metadata|url is empty|mediaurl is null|google drive can't scan/i.test(error),
    cause: "Blotato could not read the media link as a file. A preview page, a login wall, or an empty download causes this.",
    fix: "Open the link in a private window. It should download the file, not a preview. For Google Drive, use a direct download link (drive.usercontent.google.com/download) or the presigned upload flow. Then submit a new post.",
    confidence: "high",
    escalate: false,
  },
  {
    id: "generic-upload",
    matches: (error) => /could not upload media|could not upload video|post failed to publish/i.test(error),
    cause: "The platform rejected the upload. The same wording can be a file that misses the platform rules, or a stale connection. This message alone does not say which.",
    fix: "Open the failed post in Posts > Failed or in the Logs and read the more specific error under this one. If the file misses the platform rules, export a new file. If the log instead names a token or a permission, reconnect the account. Do not retry the unchanged post.",
    confidence: "medium",
    escalate: false,
  },
  {
    id: "temporary-platform",
    matches: (error) => /internal server error|unexpected error has occurred|please try again in a few minutes|retryable error|json value expected but got '<'/i.test(error),
    cause: "The social network returned a temporary error. The caption is not the first thing to rewrite.",
    fix: "Check Published before sending another copy. If it is not there, wait a few minutes and retry once from Posts > Failed. If the same error is still there after that wait, escalate with the submission id and the exact text.",
    confidence: "medium",
    escalate: false,
  },
];

const DO_NOT_REPUBLISH = "Do not submit a replacement post until this outcome is understood.";
const DO_NOT_ASK_KEY = "Do not ask the customer to paste an API key, OAuth code, or access token.";

export function explainError(errorMessage: string): Pick<Diagnosis, "likelyCause" | "fix" | "confidence" | "escalate"> {
  const rule = RULES.find((candidate) => candidate.matches(errorMessage));
  if (!rule) {
    return {
      likelyCause: "The post failed, and this exact wording is not in the mapped error reference. Guessing a cause here would send the customer down the wrong fix.",
      fix: "Keep the submission id and the exact error text. Ask a technical teammate to read the Logs for that id. Do not reconnect, re-encode, or republish until the log says which of those is actually required.",
      confidence: "low",
      escalate: true,
    };
  }
  return {
    likelyCause: rule.cause,
    fix: rule.fix,
    confidence: rule.confidence,
    escalate: rule.escalate,
  };
}

export async function diagnosePost(client: BlotatoClient, postSubmissionId: string): Promise<Diagnosis> {
  const id = postSubmissionId.trim();
  try {
    const status = await client.getPostStatus(id);
    return diagnosisFromStatus(status);
  } catch (error) {
    if (error instanceof BlotatoApiError && error.status === 404) {
      return {
        postSubmissionId: id,
        status: "not-found",
        errorMessage: null,
        httpStatus: 404,
        reqId: error.reqId ?? null,
        likelyCause: "Blotato has no submission with this id for the current API key.",
        fix: "Use the postSubmissionId from the original create response. The id on a row from GET /v2/posts is a schedule id, a published-post id, or a failed-post id, and those are different. List ids such as 98430 will not work here.",
        confidence: "high",
        escalate: false,
        alreadyChecked: ["GET /v2/posts/:postSubmissionId returned 404."],
        doNot: [DO_NOT_REPUBLISH, DO_NOT_ASK_KEY, "Do not keep polling this id. A 404 is not in-progress."],
      };
    }
    if (error instanceof BlotatoApiError) {
      const explained = explainError(error.message);
      return {
        postSubmissionId: id,
        status: "lookup-failed",
        errorMessage: error.message,
        httpStatus: error.status,
        reqId: error.reqId ?? null,
        likelyCause: explained.likelyCause,
        fix: explained.fix,
        confidence: explained.confidence,
        escalate: error.status >= 500 || explained.escalate,
        alreadyChecked: [`GET /v2/posts/:postSubmissionId failed with HTTP ${error.status}.`],
        doNot: [DO_NOT_REPUBLISH, DO_NOT_ASK_KEY],
      };
    }
    throw error;
  }
}

export function diagnosisFromStatus(status: {
  postSubmissionId: string;
  status: PostStatusName;
  errorMessage: string | null;
  publicUrl?: string | null;
  scheduledTime?: string | null;
}): Diagnosis {
  const base = {
    postSubmissionId: status.postSubmissionId,
    status: status.status,
    httpStatus: 200 as number | null,
    reqId: null,
    alreadyChecked: ["GET /v2/posts/:postSubmissionId"],
  };

  switch (status.status) {
    case "failed": {
      if (!status.errorMessage) {
        return {
          ...base,
          errorMessage: null,
          likelyCause: "The submission failed, and Blotato did not include an error message.",
          fix: "Open Posts > Failed or the Logs for this submission id and copy the error text from there. Do not guess a fix from the word failed alone.",
          confidence: "low",
          escalate: true,
          doNot: [DO_NOT_REPUBLISH, DO_NOT_ASK_KEY],
        };
      }
      const explained = explainError(status.errorMessage);
      return {
        ...base,
        errorMessage: status.errorMessage,
        ...explained,
        doNot: [DO_NOT_REPUBLISH, DO_NOT_ASK_KEY, "Do not retry the same payload unchanged."],
      };
    }
    case "published":
      return {
        ...base,
        errorMessage: null,
        likelyCause: status.publicUrl
          ? "This submission already published. Blotato recorded a public URL."
          : "This submission already published. Blotato did not return a public URL.",
        fix: status.publicUrl
          ? `Send the customer this link: ${status.publicUrl}. If they cannot see it while logged into the connected account, ask which account they expected. An unreachable link is not proof the post was deleted.`
          : "Tell the customer Blotato recorded the post as published, and ask them to check the connected account on the platform. Do not treat a missing link as a failed post.",
        confidence: "high",
        escalate: false,
        doNot: [
          "Do not describe this post as failed. The status example in the docs shows errorMessage filled in next to a published status because every field is illustrated at once. Only a failed status uses that field.",
          DO_NOT_REPUBLISH,
        ],
      };
    case "scheduled":
      return {
        ...base,
        errorMessage: null,
        likelyCause: status.scheduledTime
          ? `This post is waiting to publish at ${status.scheduledTime}.`
          : "This post is scheduled. The status response did not include a time.",
        fix: "Tell the customer the scheduled time and stop polling. Scheduled is not published and it is not failed.",
        confidence: "high",
        escalate: false,
        doNot: ["Do not submit another copy while this one is still scheduled."],
      };
    case "in-progress":
      return {
        ...base,
        errorMessage: null,
        likelyCause: "Blotato has no published, failed, or scheduled record for this id yet. The same status comes back when the id was never a real submission id. It does not prove a job is sitting in the queue.",
        fix: "Confirm the id is the postSubmissionId from the create response. Wait at least 10 seconds between checks, and stop after a few tries. If it is still in progress and the create response is in hand, escalate with that id instead of creating the post again.",
        confidence: "medium",
        escalate: false,
        doNot: [DO_NOT_REPUBLISH, "Do not treat in-progress as proof the id is valid."],
      };
    default:
      return assertNever(status.status, "post status");
  }
}
