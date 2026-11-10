import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { BlotatoClient } from "../blotato/client.ts";
import { readConfig } from "../blotato/config.ts";
import { createSupportServer } from "./server.ts";

const config = readConfig();
const client = new BlotatoClient({
  mode: config.mode,
  ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  baseUrl: config.baseUrl,
});
const server = createSupportServer(client);
const transport = new StdioServerTransport();
await server.connect(transport);
