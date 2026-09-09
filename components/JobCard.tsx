"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CompanyLogo } from "@/components/CompanyLogo";
import { LikeIcon, LinkGlyphIcon, LocationDotIcon, SignalIcon } from "@/components/JobCardIcons";
import { MatchRing } from "@/components/MatchRing";
import { getIndeedApplicationAction } from "@/services/indeedBackend";
import type { Job } from "@/types/job";

type JobCardProps = {
  job: Job;
  isSelected: boolean;
  isSaved: boolean;
  onToggleSaved: (jobId: string) => void;
  onApplyJob?: (job: Job) => Promise<void> | void;
  onRefreshStatus?: () => Promise<void> | void;
  isApplying?: boolean;
};

export function JobCard({
  job,
  isSelected,
  isSaved,
  onToggleSaved,
  onApplyJob,
  onRefreshStatus,
  isApplying = false,
}: JobCardProps) {
  const jobHref = job.isLiveIndeedJob
    ? `/jobs/${job.status.toLowerCase()}/live?applicationId=${encodeURIComponent(job.applicationId ?? job.id)}`
    : `/jobs/${job.status.toLowerCase()}/${job.id}`;
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  async function copyJobLink(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const url = job.isLiveIndeedJob ? job.indeedUrl : `${window.location.origin}${jobHref}`;

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

  function openJob() {
    router.push(jobHref);
  }

  function handleApply(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();

    if (isApplying || job.applicationStatus === "submitted") return;

    if (job.isLiveIndeedJob && onApplyJob && job.applicationId) {
      void onApplyJob(job);
      return;
    }

    router.push(jobHref);
  }

  const applyState = getApplyState(job, isApplying);
  const verificationUrl = job.manualQuestion ? undefined : getUsefulManualActionUrl(job);

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={openJob}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openJob();
        }
      }}
      className={`min-h-[252px] cursor-pointer rounded-[13px] bg-white px-4 py-0 shadow-soft transition-shadow hover:shadow-lg sm:px-4 ${
        isSelected ? "ring-2 ring-violet" : "ring-1 ring-transparent"
      }`}
    >
      <div className="grid min-h-[124px] grid-cols-[92px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 py-4 sm:grid-cols-[108px_minmax(0,1fr)] sm:gap-x-1 sm:py-0">
        <div
          aria-label={`${job.match}% match`}
          className="grid h-[92px] w-[92px] shrink-0 place-items-center sm:h-[108px] sm:w-[108px]"
        >
          <MatchRing match={job.match} />
        </div>

        <div className="min-w-0 self-center">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <a
                href={job.indeedUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="block max-w-[calc(100%-16px)] text-left transition-colors hover:text-violet hover:underline"
              >
                <h2 className="text-[22px] font-semibold leading-[28px] tracking-[-0.02em] text-ink sm:text-[24.8px] sm:leading-[32.35px]">
                  {job.title}
                </h2>
              </a>
            </div>

            <div className="flex shrink-0 gap-3 text-ink">
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

        <div className="col-span-2 min-w-0 text-[13px] leading-5 sm:col-span-1 sm:col-start-2 sm:mt-[-16px]">
          <div className="flex min-w-0 items-center gap-1.5">
            {job.companyLogoUrl ? (
              <CompanyLogo
                company={job.company}
                logoUrl={job.companyLogoUrl}
                className="h-[18px] w-[18px]"
                imageClassName="h-[14px] w-[14px]"
                fallbackClassName="h-3 w-3"
              />
            ) : null}
            {job.companyLinkedInUrl ? (
              <a
                href={job.companyLinkedInUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex min-w-0 max-w-full items-center truncate font-normal text-zinc-400 transition-colors hover:text-violet hover:underline"
              >
                {job.company}
              </a>
            ) : (
              <span className="block min-w-0 truncate font-normal text-zinc-400">{job.company}</span>
            )}
          </div>
          <p className="mt-[2px] flex min-h-5 flex-wrap items-center gap-x-[7px] gap-y-1 text-[13px] font-normal leading-5 text-ink">
            <LocationDotIcon className="h-4 w-[11px] shrink-0" />
            <span className="leading-5">{job.location}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-violet" />
            <SignalIcon className="h-[13px] w-[13px] shrink-0" />
            <span className="leading-5">{job.workplace}</span>
          </p>
        </div>
      </div>

      <div className="flex min-h-[59px] flex-wrap content-start items-start gap-2 border-t border-zinc-100 py-3">
        {[...job.skills, job.seniority, job.salary].map((label) => (
          <span key={label} className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-normal text-ink">
            {label}
          </span>
        ))}
      </div>

      <div className="flex min-h-[59px] flex-col justify-center gap-3 border-t border-zinc-100 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] font-normal text-ink">
          <span className="rounded-full bg-violet/15 px-3 py-1 text-violet">{job.posted}</span>
          <span>{job.applicants} applicants</span>
        </p>
        <div className="grid grid-cols-[minmax(96px,1fr)_minmax(150px,1.3fr)] gap-2 sm:flex sm:shrink-0">
          <button
            type="button"
            onClick={handleApply}
            disabled={applyState.disabled}
            className={`grid h-9 place-items-center rounded-full border px-6 text-[13px] font-medium transition-shadow hover:shadow-md disabled:cursor-default disabled:hover:shadow-none ${applyState.className}`}
          >
            {applyState.label}
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
      {job.isLiveIndeedJob && job.applicationStatus && job.applicationStatus !== "pending" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 py-2 text-[12px] font-medium text-muted">
          <span>
            <span className="text-ink">Application status:</span> {formatApplicationStatus(job)}
          </span>
          {verificationUrl ? (
            <a
              href={verificationUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex h-7 items-center gap-1 rounded-full bg-ink px-3 text-[11px] font-medium text-white transition-shadow hover:shadow-md"
            >
              Continue in Indeed
              <LinkGlyphIcon className="h-3.5 w-3.5 [&_path]:stroke-white" />
            </a>
          ) : null}
          {job.applicationStatus === "manual_action_required" && onRefreshStatus ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void onRefreshStatus();
              }}
              className="inline-flex h-7 items-center rounded-full border border-zinc-200 bg-white px-3 text-[11px] font-medium text-ink transition-shadow hover:shadow-md"
            >
              Refresh status
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function getApplyState(job: Job, isApplying: boolean) {
  const action = getIndeedApplicationAction(job, isApplying);

  if (action === "queued") {
    return {
      label: "Queued",
      disabled: true,
      className: "border-violet bg-violet/10 text-violet",
    };
  }

  if (action === "opening") {
    return {
      label: "Opening",
      disabled: true,
      className: "border-violet bg-violet/10 text-violet",
    };
  }

  if (action === "applying") {
    return {
      label: "Applying",
      disabled: true,
      className: "border-violet bg-violet/10 text-violet",
    };
  }

  if (action === "applied") {
    return {
      label: "Applied",
      disabled: true,
      className: "border-acid bg-acid text-ink",
    };
  }

  if (action === "finish") {
    return {
      label: "Finish",
      disabled: false,
      className: "border-violet bg-violet text-white",
    };
  }

  if (action === "unsupported") {
    return {
      label: "Unsupported",
      disabled: true,
      className: "border-zinc-200 bg-zinc-100 text-muted",
    };
  }

  if (action === "retry") {
    return {
      label: "Retry",
      disabled: false,
      className: "border-zinc-200 bg-white text-ink",
    };
  }

  return {
    label: "Apply",
    disabled: false,
    className: "border-zinc-200 bg-white text-ink",
  };
}

function formatApplicationStatus(job: Job) {
  if (job.applicationStatus === "in_progress") {
    if (job.applicationLastStep === "queued_for_companion") return "Queued for automatic application";
    if (job.applicationLastStep === "leased_by_companion") return "Opening authenticated Indeed session";
    if (job.applicationLastStep?.startsWith("profile_fields_filled")) return "Profile completed; continuing application";
    return "Applying automatically in Indeed";
  }

  if (job.applicationStatus === "manual_action_required") {
    if (job.manualActionReason === "captcha" && job.applicationLastStep === "manual_checkpoint_before_apply") {
      return "Waiting for trusted Chrome session";
    }

    return `Waiting for ${formatManualReason(job.manualActionReason)}`;
  }

  if (job.applicationStatus === "submitted") return "Application finished";
  if (job.applicationStatus === "failed") return job.applicationFailureReason ?? "Failed";
  if (job.applicationStatus === "skipped") {
    if (job.applicationLastStep === "apply_button_not_found") return "Application page was not recognized; retry available";
    if (job.applicationLastStep === "external_application") return "Unsupported: external employer application";
    if (job.applicationLastStep === "invalid_job_metadata") return "Unsupported: invalid job posting";
    return job.applicationFailureReason ?? "Skipped";
  }

  return job.applicationStatus?.replaceAll("_", " ") ?? "pending";
}

function formatManualReason(reason?: string) {
  if (reason === "captcha") return "CAPTCHA";
  if (reason === "sms") return "SMS code";
  if (reason === "email") return "email verification";
  if (reason === "login") return "Indeed login";
  if (reason === "unknown_field") return "profile answer";
  if (reason === "review_required") return "review";
  return "manual step";
}

function getUsefulManualActionUrl(job: Job) {
  if (!job.manualActionUrl) return undefined;

  try {
    const manualUrl = new URL(job.manualActionUrl);
    const jobUrl = new URL(job.indeedUrl);
    const sameJobPosting =
      manualUrl.hostname === jobUrl.hostname &&
      manualUrl.pathname === jobUrl.pathname &&
      manualUrl.searchParams.get("jk") === jobUrl.searchParams.get("jk");

    if (sameJobPosting) {
      return undefined;
    }
  } catch {
    return job.manualActionUrl;
  }

  return job.manualActionUrl;
}
