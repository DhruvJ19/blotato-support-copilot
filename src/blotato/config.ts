import type { ClientMode } from "./types.ts";

export interface AppConfig {
  mode: ClientMode;
  apiKey: string | undefined;
  baseUrl: string;
}

const DEFAULT_BASE_URL = "https://backend.blotato.com/v2";

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const apiKey = env.BLOTATO_API_KEY?.trim() || undefined;
  const mock = env.BLOTATO_MOCK === "1" || env.BLOTATO_MOCK === "true";
  const baseUrl = (env.BLOTATO_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  const mode: ClientMode = mock ? "mock" : apiKey ? "live" : "unconfigured";
  return { mode, apiKey, baseUrl };
}
