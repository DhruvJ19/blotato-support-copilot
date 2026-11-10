import type { BlotatoClient } from "./client.ts";
import { PublishBlockedError } from "./errors.ts";
import { PLATFORMS, type CreatePostBody, type CreatePostResult, type Platform } from "./types.ts";

export interface DraftInput {
  accountId: string;
  text: string;
  platform: string;
  mediaUrls?: string[];
  pageId?: string;
  boardId?: string;
  title?: string;
  isYourBrand?: boolean;
  isBrandedContent?: boolean;
  privacyLevel?: string;
  privacyStatus?: string;
  scheduledTime?: string;
  useNextFreeSlot?: boolean;
  /** Exactly true sends POST /v2/posts. Anything else is a dry run. */
  live?: boolean;
}

export interface DraftPreview {
  mode: "dry-run" | "live";
  published: boolean;
  valid: boolean;
  issues: string[];
  warnings: string[];
  request: CreatePostBody | null;
  response?: CreatePostResult;
}

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function buildDraft(input: DraftInput, now: Date = new Date()): DraftPreview {
  const issues: string[] = [];
  const warnings: string[] = [];
  const platform = parsePlatform(input.platform, issues);
  const mediaUrls = input.mediaUrls ?? [];
  const accountId = input.accountId.trim();
  const text = input.text;

  if (!accountId) {
    issues.push("accountId is required. Copy it from GET /v2/users/me/accounts. A page id is not an account id.");
  }
  if (typeof text !== "string") {
    issues.push("text is required. Use an empty string only when the platform allows a media-only post, and this checker still wants the field present.");
  }

  mediaUrls.forEach((url, index) => inspectMediaUrl(url, index, issues));

  if (platform === "facebook" && !input.pageId?.trim()) {
    issues.push("Facebook needs target.pageId from the account's subaccounts. Blotato posts to a Page, not a personal profile.");
  }
  if (platform === "linkedin" && input.pageId?.trim()) {
    warnings.push("LinkedIn pageId is set. Keep post.accountId as the member account id. pageId belongs on target, and it is the company page.");
  }
  if (platform === "tiktok") {
    if (typeof input.isYourBrand !== "boolean" || typeof input.isBrandedContent !== "boolean") {
      issues.push("TikTok needs both target.isYourBrand and target.isBrandedContent, even when both are false. There is no default.");
    }
    if (mediaUrls.length === 0) {
      issues.push("TikTok needs a public media URL on content.mediaUrls.");
    }
  }
  if (platform === "instagram" && mediaUrls.length === 0) {
    issues.push("Instagram needs at least one public image or video URL. Text-only Instagram posts are not accepted on this API.");
  }
  if (platform === "pinterest") {
    if (!input.boardId?.trim()) issues.push("Pinterest needs target.boardId from GET /v2/social/pinterest/boards?accountId=...");
    if (mediaUrls.length === 0) issues.push("Pinterest needs an image URL.");
  }
  if (platform === "youtube" && mediaUrls.length === 0) {
    issues.push("YouTube needs a public video URL.");
  }
  if (platform === "twitter" && text.length > 280) {
    warnings.push("The caption is longer than 280 characters. X may reject it unless this account can post longer text.");
  }
  if ((platform === "instagram" || platform === "facebook" || platform === "tiktok") && (text.match(/#/g) ?? []).length > 5) {
    issues.push("Blotato stops Instagram, Facebook, and TikTok captions at 5 hashtags. Trim the caption and try again.");
  }

  const wantsSlot = input.useNextFreeSlot === true;
  const scheduledTime = input.scheduledTime?.trim();
  if (wantsSlot && scheduledTime) {
    issues.push("Choose one schedule method. scheduledTime and useNextFreeSlot together still run slot checks and fail when no slot matches.");
  }
  if (scheduledTime && !ISO_WITH_ZONE.test(scheduledTime)) {
    issues.push("scheduledTime must be ISO 8601 with a timezone, for example 2026-11-12T15:04:00Z. Put it next to post, not inside post. A missing timezone is ignored by some clients and the post then goes out immediately.");
  } else if (scheduledTime) {
    const when = new Date(scheduledTime);
    if (Number.isNaN(when.getTime())) {
      issues.push("scheduledTime did not parse as a date.");
    } else if (when.getTime() <= now.getTime()) {
      issues.push("scheduledTime is not in the future. Pick a later time, or leave it off to publish immediately when you go live.");
    }
  }
  if (wantsSlot) {
    warnings.push("useNextFreeSlot schedules into the next open slot. It does not publish this second. The account needs a matching weekly slot.");
  }
  if (!wantsSlot && !scheduledTime && input.live === true) {
    warnings.push("No scheduledTime and no useNextFreeSlot. A live call publishes immediately.");
  }

  const request = platform && typeof text === "string" ? buildBody(input, platform, accountId, text, mediaUrls) : null;
  const live = input.live === true;

  if (!live) {
    warnings.push("Dry run. POST /v2/posts was not called.");
  }

  return {
    mode: live ? "live" : "dry-run",
    published: false,
    valid: issues.length === 0 && request !== null,
    issues,
    warnings,
    request,
  };
}

function buildBody(input: DraftInput, platform: Platform, accountId: string, text: string, mediaUrls: string[]): CreatePostBody {
  const target: CreatePostBody["post"]["target"] = { targetType: platform };
  if (input.pageId?.trim()) target.pageId = input.pageId.trim();
  if (input.boardId?.trim()) target.boardId = input.boardId.trim();
  if (input.title?.trim()) target.title = input.title.trim();
  if (typeof input.isYourBrand === "boolean") target.isYourBrand = input.isYourBrand;
  if (typeof input.isBrandedContent === "boolean") target.isBrandedContent = input.isBrandedContent;
  if (input.privacyLevel?.trim()) target.privacyLevel = input.privacyLevel.trim();
  if (input.privacyStatus?.trim()) target.privacyStatus = input.privacyStatus.trim();

  const body: CreatePostBody = {
    post: {
      accountId,
      content: {
        text,
        mediaUrls,
        platform,
      },
      target,
    },
  };
  if (input.scheduledTime?.trim()) body.scheduledTime = input.scheduledTime.trim();
  if (input.useNextFreeSlot === true) body.useNextFreeSlot = true;
  return body;
}

function parsePlatform(value: string, issues: string[]): Platform | null {
  const platform = value.trim().toLowerCase();
  if ((PLATFORMS as readonly string[]).includes(platform)) return platform as Platform;
  issues.push(`platform must be one of ${PLATFORMS.join(", ")}. content.platform and target.targetType are set to the same value.`);
  return null;
}

function inspectMediaUrl(value: string, index: number, issues: string[]): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    issues.push(`mediaUrls[${index}] is not a URL. Pass a public https link, or an empty array for a text-only post.`);
    return;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    issues.push(`mediaUrls[${index}] must be http or https. Data URLs and local files are not fetched by Blotato.`);
  }
  if (isPrivateHost(url.hostname)) {
    issues.push(`mediaUrls[${index}] points at a private host. Blotato's servers have to download the file, so use a link that opens without a VPN.`);
  }
  if (/drive\.google\.com$/i.test(url.hostname) && url.pathname.includes("/file/")) {
    issues.push("That Google Drive link opens a preview page. Use https://drive.usercontent.google.com/download?id=FILE_ID&export=download&confirm=t or upload with the presigned URL flow.");
  }
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "::1") return true;
  if (host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.")) return true;
  const match = /^172\.(\d+)\./.exec(host);
  if (match?.[1]) {
    const second = Number(match[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export async function draftPost(client: BlotatoClient, input: DraftInput, now?: Date): Promise<DraftPreview> {
  const preview = buildDraft(input, now);
  if (input.live !== true) return preview;
  if (!preview.valid || !preview.request) {
    return {
      ...preview,
      published: false,
      warnings: [...preview.warnings, "Live publish was requested and then blocked because the draft is not valid."],
    };
  }
  try {
    const response = await client.createPost(preview.request, { live: true });
    return { ...preview, published: true, response };
  } catch (error) {
    if (error instanceof PublishBlockedError) {
      return {
        ...preview,
        published: false,
        issues: [...preview.issues, error.message],
      };
    }
    throw error;
  }
}
