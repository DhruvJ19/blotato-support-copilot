export const PLATFORMS = [
  "twitter",
  "instagram",
  "linkedin",
  "facebook",
  "tiktok",
  "pinterest",
  "threads",
  "bluesky",
  "youtube",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const POST_STATUSES = ["in-progress", "failed", "published", "scheduled"] as const;

export type PostStatusName = (typeof POST_STATUSES)[number];

export interface Account {
  id: string;
  platform: string;
  fullname: string;
  username: string;
}

/** Response of GET /v2/posts/:postSubmissionId. Fields follow the OpenAPI schema. */
export interface PostStatus {
  postSubmissionId: string;
  status: PostStatusName;
  scheduledTime: string | null;
  publicUrl: string | null;
  errorMessage: string | null;
}

export interface ListedPostAccount {
  id: string;
  name: string;
  subaccount: { id: string; name: string } | null;
}

export type ListedPostState =
  | { type: "scheduled" }
  | { type: "published"; postUrl: string | null; analytics: unknown }
  | { type: "failed"; errorMessage: string | null };

export interface ListedPost {
  id: string;
  postTime: string;
  platform: string;
  text: string;
  mediaUrls: string[];
  account: ListedPostAccount | null;
  state: ListedPostState;
}

export interface ListPostsResponse {
  items: ListedPost[];
  cursor: string | undefined;
}

export interface ListPostsQuery {
  since?: string;
  until?: string;
  limit?: number;
  cursor?: string;
  status?: Array<"scheduled" | "published" | "failed">;
  platform?: string[];
}

export interface CreatePostBody {
  post: {
    accountId: string;
    content: {
      text: string;
      mediaUrls: string[];
      platform: Platform;
    };
    target: Record<string, unknown> & { targetType: Platform };
  };
  scheduledTime?: string;
  useNextFreeSlot?: boolean;
}

export interface CreatePostResult {
  postSubmissionId: string;
  scheduledTime?: string;
  mock: boolean;
}

export type ClientMode = "live" | "mock" | "unconfigured";
