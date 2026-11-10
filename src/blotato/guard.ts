export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertNever(value: never, label: string): never {
  throw new Error(`Unexpected ${label}: ${JSON.stringify(value)}`);
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
