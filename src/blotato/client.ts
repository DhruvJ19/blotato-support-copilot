import { BlotatoApiError, BlotatoConfigError, PublishBlockedError, redact } from "./errors.ts";
import { asString, isRecord } from "./guard.ts";
import { createMockFetch } from "./mock-fetch.ts";
import {
  POST_STATUSES,
  type Account,
  type ClientMode,
  type CreatePostBody,
  type CreatePostResult,
  type ListPostsQuery,
  type ListPostsResponse,
  type ListedPost,
  type ListedPostAccount,
  type ListedPostState,
  type PostStatus,
  type PostStatusName,
} from "./types.ts";

export interface ClientOptions {
  mode: ClientMode;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://backend.blotato.com/v2";

/**
 * Thin REST client for https://backend.blotato.com/v2.
 * Auth header is `blotato-api-key`. The only write method is createPost,
 * and it throws unless the caller passes live: true.
 */
export class BlotatoClient {
  readonly mode: ClientMode;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions) {
    this.mode = options.mode;
    this.apiKey = options.apiKey?.trim() || undefined;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    if (options.fetchImpl) {
      this.fetchImpl = options.fetchImpl;
    } else if (options.mode === "mock") {
      this.fetchImpl = createMockFetch().fetch;
    } else {
      this.fetchImpl = fetch;
    }
  }

  async listAccounts(platform?: string): Promise<Account[]> {
    const query = platform ? `?platform=${encodeURIComponent(platform)}` : "";
    const body = await this.request("GET", `/users/me/accounts${query}`);
    return parseAccounts(body);
  }

  async getPostStatus(postSubmissionId: string): Promise<PostStatus> {
    const id = requireId(postSubmissionId);
    const body = await this.request("GET", `/posts/${encodeURIComponent(id)}`);
    return parsePostStatus(body);
  }

  async listPosts(query: ListPostsQuery = {}): Promise<ListPostsResponse> {
    const params = new URLSearchParams();
    if (query.since) params.set("since", query.since);
    if (query.until) params.set("until", query.until);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.cursor) params.set("cursor", query.cursor);
    for (const status of query.status ?? []) params.append("status", status);
    for (const platform of query.platform ?? []) params.append("platform", platform);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    const body = await this.request("GET", `/posts${suffix}`);
    return parseListPosts(body);
  }

  /**
   * POST /v2/posts. Refuses to run unless live is exactly true.
   * There is no schedule-delete or post-delete method on this client.
   */
  async createPost(body: CreatePostBody, options: { live: boolean }): Promise<CreatePostResult> {
    if (options.live !== true) {
      throw new PublishBlockedError(
        "Refusing to publish. The draft stays a dry run until live is exactly true (--live on the CLI, or live: true on the MCP tool).",
      );
    }
    this.assertConfigured();
    const response = await this.request("POST", "/posts", body);
    return parseCreatePost(response, this.mode === "mock");
  }

  private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    this.assertConfigured();
    const headers = new Headers({
      accept: "application/json",
      "user-agent": "blotato-support-copilot",
    });
    if (this.apiKey) headers.set("blotato-api-key", this.apiKey);
    if (body !== undefined) headers.set("content-type", "application/json");

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "network error";
      throw new BlotatoApiError(0, { message: redact(message, this.apiKey) }, undefined);
    }

    const text = await response.text();
    const parsed = parseJson(text);
    if (!response.ok) {
      throw new BlotatoApiError(response.status, parsed ?? text, this.apiKey);
    }
    return parsed;
  }

  private assertConfigured(): void {
    if (this.mode === "unconfigured" || (this.mode === "live" && !this.apiKey)) {
      throw new BlotatoConfigError(
        "BLOTATO_API_KEY is not set. Export the key to talk to the live API, or set BLOTATO_MOCK=1 to use the recorded fixtures. No request was sent.",
      );
    }
  }
}

function parseJson(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function requireId(value: string): string {
  const id = value.trim();
  if (!id || /\s/.test(id) || id.includes("/")) {
    throw new BlotatoConfigError("postSubmissionId must be the id from the create response, with no spaces.");
  }
  return id;
}

/**
 * The rendered help page once showed `items` as an array wrapped in a second
 * array. The OpenAPI schema says each entry is an object. Flatten one extra
 * layer so either shape still lists the accounts.
 */
export function unwrapItems(items: unknown[]): unknown[] {
  const first = items[0];
  if (items.length > 0 && items.every((item) => Array.isArray(item))) {
    return items.flat();
  }
  if (items.length === 1 && Array.isArray(first)) return first;
  return items;
}

export function parseAccounts(body: unknown): Account[] {
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw new Error("Accounts response did not include items. Expected GET /v2/users/me/accounts.");
  }
  return unwrapItems(body.items).map((item, index) => {
    if (!isRecord(item)) throw new Error(`Account at index ${index} was not an object.`);
    const id = asString(item.id);
    const platform = asString(item.platform);
    const fullname = asString(item.fullname);
    const username = asString(item.username);
    if (!id || !platform || fullname === undefined || username === undefined) {
      throw new Error(`Account at index ${index} is missing id, platform, fullname, or username.`);
    }
    return { id, platform, fullname, username };
  });
}

export function parsePostStatus(body: unknown): PostStatus {
  if (!isRecord(body)) throw new Error("Post status response was not an object.");
  const postSubmissionId = asString(body.postSubmissionId);
  const status = asString(body.status);
  if (!postSubmissionId || !status || !isPostStatus(status)) {
    throw new Error("Post status response is missing postSubmissionId or a known status.");
  }
  return {
    postSubmissionId,
    status,
    scheduledTime: nullableString(body.scheduledTime),
    publicUrl: nullableString(body.publicUrl),
    errorMessage: nullableString(body.errorMessage),
  };
}

function isPostStatus(value: string): value is PostStatusName {
  return (POST_STATUSES as readonly string[]).includes(value);
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : null;
}

export function parseListPosts(body: unknown): ListPostsResponse {
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw new Error("List posts response did not include items.");
  }
  const items = body.items.map((item, index) => parseListedPost(item, index));
  const cursor = asString(body.cursor);
  return { items, cursor };
}

function parseListedPost(value: unknown, index: number): ListedPost {
  if (!isRecord(value)) throw new Error(`Post at index ${index} was not an object.`);
  const id = asString(value.id);
  const postTime = asString(value.postTime);
  const platform = asString(value.platform);
  const text = asString(value.text);
  if (!id || !postTime || !platform || text === undefined || !Array.isArray(value.mediaUrls)) {
    throw new Error(`Post at index ${index} is missing id, postTime, platform, text, or mediaUrls.`);
  }
  const mediaUrls = value.mediaUrls.map((url, urlIndex) => {
    if (typeof url !== "string") throw new Error(`Post ${id} mediaUrls[${urlIndex}] was not a string.`);
    return url;
  });
  return {
    id,
    postTime,
    platform,
    text,
    mediaUrls,
    account: parseListedAccount(value.account, id),
    state: parseListedState(value.state, id),
  };
}

function parseListedAccount(value: unknown, postId: string): ListedPostAccount | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error(`Post ${postId} has an account that is neither an object nor null.`);
  const id = asString(value.id);
  const name = asString(value.name);
  if (!id || name === undefined) throw new Error(`Post ${postId} account is missing id or name.`);
  let subaccount: { id: string; name: string } | null = null;
  if (value.subaccount !== null && value.subaccount !== undefined) {
    if (!isRecord(value.subaccount)) throw new Error(`Post ${postId} subaccount was not an object.`);
    const subId = asString(value.subaccount.id);
    const subName = asString(value.subaccount.name);
    if (!subId || subName === undefined) throw new Error(`Post ${postId} subaccount is missing id or name.`);
    subaccount = { id: subId, name: subName };
  }
  return { id, name, subaccount };
}

function parseListedState(value: unknown, postId: string): ListedPostState {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error(`Post ${postId} is missing state.type.`);
  }
  switch (value.type) {
    case "scheduled":
      return { type: "scheduled" };
    case "published":
      return {
        type: "published",
        postUrl: nullableString(value.postUrl),
        analytics: value.analytics ?? null,
      };
    case "failed":
      return { type: "failed", errorMessage: nullableString(value.errorMessage) };
    default:
      throw new Error(`Post ${postId} has an unknown state.type of ${value.type}.`);
  }
}

function parseCreatePost(body: unknown, mock: boolean): CreatePostResult {
  if (!isRecord(body) || !asString(body.postSubmissionId)) {
    throw new Error("Create post response did not include postSubmissionId.");
  }
  const scheduledTime = asString(body.scheduledTime);
  return {
    postSubmissionId: body.postSubmissionId as string,
    ...(scheduledTime ? { scheduledTime } : {}),
    mock,
  };
}
