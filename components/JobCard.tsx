"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LikeIcon, LinkGlyphIcon, LocationDotIcon, SignalIcon } from "@/components/JobCardIcons";
import { MatchRing } from "@/components/MatchRing";
import type { Job } from "@/types/job";

type JobCardProps = {
  job: Job;
  isSelected: boolean;
  isSaved: boolean;
  onToggleSaved: (jobId: string) => void;
};

export function JobCard({ job, isSelected, isSaved, onToggleSaved }: JobCardProps) {
  const jobHref = `/jobs/${job.status.toLowerCase()}/${job.id}`;
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  async function copyJobLink(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const url = `${window.location.origin}${jobHref}`;

    try {
      await window.navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function handleToggleSaved(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onToggleSaved(job.id);
  }

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={() => router.push(jobHref)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(jobHref);
        }
      }}
      className={`min-h-[252px] cursor-pointer rounded-[13px] bg-white px-4 py-0 shadow-soft transition-shadow hover:shadow-lg sm:px-4 ${
        isSelected ? "ring-2 ring-violet" : "ring-1 ring-transparent"
      }`}
    >
      <div className="flex min-h-[124px] items-center gap-1">
        <div
          aria-label={`${job.match}% match`}
          className="grid h-[108px] w-[108px] shrink-0 place-items-center"
        >
          <MatchRing match={job.match} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <a
                href={job.indeedUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="block max-w-[314px] text-left transition-colors hover:text-violet hover:underline"
              >
                <h2 className="text-[24.8px] font-semibold leading-[32.35px] tracking-[-0.02em] text-ink">
                  {job.title}
                </h2>
              </a>
              <div className="mt-[2px] text-[13px] leading-5">
                {job.companyLinkedInUrl ? (
                  <a
                    href={job.companyLinkedInUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex w-fit items-center font-normal text-zinc-400 transition-colors hover:text-violet hover:underline"
                  >
                    {job.company}
                  </a>
                ) : (
                  <span className="block font-normal text-zinc-400">{job.company}</span>
                )}
                <p className="mt-[2px] flex min-h-5 flex-wrap items-center gap-x-[7px] gap-y-1 text-[13px] font-normal leading-5 text-ink">
                  <LocationDotIcon className="h-4 w-[11px] shrink-0" />
                  <span className="leading-5">{job.location}</span>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-violet" />
                  <SignalIcon className="h-[13px] w-[13px] shrink-0" />
                  <span className="leading-5">{job.workplace}</span>
                </p>
              </div>
            </div>

            <div className="flex gap-3 text-ink">
              <button
                type="button"
                aria-label={copied ? "Job link copied" : "Copy job link"}
                onClick={copyJobLink}
                className="rounded-full p-1 hover:bg-zinc-100"
              >
                {copied ? (
                  <Check aria-hidden="true" className="h-4 w-4 text-violet" />
                ) : (
                  <LinkGlyphIcon className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                aria-label={isSaved ? "Unsave job" : "Save job"}
                onClick={handleToggleSaved}
                className="rounded-full p-1 hover:bg-zinc-100"
              >
                <LikeIcon className="h-[17px] w-5" isFilled={isSaved} />
              </button>
            </div>
          </div>

        </div>
      </div>

      <div className="flex min-h-[59px] flex-wrap content-start items-start gap-2 border-t border-zinc-100 py-3">
        {[...job.skills, job.seniority, job.salary].map((label) => (
          <span key={label} className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-normal text-ink">
            {label}
          </span>
        ))}
      </div>

      <div className="flex min-h-[59px] items-center justify-between gap-4 border-t border-zinc-100">
        <p className="text-[12px] font-normal text-ink">
          <span className="rounded-full bg-violet/15 px-3 py-1 text-violet">{job.posted}</span>
          <span className="ml-3">{job.applicants} applicants</span>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              router.push(jobHref);
            }}
            className="grid h-9 place-items-center rounded-full border border-zinc-200 px-6 text-[13px] font-medium"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            className="h-9 rounded-full bg-acid px-4 text-[13px] font-semibold text-ink sm:px-6"
          >
            Mock Interview
          </button>
        </div>
      </div>
    </article>
  );
}
