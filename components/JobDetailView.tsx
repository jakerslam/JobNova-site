"use client";

import { ArrowLeft, Bot, BriefcaseBusiness, Building2, Check, Clock3, ExternalLink, Heart, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Job } from "@/types/job";

type JobDetailViewProps = {
  job: Job;
  isLiked: boolean;
  onToggleLiked: (jobId: string) => void;
};

export function JobDetailView({ job, isLiked, onToggleLiked }: JobDetailViewProps) {
  const [copied, setCopied] = useState(false);

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
    <article className="rounded-xl bg-white px-4 py-5 shadow-soft sm:px-7 sm:py-6">
      <div className="mb-5 flex items-center justify-between">
        <Link
          href={`/jobs/${job.status.toLowerCase()}`}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-200 px-4 text-[13px] font-medium text-ink"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back
        </Link>
        <p className="text-[12px] font-medium text-muted">Home page / Jobs / {job.title}</p>
      </div>

      <header className="flex flex-col gap-5 border-b border-zinc-100 pb-6 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full bg-white text-[47px] font-bold shadow-sm">
            {job.company === "Google" ? (
              <span className="text-[#4285f4]">G</span>
            ) : (
              <BriefcaseBusiness aria-hidden="true" className="h-9 w-9 text-violet" />
            )}
          </div>
          <div>
            <a
              href={job.indeedUrl}
              target="_blank"
              rel="noreferrer"
              className="block transition-colors hover:text-violet hover:underline"
            >
              <h1 className="text-[24px] font-semibold leading-tight text-ink sm:text-[30px]">{job.title}</h1>
            </a>
            <div className="mt-3 space-y-2 text-[13px] text-muted">
              <div className="flex flex-wrap items-center gap-1">
                <Building2 aria-hidden="true" className="h-4 w-4" />
                {job.companyLinkedInUrl ? (
                  <a
                    href={job.companyLinkedInUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted transition-colors hover:text-violet hover:underline"
                  >
                    {job.company}
                  </a>
                ) : (
                  <span>{job.company}</span>
                )}
              </div>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="inline-flex items-center gap-1">
                  <MapPin aria-hidden="true" className="h-4 w-4" />
                  {job.location}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 aria-hidden="true" className="h-4 w-4" />
                  {job.posted}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="grid h-[70px] w-[70px] place-items-center rounded-full border-[7px] border-lime-400 text-center">
            <div>
              <strong className="block text-[18px] leading-none">{job.match}%</strong>
              <span className="text-[10px] text-muted">Match</span>
            </div>
          </div>
          <button
            type="button"
            aria-label={isLiked ? "Unlike job" : "Like job"}
            onClick={() => onToggleLiked(job.id)}
            className="grid h-10 w-10 place-items-center rounded-full border border-zinc-200"
          >
            <Heart aria-hidden="true" className={`h-4 w-4 ${isLiked ? "fill-violet text-violet" : ""}`} />
          </button>
          <button
            type="button"
            aria-label={copied ? "Job link copied" : "Copy job link"}
            onClick={copyJobLink}
            className="grid h-10 w-10 place-items-center rounded-full border border-zinc-200"
          >
            {copied ? (
              <Check aria-hidden="true" className="h-4 w-4 text-violet" />
            ) : (
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      <section className="border-b border-zinc-100 py-5">
        <p className="text-[13px] leading-6 text-ink">{job.description}</p>
        <p className="mt-3 text-[13px] leading-6 text-ink">
          Job description Job description Job description Job description Job description Job description
          Job description Job description Job description Job description Job description Job description.
        </p>
      </section>

      <section className="my-6 rounded-2xl bg-acid p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-ink text-white">
            <Bot aria-hidden="true" className="h-5 w-5" />
          </div>
          <h2 className="text-[17px] font-semibold">Maximize your interview readiness</h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr_auto]">
          <div>
            <h3 className="text-[14px] font-semibold">Job-Specific Simulations:</h3>
            <p className="mt-2 text-[12px] leading-5">
              Practice with questions tailored to your target role, ensuring relevance and preparation.
            </p>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold">Boost Success Rates:</h3>
            <p className="mt-2 text-[12px] leading-5">
              Get targeted feedback and improve your answers before the real interview.
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
    </article>
  );
}
