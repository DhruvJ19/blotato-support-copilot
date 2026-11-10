import { McpServer } from "@modelcontextprotocol/server";
import type { BlotatoClient } from "../blotato/client.ts";
import {
  draftInput,
  handleDiagnose,
  handleDraft,
  handleGetPostStatus,
  handleListAccounts,
  listAccountsInput,
  postStatusInput,
  type ToolPayload,
} from "./handlers.ts";

function toContent(payload: ToolPayload) {
  return {
    content: [{ type: "text" as const, text: payload.text }],
    ...(payload.isError ? { isError: true as const } : {}),
  };
}

export function createSupportServer(client: BlotatoClient): McpServer {
  const server = new McpServer({
    name: "blotato-mcp-server",
    version: "1.0.0",
  });

  server.registerTool(
    "blotato_list_accounts",
    {
      title: "List connected accounts",
      description: "List the social accounts connected to this Blotato workspace. Read-only. Use the returned id as accountId when drafting a post. Facebook and LinkedIn page ids are not in this list.",
      inputSchema: listAccountsInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => toContent(await handleListAccounts(client, input)),
  );

  server.registerTool(
    "blotato_get_post_status",
    {
      title: "Get post status",
      description: "Read GET /v2/posts/:postSubmissionId. Status is in-progress, scheduled, published, or failed. Use the id from the create response. A list-row id will not work. This does not publish, retry, or delete.",
      inputSchema: postStatusInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => toContent(await handleGetPostStatus(client, input)),
  );

  server.registerTool(
    "blotato_diagnose_failed_post",
    {
      title: "Diagnose a post",
      description: "Pull the submission status and, when it failed, map errorMessage to a plain-language cause and fix from the public error reference. Published, scheduled, and in-progress results are explained too. Never retries the post.",
      inputSchema: postStatusInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => toContent(await handleDiagnose(client, input)),
  );

  server.registerTool(
    "blotato_draft_post",
    {
      title: "Draft a post",
      description: "Build a POST /v2/posts body and validate it. Defaults to a dry run and does not call the API. Set live to true only when the user explicitly asked to publish. Scheduling fields are placed next to post. Invalid drafts are never sent, even with live true. This tool cannot delete a post.",
      inputSchema: draftInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => toContent(await handleDraft(client, input)),
  );

  return server;
}
