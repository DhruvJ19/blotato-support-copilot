const LABELS: Record<string, string> = {
  twitter: "X (Twitter)",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  threads: "Threads",
  bluesky: "Bluesky",
  youtube: "YouTube",
  other: "a custom webhook",
};

export function platformLabel(platform: string): string {
  return LABELS[platform] ?? platform;
}
