"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Menu, X } from "lucide-react";
import { JobDetailView } from "@/components/JobDetailView";
import { JobFitPanel } from "@/components/JobFitPanel";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isInterviewOpen, setIsInterviewOpen] = useState(false);
  const [hasPremium] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("jobnova:has-premium") === "true",
  );

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
    <main className="h-screen overflow-hidden bg-[#ececec] px-0 py-0 sm:px-4 lg:px-6">
      <div className="mx-auto flex h-full max-w-[1375px] overflow-hidden bg-white shadow-soft sm:rounded-2xl lg:rounded-none">
        <div className="hidden h-full lg:block">
          <Sidebar />
        </div>

        {isMenuOpen ? (
          <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setIsMenuOpen(false)}>
            <div className="h-full w-[236px] bg-white" onClick={(event) => event.stopPropagation()}>
              <div className="flex justify-end px-4 pt-4">
                <button type="button" aria-label="Close menu" onClick={() => setIsMenuOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <Sidebar />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f7f7f7]">
          <div className="flex h-14 items-center justify-between border-b border-zinc-100 bg-white px-4 lg:hidden">
            <button type="button" aria-label="Open menu" onClick={() => setIsMenuOpen(true)}>
              <Menu className="h-6 w-6" />
            </button>
            <span className="text-[15px] font-semibold">Job Detail</span>
            <button type="button" aria-label="Open interview panel" onClick={() => setIsInterviewOpen(true)}>
              <Bot className="h-5 w-5" />
            </button>
          </div>

          <TopNav activeStatus={job.status} counts={counts} />

          <div className="flex min-h-0 flex-1">
            <section className="h-full min-w-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 xl:w-[870px] xl:max-w-[870px] xl:shrink-0 xl:px-[23px]">
              <JobDetailView job={job} isLiked={likedJobIds.has(job.id)} onToggleLiked={toggleLiked} />
            </section>

            <div className="hidden h-full shrink-0 overflow-hidden xl:block">
              <JobFitPanel job={job} hasPremium={hasPremium} />
            </div>
          </div>
        </div>
      </div>

      {isInterviewOpen ? (
        <div className="fixed inset-0 z-50 bg-black/35 p-4 xl:hidden" onClick={() => setIsInterviewOpen(false)}>
          <div
            className="ml-auto h-full max-w-[340px] overflow-y-auto rounded-2xl bg-zinc-50"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-end px-4 pt-4">
              <button type="button" aria-label="Close interview panel" onClick={() => setIsInterviewOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <JobFitPanel job={job} hasPremium={hasPremium} />
          </div>
        </div>
      ) : null}
    </main>
  );
}
