"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { JobDetailView } from "@/components/JobDetailView";
import { JobFitPanel } from "@/components/JobFitPanel";
import { useJobCollections } from "@/hooks/useJobCollections";
import type { Job } from "@/types/job";

type JobDetailClientProps = {
  jobs: Job[];
  job: Job;
};

export function JobDetailClient({ jobs, job }: JobDetailClientProps) {
  const { counts, likedJobIds, toggleLiked } = useJobCollections(jobs);
  const [hasPremium, setHasPremium] = useState(false);

  useEffect(() => {
    window.queueMicrotask(() => {
      setHasPremium(window.localStorage.getItem("jobnova:has-premium") === "true");
    });
  }, []);

  return (
    <DashboardShell
      activeStatus={job.status}
      counts={counts}
      mobileTitle="Job Detail"
      rightPanel={<JobFitPanel job={job} hasPremium={hasPremium} />}
    >
      <JobDetailView job={job} isLiked={likedJobIds.has(job.id)} onToggleLiked={toggleLiked} />
    </DashboardShell>
  );
}
