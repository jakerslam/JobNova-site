"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { ManualQuestionCheckpoint } from "@/hooks/useIndeedApply";

type ApplicationQuestionModalProps = {
  checkpoint?: ManualQuestionCheckpoint;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
};

export function ApplicationQuestionModal({
  checkpoint,
  isSubmitting,
  onClose,
  onSubmit,
}: ApplicationQuestionModalProps) {
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string>();

  if (!checkpoint) return null;

  const { question } = checkpoint;
  const options = question.options ?? (question.type === "boolean" ? ["Yes", "No"] : []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!answer.trim() || isSubmitting) return;

    setError(undefined);
    try {
      await onSubmit(answer.trim());
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/35 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-question-title"
        className="w-full max-w-[520px] overflow-hidden rounded-lg bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-violet">Indeed application</p>
            <h2 id="application-question-title" className="mt-1 text-[19px] font-semibold leading-6 text-ink">
              One answer needed
            </h2>
            <p className="mt-1 truncate text-[12px] text-muted">{checkpoint.jobTitle}</p>
          </div>
          <button
            type="button"
            aria-label="Close application question"
            onClick={onClose}
            disabled={isSubmitting}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink transition-shadow hover:shadow-md disabled:opacity-50"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="px-5 py-5 sm:px-6">
          <fieldset disabled={isSubmitting}>
            <legend className="text-[15px] font-medium leading-6 text-ink">{question.label}</legend>

            {options.length ? (
              <div className="mt-4 grid gap-2">
                {options.map((option) => (
                  <label
                    key={option}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-4 py-2.5 text-[14px] transition-shadow hover:shadow-sm ${
                      answer === option ? "border-violet bg-violet/10 text-ink" : "border-zinc-200 bg-white text-ink"
                    }`}
                  >
                    <input
                      type="radio"
                      name="application-answer"
                      value={option}
                      checked={answer === option}
                      onChange={() => setAnswer(option)}
                      className="h-4 w-4 accent-violet"
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                required={question.required}
                rows={4}
                autoFocus
                className="mt-4 w-full resize-y rounded-md border border-zinc-200 px-3 py-2.5 text-[14px] leading-5 text-ink outline-none ring-violet focus:ring-2"
              />
            )}
          </fieldset>

          {error ? <p className="mt-3 text-[12px] font-medium text-red-600">{error}</p> : null}

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-10 rounded-full border border-zinc-200 bg-white px-5 text-[13px] font-medium text-ink transition-shadow hover:shadow-md disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!answer.trim() || isSubmitting}
              className="h-10 rounded-full bg-ink px-5 text-[13px] font-medium text-white transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting ? "Resuming..." : "Answer & continue"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
