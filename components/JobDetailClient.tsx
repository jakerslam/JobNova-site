"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { ApplicationQuestionModal } from "@/components/ApplicationQuestionModal";
import { JobDetailView } from "@/components/JobDetailView";
import { JobFitPanel } from "@/components/JobFitPanel";
import { useJobCollections } from "@/hooks/useJobCollections";
import { useIndeedApply } from "@/hooks/useIndeedApply";
import type { Job, JobStatus } from "@/types/job";

type JobDetailClientProps = {
  jobs: Job[];
  job: Job;
  liveStatus?: JobStatus;
};

export function JobDetailClient({ jobs, job, liveStatus }: JobDetailClientProps) {
  const { counts, likedJobIds, mergedJobs, toggleLiked, refreshJobs } = useJobCollections(jobs);
  const [hasPremium, setHasPremium] = useState(false);
  const [liveApplicationId, setLiveApplicationId] = useState<string | null>(null);
  const {
    applyingJobId,
    applyMessage,
    manualQuestion,
    applyToJob,
    answerManualQuestion,
    dismissManualQuestion,
  } = useIndeedApply(refreshJobs);
  const selectedJob =
    liveStatus && liveApplicationId
      ? (mergedJobs.find((candidate) => candidate.applicationId === liveApplicationId) ?? job)
      : job;

  useEffect(() => {
    window.queueMicrotask(() => {
      setHasPremium(window.localStorage.getItem("jobnova:has-premium") === "true");
      setLiveApplicationId(new URLSearchParams(window.location.search).get("applicationId"));
    });
  }, []);

  return (
    <>
    <DashboardShell
      activeStatus={selectedJob.status}
      counts={counts}
      mobileTitle="Job Detail"
      rightPanel={<JobFitPanel job={selectedJob} hasPremium={hasPremium} />}
    >
      <JobDetailView
        job={selectedJob}
        isLiked={likedJobIds.has(selectedJob.id)}
        onToggleLiked={toggleLiked}
        onApplyJob={applyToJob}
        onRefreshStatus={refreshJobs}
        isApplying={applyingJobId === selectedJob.id}
        applyMessage={applyMessage}
      />
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
