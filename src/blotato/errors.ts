import { isRecord } from "./guard.ts";

export class BlotatoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlotatoConfigError";
  }
}

export class PublishBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishBlockedError";
  }
}

export class BlotatoApiError extends Error {
  readonly status: number;
  readonly reqId: string | undefined;
  readonly action: string | undefined;
  readonly subscriptionStatus: string | undefined;

  constructor(status: number, body: unknown, apiKey: string | undefined) {
    const parsed = readErrorBody(body);
    super(redact(formatApiError(status, parsed), apiKey));
    this.name = "BlotatoApiError";
    this.status = status;
    this.reqId = parsed.reqId;
    this.action = parsed.action;
    this.subscriptionStatus = parsed.subscriptionStatus;
  }
}

interface ParsedErrorBody {
  message: string;
  reqId: string | undefined;
  action: string | undefined;
  subscriptionStatus: string | undefined;
}

function readErrorBody(body: unknown): ParsedErrorBody {
  if (!isRecord(body)) {
    const message = typeof body === "string" && body.trim() ? body.trim().slice(0, 400) : "The API returned an empty error body.";
    return { message, reqId: undefined, action: undefined, subscriptionStatus: undefined };
  }
  const message = typeof body.message === "string" && body.message.trim()
    ? body.message.trim()
    : "The API returned an error without a message.";
  return {
    message,
    reqId: typeof body.reqId === "string" ? body.reqId : undefined,
    action: typeof body.action === "string" ? body.action : undefined,
    subscriptionStatus: typeof body.subscriptionStatus === "string" ? body.subscriptionStatus : undefined,
  };
}

function formatApiError(status: number, body: ParsedErrorBody): string {
  const parts = [`Blotato API ${status}: ${body.message}`];
  if (body.subscriptionStatus) parts.push(`subscriptionStatus: ${body.subscriptionStatus}`);
  if (body.action) parts.push(`action: ${body.action}`);
  if (body.reqId) parts.push(`reqId: ${body.reqId}`);
  if (status === 401) {
    parts.push("Copy the full key from Settings > API, including any trailing = characters, with no extra spaces.");
  }
  if (status === 403) {
    parts.push("A 403 on this API is often a billing or plan block. Check Settings > Billing before retrying.");
  }
  if (status === 404) {
    parts.push("Check the id type. A schedule id or a published-post id is not a postSubmissionId.");
  }
  if (status === 422) {
    parts.push("Correct the field named in the message. Compare the body with the publish schema.");
  }
  if (status === 429) {
    parts.push("Wait and slow down. Post create and media upload are limited to 30 requests a minute. Status and list are 60.");
  }
  if (status >= 500) {
    parts.push("For a read, retry a few times with a pause. For a create, look up the existing submission before sending another.");
  }
  return parts.join(" ");
}

export function redact(text: string, secret: string | undefined): string {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}
