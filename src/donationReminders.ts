import type { Settings } from "./settingsSchema";

export type DonationMilestone = {
  kind: "clicks" | "time";
  threshold: number;
  label: string;
};

export type DonationPrompt = {
  milestone: DonationMilestone;
  current: number;
};

export const KOFI_URL = "https://ko-fi.com/Z8Z71T8QD4";

export const DONATION_MESSAGE =
  "One person builds BlurAutoClicker. If it's useful to you, even a couple of dollars helps pay for the next update.";

const DONATION_MILESTONES: readonly DonationMilestone[] = [
  { kind: "clicks", threshold: 1_000_000, label: "1 million clicks" },
  { kind: "clicks", threshold: 10_000_000, label: "10 million clicks" },
  { kind: "clicks", threshold: 100_000_000, label: "100 million clicks" },
  { kind: "time", threshold: 5 * 3600, label: "5 hours of clicking" },
  { kind: "time", threshold: 24 * 3600, label: "24 hours of clicking" },
  { kind: "time", threshold: 100 * 3600, label: "100 hours of clicking" },
];

function highestPending(
  kind: DonationMilestone["kind"],
  current: number,
  seen: number,
): DonationMilestone | null {
  const value = Number.isFinite(current) ? current : 0;
  let match: DonationMilestone | null = null;

  for (const milestone of DONATION_MILESTONES) {
    if (milestone.kind !== kind) continue;
    if (milestone.threshold > value) continue;
    if (milestone.threshold <= seen) continue;
    match = milestone;
  }

  return match;
}

export function nextDonationMilestone(input: {
  totalClicks: number;
  totalTimeSecs: number;
  clicksSeen: number;
  timeSeen: number;
}): DonationPrompt | null {
  const clicks = highestPending("clicks", input.totalClicks, input.clicksSeen);
  if (clicks) return { milestone: clicks, current: input.totalClicks };

  const time = highestPending("time", input.totalTimeSecs, input.timeSeen);
  if (time) return { milestone: time, current: input.totalTimeSecs };

  return null;
}

export function donationStat(prompt: DonationPrompt): string {
  const value = Number.isFinite(prompt.current)
    ? Math.max(0, prompt.current)
    : 0;

  if (prompt.milestone.kind === "clicks") {
    return `${Math.round(value).toLocaleString("en-US")} clicks recorded so far`;
  }

  const hours = value / 3600;
  return `${hours.toFixed(1)} hours of clicking recorded so far`;
}

export function milestonePatch(
  milestone: DonationMilestone,
): Partial<Settings> {
  return milestone.kind === "clicks"
    ? { donationClicksMilestone: milestone.threshold }
    : { donationTimeMilestone: milestone.threshold };
}
