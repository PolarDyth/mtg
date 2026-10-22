/**
 * Player feedback handoff — the app has no backend (no accounts, no server
 * HTTP), so the feedback modal deep-links to a prefilled new issue on the
 * project's GitHub tracker.
 */

export const REPO_ISSUES_URL = "https://github.com/PolarDyth/mtg/issues";

export const FEEDBACK_CATEGORIES = [
  "Bug report",
  "Feature idea",
  "Playtest feedback",
  "Other",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
}

/** Build the GitHub "new issue" URL with the feedback prefilled as
 *  `?title=…&body=…`. Pure — returns an absolute https URL. */
export function feedbackIssueUrl(input: {
  category: FeedbackCategory;
  summary: string;
  details: string;
}): string {
  const title = `${input.category}: ${firstLine(input.summary) || "Feedback"}`.slice(0, 120);
  const body = [
    `**Category:** ${input.category}`,
    "",
    input.details.trim() || "_No details provided._",
    "",
    "---",
    "Sent from the in-game feedback button.",
  ].join("\n");
  return `${REPO_ISSUES_URL}/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
