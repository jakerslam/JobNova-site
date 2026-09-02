"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { JobDetailView } from "@/components/JobDetailView";
import { JobFitPanel } from "@/components/JobFitPanel";
import { useTemporaryLikes } from "@/hooks/useTemporaryLikes";
import type { Job, JobStatus } from "@/types/job";

type JobDetailClientProps = {
  jobs: Job[];
  job: Job;
};

const statuses: JobStatus[] = ["Matched", "Liked", "Applied"];

export function JobDetailClient({ jobs, job }: JobDetailClientProps) {
  const { likedJobIds, toggleLiked, hydrateBackendLikes } = useTemporaryLikes();
  const [backendStatusJobs, setBackendStatusJobs] = useState<Partial<Record<JobStatus, Job[]>>>({});
  const [hasPremium, setHasPremium] = useState(false);

  useEffect(() => {
    window.queueMicrotask(() => {
      setHasPremium(window.localStorage.getItem("jobnova:has-premium") === "true");
    });
  }, []);

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
        hydrateBackendLikes(payload.jobs.map((candidate) => candidate.id));
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
    const byId = new Map(jobs.map((candidate) => [candidate.id, candidate]));

    Object.values(backendStatusJobs).forEach((statusJobs) => {
      statusJobs?.forEach((candidate) => byId.set(candidate.id, candidate));
    });

    return Array.from(byId.values());
  }, [backendStatusJobs, jobs]);

  const counts = useMemo(
    () =>
      statuses.reduce(
        (acc, status) => {
          if (status === "Liked") {
            acc[status] = mergedJobs.filter((candidate) => likedJobIds.has(candidate.id)).length;
            return acc;
          }

          acc[status] = mergedJobs.filter((candidate) => candidate.status === status).length;
          return acc;
        },
        {} as Record<JobStatus, number>,
      ),
    [likedJobIds, mergedJobs],
  );

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
