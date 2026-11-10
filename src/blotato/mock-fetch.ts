import { readFileSync } from "node:fs";
import { isRecord } from "./guard.ts";

interface RecordedRequest {
  method: string;
  url: string;
  body: string | undefined;
  headerNames: string[];
}

export interface MockFetch {
  fetch: typeof fetch;
  requests: RecordedRequest[];
}

function fixture(name: string): unknown {
  const url = new URL(`../../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function headerNames(init: RequestInit | undefined): string[] {
  const headers = new Headers(init?.headers);
  return [...headers.keys()];
}

/**
 * In-process Blotato API. Responses are the documented JSON shapes in fixtures/.
 * POST /v2/posts is implemented so a live-flag test can observe it, and it
 * never leaves the machine.
 */
export function createMockFetch(): MockFetch {
  const requests: RecordedRequest[] = [];
  const accounts = fixture("accounts.json");
  const statuses = fixture("post-status.json");
  const posts = fixture("posts-list.json");
  const notFound = fixture("errors/404.json");

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const rawBody = typeof init?.body === "string" ? init.body : undefined;
    requests.push({ method, url: url.href, body: rawBody, headerNames: headerNames(init) });

    if (method !== "GET" && method !== "POST") {
      return jsonResponse(405, { message: "This copilot only reads, plus an explicit live publish." });
    }

    const path = url.pathname.replace(/\/$/, "");

    if (method === "GET" && path.endsWith("/users/me/accounts")) {
      return filterAccounts(accounts, url.searchParams.get("platform"));
    }

    if (method === "GET" && /\/posts\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
      if (!isRecord(statuses) || !isRecord(statuses[id])) {
        return jsonResponse(404, notFound);
      }
      return jsonResponse(200, statuses[id]);
    }

    if (method === "GET" && path.endsWith("/posts")) {
      return filterPosts(posts, url.searchParams);
    }

    if (method === "POST" && path.endsWith("/posts")) {
      return jsonResponse(201, {
        postSubmissionId: "mock-0000-0000-0000-000000000000",
        scheduledTime: undefined,
      });
    }

    return jsonResponse(404, { message: `No mock for ${method} ${path}` });
  };

  return { fetch: fetchImpl, requests };
}

function filterAccounts(body: unknown, platform: string | null): Response {
  if (!isRecord(body) || !Array.isArray(body.items)) {
    return jsonResponse(500, { message: "Account fixture is missing items." });
  }
  const items = platform ? body.items.filter((item) => isRecord(item) && item.platform === platform) : body.items;
  return jsonResponse(200, { items });
}

function filterPosts(body: unknown, search: URLSearchParams): Response {
  if (search.get("cursor")) {
    return jsonResponse(200, { items: [] });
  }
  if (!isRecord(body) || !Array.isArray(body.items)) {
    return jsonResponse(500, { message: "Posts fixture is missing items." });
  }
  const statuses = search.getAll("status");
  const platforms = search.getAll("platform");
  const since = search.get("since");
  const until = search.get("until");
  const items = body.items.filter((item) => {
    if (!isRecord(item) || !isRecord(item.state)) return false;
    const type = item.state.type;
    if (statuses.length > 0 && (typeof type !== "string" || !statuses.includes(type))) return false;
    if (platforms.length > 0 && (typeof item.platform !== "string" || !platforms.includes(item.platform))) return false;
    if (typeof item.postTime !== "string") return false;
    if (since && item.postTime < since) return false;
    if (until && item.postTime > until) return false;
    return true;
  });
  const cursor = typeof body.cursor === "string" ? body.cursor : undefined;
  return jsonResponse(200, cursor ? { items, cursor } : { items });
}
