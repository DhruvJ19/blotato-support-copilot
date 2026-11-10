import { BlotatoClient } from "../blotato/client.ts";
import { readConfig } from "../blotato/config.ts";
import { draftPost, type DraftInput } from "../blotato/draft.ts";
import { readFlag, readOption } from "./args.ts";

const argv = process.argv.slice(2);
const live = readFlag(argv, "--live");
const accountId = readOption(argv, "--account");
const platform = readOption(argv, "--platform");
const text = readOption(argv, "--text");

if (!accountId || !platform || text === undefined) {
  console.error("Usage: npm run draft -- --account <id> --platform <platform> --text <caption> [--media <url>] [--page <id>] [--at <iso>] [--slot] [--live]");
  console.error("Omit --live for a dry run. --live calls POST /v2/posts.");
  process.exit(2);
}

const media = readOption(argv, "--media");
const input: DraftInput = {
  accountId,
  platform,
  text,
  ...(media ? { mediaUrls: [media] } : {}),
  ...(readOption(argv, "--page") ? { pageId: readOption(argv, "--page") } : {}),
  ...(readOption(argv, "--at") ? { scheduledTime: readOption(argv, "--at") } : {}),
  ...(readFlag(argv, "--slot") ? { useNextFreeSlot: true } : {}),
  ...(readFlag(argv, "--your-brand") ? { isYourBrand: true } : {}),
  ...(readFlag(argv, "--branded") ? { isBrandedContent: true } : {}),
  live,
};

if (live) {
  console.error("LIVE: this process will call POST /v2/posts.");
} else {
  console.error("Dry run. Pass --live to publish. Nothing will be sent.");
}

const config = readConfig();
const client = new BlotatoClient({
  mode: config.mode,
  ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  baseUrl: config.baseUrl,
});

try {
  const preview = await draftPost(client, input);
  console.log(JSON.stringify(preview, null, 2));
  process.exit(preview.published || preview.valid ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Draft failed.");
  process.exit(1);
}
