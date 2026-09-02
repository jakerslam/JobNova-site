"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness } from "lucide-react";
import { ChangePreferenceIcon } from "@/components/ChangePreferenceIcon";
import { DashboardShell } from "@/components/DashboardShell";
import { InterviewPanel } from "@/components/InterviewPanel";
import { JobCard } from "@/components/JobCard";
import { TopMatchedIcon } from "@/components/TopMatchedIcon";
import { useTemporaryLikes } from "@/hooks/useTemporaryLikes";
import type { Job, JobStatus } from "@/types/job";

type DashboardClientProps = {
  jobs: Job[];
  initialStatus: JobStatus;
};

const statuses: JobStatus[] = ["Matched", "Liked", "Applied"];

export function DashboardClient({ jobs, initialStatus }: DashboardClientProps) {
  const { likedJobIds, toggleLiked, hydrateBackendLikes } = useTemporaryLikes();
  const [backendStatusJobs, setBackendStatusJobs] = useState<Partial<Record<JobStatus, Job[]>>>({});

  useEffect(() => {
    let isMounted = true;

    async function fetchStatusJobs() {
      const [likedResponse, appliedResponse] = await Promise.allSettled([
        fetch("/api/jobs?status=Liked"),
        fetch("/api/jobs?status=Applied"),
      ]);

      if (!isMounted) {
        return;
      }

      const nextStatusJobs: Partial<Record<JobStatus, Job[]>> = {};

      if (likedResponse.status === "fulfilled" && likedResponse.value.ok) {
        const payload = (await likedResponse.value.json()) as { jobs: Job[] };
        nextStatusJobs.Liked = payload.jobs;
        hydrateBackendLikes(payload.jobs.map((job) => job.id));
      }

      if (appliedResponse.status === "fulfilled" && appliedResponse.value.ok) {
        const payload = (await appliedResponse.value.json()) as { jobs: Job[] };
        nextStatusJobs.Applied = payload.jobs;
      }

      setBackendStatusJobs(nextStatusJobs);
    }

    void fetchStatusJobs();

    return () => {
      isMounted = false;
    };
  }, [hydrateBackendLikes]);

  const mergedJobs = useMemo(() => {
    const byId = new Map(jobs.map((job) => [job.id, job]));

    Object.values(backendStatusJobs).forEach((statusJobs) => {
      statusJobs?.forEach((job) => byId.set(job.id, job));
    });

    return Array.from(byId.values());
  }, [backendStatusJobs, jobs]);

  const counts = useMemo(
    () =>
      statuses.reduce(
        (acc, status) => {
          if (status === "Liked") {
            acc[status] = mergedJobs.filter((job) => likedJobIds.has(job.id)).length;
            return acc;
          }

          acc[status] = mergedJobs.filter((job) => job.status === status).length;
          return acc;
        },
        {} as Record<JobStatus, number>,
      ),
    [likedJobIds, mergedJobs],
  );

  const visibleJobs = useMemo(() => {
    if (initialStatus === "Liked") {
      return mergedJobs.filter((job) => likedJobIds.has(job.id));
    }

    const filtered = mergedJobs.filter((job) => job.status === initialStatus);
    return filtered.length ? filtered : mergedJobs.filter((job) => job.status === "Matched");
  }, [initialStatus, likedJobIds, mergedJobs]);

  return (
    <DashboardShell
      activeStatus={initialStatus}
      counts={counts}
      mobileTitle="JobNova Jobs"
      rightPanel={<InterviewPanel />}
    >
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-full bg-violet px-4 text-[12px] font-medium text-white shadow-sm transition-shadow hover:shadow-md lg:text-[13px]"
        >
          <ChangePreferenceIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">Change Job Preference</span>
        </button>

        <button
          type="button"
          className="hidden h-8 shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-[12px] font-medium text-ink shadow-[0_4px_0_rgba(31,41,55,0.06),0_10px_18px_rgba(31,41,55,0.08)] transition-shadow hover:shadow-[0_5px_0_rgba(31,41,55,0.07),0_13px_22px_rgba(31,41,55,0.1)] sm:flex"
        >
          <TopMatchedIcon className="h-4 w-4" />
          Top matched
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between px-1 lg:hidden">
        <div>
          <p className="text-[12px] font-medium text-muted">Home page / Jobs {visibleJobs.length}</p>
          <h1 className="mt-1 text-[22px] font-semibold text-ink">{initialStatus} roles</h1>
        </div>
        <BriefcaseBusiness className="h-6 w-6 text-violet" />
      </div>

      <div className="space-y-4 sm:space-y-5">
        {visibleJobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            isSelected={false}
            isSaved={likedJobIds.has(job.id)}
            onToggleSaved={toggleLiked}
          />
        ))}
      </div>
    </DashboardShell>
  );
}
