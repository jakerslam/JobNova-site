"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  dispatchIndeedApplicationToCompanion,
  fetchIndeedApplication,
  submitIndeedApplicationAnswer,
  type IndeedApplicationRecord,
} from "@/services/indeedBackend";
import type { Job, ManualApplicationQuestion } from "@/types/job";

export type ManualQuestionCheckpoint = {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  question: ManualApplicationQuestion;
};

export function useIndeedApply(refreshJobs: () => Promise<void>) {
  const [applyingJobId, setApplyingJobId] = useState<string>();
  const [applyMessage, setApplyMessage] = useState<string>();
  const [manualQuestion, setManualQuestion] = useState<ManualQuestionCheckpoint>();
  const pollId = useRef(0);

  useEffect(() => () => {
    pollId.current += 1;
  }, []);

  const trackApplication = useCallback(async (
    jobId: string,
    jobTitle: string,
    applicationId: string,
    currentPollId: number,
    initialApplication: IndeedApplicationRecord,
  ) => {
      setApplyMessage(formatApplicationProgress(initialApplication));
      await refreshJobs();
      let previousSignature = "";
      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline && pollId.current === currentPollId) {
        await delay(750);
        const application = await fetchIndeedApplication(applicationId);
        if (!application) throw new Error("The backend lost the application record.");

        const signature = `${application.status}:${application.lastStep ?? ""}:${application.failureReason ?? ""}:${application.manualQuestion?.key ?? ""}`;
        if (signature !== previousSignature) {
          previousSignature = signature;
          setApplyMessage(formatApplicationProgress(application));
          await refreshJobs();
        }

        if (isTerminalApplicationStatus(application.status)) {
          if (
            application.status === "manual_action_required" &&
            application.manualActionReason === "unknown_field" &&
            application.manualQuestion
          ) {
            setManualQuestion({
              applicationId,
              jobId,
              jobTitle,
              question: application.manualQuestion,
            });
          }
          return;
        }
      }

      if (pollId.current === currentPollId) {
        setApplyMessage("The application is still running in the background. Its status will continue updating in Applied jobs.");
      }
  }, [refreshJobs]);

  const applyToJob = useCallback(async (job: Job) => {
    if (!job.applicationId) return;
    if (
      job.applicationStatus === "manual_action_required" &&
      job.manualActionReason === "unknown_field" &&
      job.manualQuestion
    ) {
      setManualQuestion({
        applicationId: job.applicationId,
        jobId: job.id,
        jobTitle: job.title,
        question: job.manualQuestion,
      });
      return;
    }

    setApplyingJobId(job.id);
    setManualQuestion(undefined);
    setApplyMessage("Starting your Indeed application...");
    const currentPollId = ++pollId.current;

    try {
      const dispatched = await dispatchIndeedApplicationToCompanion(job.applicationId, true);
      await trackApplication(job.id, job.title, job.applicationId, currentPollId, dispatched.application);
    } catch (error) {
      setApplyMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (pollId.current === currentPollId) setApplyingJobId(undefined);
    }
  }, [trackApplication]);

  const answerManualQuestion = useCallback(async (value: string) => {
    const checkpoint = manualQuestion;
    if (!checkpoint) return;

    setApplyingJobId(checkpoint.jobId);
    setApplyMessage("Sending your answer and resuming the application...");
    const currentPollId = ++pollId.current;

    try {
      const dispatched = await submitIndeedApplicationAnswer(
        checkpoint.applicationId,
        checkpoint.question.key,
        value,
        true,
      );
      setManualQuestion(undefined);
      await trackApplication(
        checkpoint.jobId,
        checkpoint.jobTitle,
        checkpoint.applicationId,
        currentPollId,
        dispatched.application,
      );
    } catch (error) {
      setApplyMessage(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      if (pollId.current === currentPollId) setApplyingJobId(undefined);
    }
  }, [manualQuestion, trackApplication]);

  return {
    applyingJobId,
    applyMessage,
    manualQuestion,
    applyToJob,
    answerManualQuestion,
    dismissManualQuestion: () => setManualQuestion(undefined),
  };
}

function isTerminalApplicationStatus(status: string) {
  return status === "submitted" || status === "manual_action_required" || status === "failed" || status === "skipped";
}

function formatApplicationProgress(application: IndeedApplicationRecord) {
  if (application.status === "submitted") return "Application submitted and confirmed by Indeed.";
  if (application.status === "manual_action_required") {
    if (application.manualActionReason === "unknown_field") {
      return application.failureReason ?? "JobNova filled the known fields. Indeed needs one answer from you before it can continue.";
    }
    if (application.manualActionReason === "review_required") {
      return application.failureReason ?? "JobNova reached a review step that needs your attention in Indeed.";
    }
    if (application.manualActionReason === "login") return "Indeed needs you to sign in before JobNova can continue.";
    if (application.manualActionReason === "captcha") return "Indeed needs you to complete its human-verification step.";
    if (application.manualActionReason === "sms") return "Indeed needs the SMS verification code sent to you.";
    if (application.manualActionReason === "email") return "Indeed needs the email verification code sent to you.";
    return application.failureReason ?? "Indeed needs a manual step before JobNova can continue.";
  }
  if (application.status === "failed" || application.status === "skipped") {
    return application.failureReason ?? `Application ${application.status}.`;
  }

  const step = application.lastStep ?? "";
  if (step === "queued_for_companion") return "Application queued for the Chrome companion.";
  if (step === "leased_by_companion") return "Opening the authenticated Indeed application in the background.";
  if (step === "apply_clicked") return "Indeed Apply opened. Waiting for the application form.";
  if (step.startsWith("existing_resume_selected")) return "Your existing Indeed resume was selected.";
  if (step.startsWith("profile_fields_filled")) return "Known profile fields are filled. JobNova is continuing.";
  if (step.startsWith("clicked_")) return "Advancing through the Indeed application.";
  if (step === "final_submit_clicked") return "Submission requested. Waiting for Indeed confirmation.";
  return "Application is running in the background.";
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
