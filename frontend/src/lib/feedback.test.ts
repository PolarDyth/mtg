import { describe, expect, it } from "vitest";
import { FEEDBACK_CATEGORIES, feedbackIssueUrl, REPO_ISSUES_URL } from "./feedback";

describe("feedbackIssueUrl", () => {
  it("builds a prefilled new-issue URL", () => {
    const url = feedbackIssueUrl({
      category: "Bug report",
      summary: "Life went negative",
      details: "Steps to reproduce:\n1. …",
    });
    expect(url.startsWith(`${REPO_ISSUES_URL}/new?`)).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("title")).toBe("Bug report: Life went negative");
    expect(params.get("body")).toContain("**Category:** Bug report");
    expect(params.get("body")).toContain("1. …");
    expect(params.get("body")).toContain("in-game feedback button");
  });

  it("falls back to a placeholder title and encodes query characters", () => {
    const url = feedbackIssueUrl({
      category: FEEDBACK_CATEGORIES[3],
      summary: "   ",
      details: "a&b=c?d#e",
    });
    const params = new URL(url).searchParams;
    expect(params.get("title")).toBe("Other: Feedback");
    expect(params.get("body")).toContain("a&b=c?d#e");
  });

  it("uses only the summary's first line and caps the title length", () => {
    const url = feedbackIssueUrl({
      category: "Feature idea",
      summary: `${"x".repeat(300)}\nsecond line`,
      details: "",
    });
    const title = new URL(url).searchParams.get("title") ?? "";
    expect(title.length).toBeLessThanOrEqual(120);
    expect(title).not.toContain("second");
    expect(new URL(url).searchParams.get("body")).toContain("_No details provided._");
  });
});
