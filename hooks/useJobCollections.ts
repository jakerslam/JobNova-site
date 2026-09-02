"use client";

import { useEffect, useMemo, useState } from "react";
import { useTemporaryLikes } from "@/hooks/useTemporaryLikes";
import { withBasePath } from "@/services/sitePath";
import type { Job, JobStatus } from "@/types/job";

const statuses: JobStatus[] = ["Matched", "Liked", "Applied"];

type JobCollections = {
  counts: Record<JobStatus, number>;
  likedJobIds: Set<string>;
  mergedJobs: Job[];
  toggleLiked: (jobId: string) => void;
};

export function useJobCollections(jobs: Job[]): JobCollections {
  const { likedJobIds, toggleLiked, hydrateBackendLikes } = useTemporaryLikes();
  const [backendStatusJobs, setBackendStatusJobs] = useState<Partial<Record<JobStatus, Job[]>>>({});

  useEffect(() => {
    let isMounted = true;

    async function fetchStatusJobs() {
      const [likedResponse, appliedResponse] = await Promise.allSettled([
        fetch(withBasePath("/api/jobs?status=Liked")),
        fetch(withBasePath("/api/jobs?status=Applied")),
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

  return { counts, likedJobIds, mergedJobs, toggleLiked };
}
