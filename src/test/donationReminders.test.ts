import { describe, expect, it } from "vitest";
import {
  donationStat,
  milestonePatch,
  nextDonationMilestone,
} from "../donationReminders";

const base = { totalClicks: 0, totalTimeSecs: 0, clicksSeen: 0, timeSeen: 0 };

describe("nextDonationMilestone", () => {
  it("stays quiet below the first milestone", () => {
    expect(nextDonationMilestone({ ...base, totalClicks: 999_999 })).toBeNull();
    expect(
      nextDonationMilestone({ ...base, totalTimeSecs: 5 * 3600 - 1 }),
    ).toBeNull();
  });

  it("fires exactly on a threshold", () => {
    const hit = nextDonationMilestone({ ...base, totalClicks: 1_000_000 });
    expect(hit?.milestone.label).toBe("1 million clicks");
    expect(hit?.milestone.threshold).toBe(1_000_000);
  });

  it("shows the highest reached instead of a backlog", () => {
    const hit = nextDonationMilestone({ ...base, totalClicks: 50_000_000 });
    expect(hit?.milestone.label).toBe("10 million clicks");
  });

  it("moves on once the last one was acknowledged", () => {
    const hit = nextDonationMilestone({
      ...base,
      totalClicks: 10_000_000,
      clicksSeen: 1_000_000,
    });
    expect(hit?.milestone.label).toBe("10 million clicks");
  });

  it("says nothing when everything reached is acknowledged", () => {
    expect(
      nextDonationMilestone({
        ...base,
        totalClicks: 10_000_000,
        clicksSeen: 10_000_000,
      }),
    ).toBeNull();
  });

  it("covers time milestones", () => {
    const hit = nextDonationMilestone({
      ...base,
      totalTimeSecs: 24 * 3600,
      timeSeen: 5 * 3600,
    });
    expect(hit?.milestone.label).toBe("24 hours of clicking");
  });

  it("prefers clicks when both are pending", () => {
    const hit = nextDonationMilestone({
      ...base,
      totalClicks: 1_000_000,
      totalTimeSecs: 100 * 3600,
    });
    expect(hit?.milestone.kind).toBe("clicks");
  });

  it("ignores broken totals", () => {
    expect(
      nextDonationMilestone({
        ...base,
        totalClicks: Number.NaN,
        totalTimeSecs: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
  });
});

describe("donation copy and acknowledgement", () => {
  const milestone = {
    kind: "clicks" as const,
    threshold: 1_000_000,
    label: "1 million clicks",
  };

  it("only writes the matching field", () => {
    expect(milestonePatch(milestone)).toEqual({
      donationClicksMilestone: 1_000_000,
    });
    expect(
      milestonePatch({
        kind: "time",
        threshold: 3600,
        label: "1 hour of clicking",
      }),
    ).toEqual({ donationTimeMilestone: 3600 });
  });
});

describe("donationStat", () => {
  it("counts clicks with thousands separators", () => {
    expect(
      donationStat({
        milestone: {
          kind: "clicks",
          threshold: 1_000_000,
          label: "1 million clicks",
        },
        current: 1_247_301,
      }),
    ).toBe("1,247,301 clicks recorded so far");
  });

  it("reports hours for time milestones", () => {
    expect(
      donationStat({
        milestone: {
          kind: "time",
          threshold: 24 * 3600,
          label: "24 hours of clicking",
        },
        current: 24.5 * 3600,
      }),
    ).toBe("24.5 hours of clicking recorded so far");
  });

  it("survives broken totals", () => {
    expect(
      donationStat({
        milestone: {
          kind: "clicks",
          threshold: 1_000_000,
          label: "1 million clicks",
        },
        current: Number.NaN,
      }),
    ).toBe("0 clicks recorded so far");
  });
});
