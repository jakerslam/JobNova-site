"use client";

import {
  ArrowLeft,
  Bot,
  BriefcaseBusiness,
  BriefcaseBusinessIcon,
  Building2,
  Check,
  Clock3,
  ExternalLink,
  Heart,
  MapPin,
  Radio,
  Signal,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MatchRing } from "@/components/MatchRing";
import type { Job } from "@/types/job";

type JobDetailViewProps = {
  job: Job;
  isLiked: boolean;
  onToggleLiked: (jobId: string) => void;
};

export function JobDetailView({ job, isLiked, onToggleLiked }: JobDetailViewProps) {
  const [copied, setCopied] = useState(false);
  const locationParts = job.location.includes(",")
    ? job.location.split(",").map((part) => part.trim()).filter(Boolean)
    : [job.location];
  const cityLabel = locationParts.length > 1 ? locationParts.slice(0, 2).join(", ") : job.location;

  async function copyJobLink() {
    const url = `${window.location.origin}/jobs/${job.status.toLowerCase()}/${job.id}`;

    try {
      await window.navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article>
      <div className="mb-[22px] flex h-10 items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link
            href={`/jobs/${job.status.toLowerCase()}`}
            className="inline-flex h-8 w-12 items-center justify-center rounded-full bg-white text-ink shadow-sm transition-shadow hover:shadow-md"
            aria-label="Back to jobs"
          >
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </Link>
          <div className="inline-flex h-8 items-center rounded-full bg-violet px-4 text-[13px] font-medium text-white">
            {job.applicants} applicants
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label={copied ? "Job link copied" : "Copy job link"}
            onClick={copyJobLink}
            className="grid h-9 w-9 place-items-center rounded-full text-ink transition-shadow hover:shadow-sm"
          >
            {copied ? (
              <Check aria-hidden="true" className="h-4 w-4 text-violet" />
            ) : (
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            aria-label={isLiked ? "Unlike job" : "Like job"}
            onClick={() => onToggleLiked(job.id)}
            className="grid h-9 w-9 place-items-center rounded-full text-ink transition-shadow hover:shadow-sm"
          >
            <Heart aria-hidden="true" className={`h-5 w-5 ${isLiked ? "fill-violet text-violet" : ""}`} />
          </button>
          <a
            href={job.indeedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-black px-5 text-[14px] font-medium text-white"
          >
            Apply Now
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="rounded-xl bg-white px-4 py-5 shadow-soft sm:px-6 sm:py-6">
        <header className="flex flex-col gap-5 border-b border-zinc-100 pb-5 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-5">
            <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full bg-white text-[47px] font-bold leading-none">
              {job.company === "Google" ? (
                <span className="text-[#4285f4]">G</span>
              ) : (
                <BriefcaseBusiness aria-hidden="true" className="h-9 w-9 text-violet" />
              )}
            </div>
            <div className="min-w-0">
              <div className="mb-1 w-fit rounded-full bg-violet/15 px-4 py-1 text-[12px] font-medium leading-5 text-violet">
                {job.posted}
              </div>
              <a
                href={job.indeedUrl}
                target="_blank"
                rel="noreferrer"
                className="block transition-colors hover:text-violet hover:underline"
              >
                <h1 className="text-[22px] font-semibold leading-[28px] tracking-[-0.02em] text-ink">{job.title}</h1>
              </a>
              <div className="mt-[2px] text-[13px] leading-5">
                {job.companyLinkedInUrl ? (
                  <a
                    href={job.companyLinkedInUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-400 transition-colors hover:text-violet hover:underline"
                  >
                    Company name
                  </a>
                ) : (
                  <span className="text-zinc-400">Company name</span>
                )}
                <p className="mt-[3px] flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-normal text-ink">
                  <MapPin aria-hidden="true" className="h-[14px] w-[14px] shrink-0" />
                  <span>{cityLabel}</span>
                  <span className="h-1 w-1 rounded-full bg-violet" />
                  <span>{job.posted.replace("hours", "days").replace("hour", "day")}</span>
                  <span className="h-1 w-1 rounded-full bg-violet" />
                  <Signal aria-hidden="true" className="h-[13px] w-[13px]" />
                  <span>{job.workplace}</span>
                </p>
              </div>
            </div>
          </div>

          <MatchRing match={job.match} sizeClassName="h-[70px] w-[70px]" paddingClassName="p-[5px]" />
        </header>

        <section className="grid gap-x-14 gap-y-3 border-b border-zinc-100 py-5 text-[13px] font-normal text-muted sm:grid-cols-2 lg:grid-cols-3">
          <span className="inline-flex items-center gap-2">
            <MapPin aria-hidden="true" className="h-4 w-4" />
            United States
          </span>
          <span className="inline-flex items-center gap-2">
            <BriefcaseBusinessIcon aria-hidden="true" className="h-4 w-4" />
            Internship
          </span>
          <span className="inline-flex items-center gap-2">
            <Radio aria-hidden="true" className="h-4 w-4" />
            {job.workplace}
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock3 aria-hidden="true" className="h-4 w-4" />
            {job.skills.find((skill) => skill.includes("years")) ?? "5+ years exp"}
          </span>
          <span className="inline-flex items-center gap-2">
            <Building2 aria-hidden="true" className="h-4 w-4" />
            {job.salary}
          </span>
          <span className="inline-flex items-center gap-2">
            <Signal aria-hidden="true" className="h-4 w-4" />
            {job.seniority}
          </span>
        </section>

        <section className="border-b border-zinc-100 py-5">
          <p className="text-[13px] leading-6 text-ink">{job.description}</p>
          <p className="mt-3 text-[13px] leading-6 text-ink">
            Job description Job description Job description Job description Job description Job description
            Job description Job description Job description Job description Job description Job description.
          </p>
        </section>

        <section className="my-6 rounded-[16px] bg-acid px-5 py-6 sm:px-6">
          <div className="flex flex-col gap-4 border-b border-black/10 pb-5 sm:flex-row sm:items-center">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-ink">
              <Bot aria-hidden="true" className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">Maximize your interview success</h2>
              <p className="mt-2 max-w-[520px] text-[13px] leading-5 text-ink/60">
                Our platform simulates real interview scenarios, helping you refine your responses and boost your confidence.
              </p>
            </div>
          </div>
          <div className="grid gap-5 pt-5 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <div>
              <h3 className="text-[14px] font-semibold text-ink">Job-Specific Simulations:</h3>
              <p className="mt-2 text-[13px] leading-5 text-ink/65">
                Practice with questions tailored to your target role, ensuring relevance and preparation.
              </p>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-ink">Actionable Feedback</h3>
              <p className="mt-2 text-[13px] leading-5 text-ink/65">
                Get detailed analysis of your responses and practical, step-by-step improvement suggestions.
              </p>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-ink">Boost Success Rates:</h3>
              <p className="mt-2 text-[13px] leading-5 text-ink/65">
                Perfect your interview skills and increase your chances of landing the job you want.
              </p>
            </div>
            <button type="button" className="flex h-11 items-center justify-center self-end rounded-full bg-ink px-5 text-[12px] font-semibold text-white">
              Start Interview
            </button>
          </div>
        </section>

        <div className="space-y-7">
          <section>
            <h2 className="mb-2 text-[18px] font-semibold">Qualification</h2>
            <p className="text-[13px] text-muted">Discover how your skills align with the required skills for the role.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {job.skills.map((skill) => (
                <span key={skill} className="rounded-full bg-zinc-100 px-3 py-1 text-[12px] text-ink">
                  {skill}
                </span>
              ))}
            </div>
          </section>

        <section>
          <h2 className="mb-3 text-[18px] font-semibold">Required</h2>
          <ul className="list-disc space-y-2 pl-5 text-[13px] leading-6 text-ink">
            {job.requirements.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-[18px] font-semibold">Responsibilities</h2>
          <ul className="list-disc space-y-2 pl-5 text-[13px] leading-6 text-ink">
            <li>Collaborate with cross-functional partners to ship reliable product experiences.</li>
            <li>Translate product requirements and user feedback into maintainable implementation plans.</li>
            <li>Improve application quality through testing, accessibility, and performance-minded delivery.</li>
            <li>Document technical decisions and communicate progress clearly with stakeholders.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-[18px] font-semibold">Benefits</h2>
          <ul className="list-disc space-y-2 pl-5 text-[13px] leading-6 text-ink">
            <li>Competitive salary and growth opportunities.</li>
            <li>Collaborative team culture with mentorship and learning support.</li>
            <li>Flexible work practices aligned with the role and team needs.</li>
          </ul>
        </section>

        <section className="rounded-xl border border-zinc-100 p-5">
          <h2 className="mb-4 text-[18px] font-semibold">Company</h2>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-zinc-100 text-[26px] font-bold">
              {job.company.charAt(0)}
            </div>
            <div>
              <h3 className="text-[15px] font-semibold">{job.company}</h3>
              <p className="text-[12px] text-muted">{job.funding} · Technology · United States</p>
            </div>
          </div>
        </section>
      </div>
      </div>
    </article>
  );
}
