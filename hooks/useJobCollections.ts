"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTemporaryLikes } from "@/hooks/useTemporaryLikes";
import { fetchIndeedApplications, mapApplicationRecordToJob } from "@/services/indeedBackend";
import { withBasePath } from "@/services/sitePath";
import type { Job, JobStatus } from "@/types/job";

const statuses: JobStatus[] = ["Matched", "Liked", "Applied"];

type JobCollections = {
  counts: Record<JobStatus, number>;
  likedJobIds: Set<string>;
  mergedJobs: Job[];
  toggleLiked: (jobId: string) => void;
  refreshJobs: () => Promise<void>;
};

export function useJobCollections(jobs: Job[]): JobCollections {
  const { likedJobIds, toggleLiked, hydrateBackendLikes } = useTemporaryLikes();
  const [backendStatusJobs, setBackendStatusJobs] = useState<Partial<Record<JobStatus, Job[]>>>({});
  const isMountedRef = useRef(false);

  const fetchStatusJobs = useCallback(async () => {
    const [likedResponse, appliedResponse, indeedApplicationsResponse] = await Promise.allSettled([
      fetch(withBasePath("/api/jobs?status=Liked")),
      fetch(withBasePath("/api/jobs?status=Applied")),
      fetchIndeedApplications(),
    ]);

    const nextStatusJobs: Partial<Record<JobStatus, Job[]>> = {};

    if (likedResponse.status === "fulfilled" && likedResponse.value.ok) {
      const payload = (await likedResponse.value.json()) as { jobs: Job[] };
      nextStatusJobs.Liked = payload.jobs.filter((job) => job.status === "Liked");
      hydrateBackendLikes(nextStatusJobs.Liked.map((job) => job.id));
    }

    if (appliedResponse.status === "fulfilled" && appliedResponse.value.ok) {
      const payload = (await appliedResponse.value.json()) as { jobs: Job[] };
      nextStatusJobs.Applied = payload.jobs.filter((job) => job.status === "Applied");
    }

    if (indeedApplicationsResponse.status === "fulfilled") {
      const liveJobs = indeedApplicationsResponse.value.map(mapApplicationRecordToJob);
      for (const status of statuses) {
        const statusJobs = liveJobs.filter((job) => job.status === status);
        if (statusJobs.length > 0) {
          nextStatusJobs[status] = [...(nextStatusJobs[status] ?? []), ...statusJobs];
        }
      }
    }

    if (isMountedRef.current) {
      setBackendStatusJobs(nextStatusJobs);
    }
  }, [hydrateBackendLikes]);

  useEffect(() => {
    isMountedRef.current = true;

    function refreshStatusJobs() {
      fetchStatusJobs().catch(() => {
        if (isMountedRef.current) {
          setBackendStatusJobs({});
        }
      });
    }

    refreshStatusJobs();
    const refreshInterval = window.setInterval(refreshStatusJobs, 5_000);
    window.addEventListener("focus", refreshStatusJobs);
    document.addEventListener("visibilitychange", refreshStatusJobs);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", refreshStatusJobs);
      document.removeEventListener("visibilitychange", refreshStatusJobs);
    };
  }, [fetchStatusJobs]);

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

  return { counts, likedJobIds, mergedJobs, toggleLiked, refreshJobs: fetchStatusJobs };
}
