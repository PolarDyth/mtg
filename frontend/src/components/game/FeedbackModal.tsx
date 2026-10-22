"use client";

/**
 * Player feedback — the app has no backend, so this hands off to the
 * project's GitHub issue tracker: the fields prefill a new issue that opens
 * in a new tab. Same shell as ShortcutsModal (backdrop click closes).
 */

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import {
  FEEDBACK_CATEGORIES,
  feedbackIssueUrl,
  REPO_ISSUES_URL,
  type FeedbackCategory,
} from "@/lib/feedback";

export default function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory>(FEEDBACK_CATEGORIES[0]);
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");

  const submit = () => {
    window.open(feedbackIssueUrl({ category, summary, details }), "_blank", "noopener");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold text-zinc-100">
            <MessageSquarePlus className="h-4 w-4" strokeWidth={1.75} />
            Send feedback
          </h2>
          <button
            onClick={onClose}
            aria-label="Close feedback"
            className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            ✕
          </button>
        </header>

        <div className="p-5">
          <p className="text-xs leading-relaxed text-zinc-500">
            Opens a prefilled issue on the project&apos;s GitHub tracker in a new
            tab — nothing is sent anywhere else.
          </p>

          <label className="mt-4 block text-sm font-medium text-zinc-300">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
              className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-600"
            >
              {FEEDBACK_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-sm font-medium text-zinc-300">
            Summary
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One line — what happened, or what you'd like"
              maxLength={120}
              className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-600"
            />
          </label>

          <label className="mt-3 block text-sm font-medium text-zinc-300">
            Details <span className="font-normal text-zinc-600">(optional)</span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder={
                "For bugs: what you did, what you expected, what happened.\nFor ideas: the problem you're trying to solve at the table."
              }
              className="mt-1.5 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-600"
            />
          </label>

          <div className="mt-4 flex items-center justify-between gap-3">
            <a
              href={REPO_ISSUES_URL}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-500 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-emerald-300"
            >
              Browse existing issues
            </a>
            <button
              onClick={submit}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            >
              Open GitHub issue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
