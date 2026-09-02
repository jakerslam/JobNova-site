"use client";

import { useMemo } from "react";
import { BriefcaseBusiness } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { FeedActionToolbar } from "@/components/FeedActionToolbar";
import { InterviewPanel } from "@/components/InterviewPanel";
import { JobCard } from "@/components/JobCard";
import { useJobCollections } from "@/hooks/useJobCollections";
import type { Job, JobStatus } from "@/types/job";

type DashboardClientProps = {
  jobs: Job[];
  initialStatus: JobStatus;
};

export function DashboardClient({ jobs, initialStatus }: DashboardClientProps) {
  const { counts, likedJobIds, mergedJobs, toggleLiked } = useJobCollections(jobs);

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
      <FeedActionToolbar />

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
