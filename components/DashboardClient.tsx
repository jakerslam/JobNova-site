"use client";

import { useMemo } from "react";
import { BriefcaseBusiness } from "lucide-react";
import { ApplicationQuestionModal } from "@/components/ApplicationQuestionModal";
import { DashboardShell } from "@/components/DashboardShell";
import { FeedActionToolbar } from "@/components/FeedActionToolbar";
import { InterviewPanel } from "@/components/InterviewPanel";
import { JobCard } from "@/components/JobCard";
import { useJobCollections } from "@/hooks/useJobCollections";
import { useIndeedApply } from "@/hooks/useIndeedApply";
import type { Job, JobStatus } from "@/types/job";

type DashboardClientProps = {
  jobs: Job[];
  initialStatus: JobStatus;
};

export function DashboardClient({ jobs, initialStatus }: DashboardClientProps) {
  const { counts, likedJobIds, mergedJobs, toggleLiked, refreshJobs } = useJobCollections(jobs);
  const {
    applyingJobId,
    applyMessage,
    manualQuestion,
    applyToJob,
    answerManualQuestion,
    dismissManualQuestion,
  } = useIndeedApply(refreshJobs);

  const visibleJobs = useMemo(() => {
    const preferLiveJobs = (statusJobs: Job[]) => {
      const liveJobs = statusJobs.filter((job) => job.isLiveIndeedJob);
      return liveJobs.length > 0 ? liveJobs : statusJobs;
    };

    if (initialStatus === "Liked") {
      return preferLiveJobs(mergedJobs.filter((job) => likedJobIds.has(job.id)));
    }

    const filtered = mergedJobs.filter((job) => job.status === initialStatus);
    return preferLiveJobs(filtered);
  }, [initialStatus, likedJobIds, mergedJobs]);

  return (
    <>
    <DashboardShell
      activeStatus={initialStatus}
      counts={counts}
      mobileTitle="JobNova Jobs"
      rightPanel={<InterviewPanel />}
    >
      <FeedActionToolbar />

      {applyMessage ? (
        <div className="mb-3 rounded-full bg-white px-4 py-2 text-[12px] font-medium text-ink shadow-soft">
          {applyMessage}
        </div>
      ) : null}

      <div className="mb-3 flex items-center justify-between px-1 lg:hidden">
        <div>
          <p className="text-[12px] font-medium text-muted">Home page / Jobs {visibleJobs.length}</p>
          <h1 className="mt-1 text-[22px] font-semibold text-ink">{initialStatus} roles</h1>
        </div>
        <BriefcaseBusiness className="h-6 w-6 text-violet" />
      </div>

      <div className="space-y-4 sm:space-y-5">
        {visibleJobs.length ? (
          visibleJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              isSelected={false}
              isSaved={likedJobIds.has(job.id)}
              onToggleSaved={toggleLiked}
              onApplyJob={applyToJob}
              onRefreshStatus={refreshJobs}
              isApplying={applyingJobId === job.id}
            />
          ))
        ) : (
          <div className="border border-dashed border-zinc-200 px-5 py-12 text-center">
            <p className="text-[15px] font-medium text-ink">No {initialStatus.toLowerCase()} roles yet</p>
            <p className="mt-1 text-[13px] text-muted">Real Indeed results and your saved jobs will appear here.</p>
          </div>
        )}
      </div>
    </DashboardShell>
    <ApplicationQuestionModal
      key={manualQuestion ? `${manualQuestion.applicationId}:${manualQuestion.question.key}` : "closed"}
      checkpoint={manualQuestion}
      isSubmitting={Boolean(manualQuestion && applyingJobId === manualQuestion.jobId)}
      onClose={dismissManualQuestion}
      onSubmit={answerManualQuestion}
    />
    </>
  );
}
