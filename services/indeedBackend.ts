"use client";

import type { Job, JobStatus, ManualApplicationQuestion } from "@/types/job";

export type IndeedApplicationRecord = {
  id: string;
  jobUrl: string;
  title: string;
  company: string;
  companyProfileUrl?: string;
  companyLogoUrl?: string;
  location?: string;
  country?: string;
  jobType?: string;
  workplace?: Job["workplace"];
  experience?: string;
  salary?: string;
  seniority?: string;
  supportsIndeedApply?: boolean;
  relevanceScore?: number;
  status: string;
  lastStep?: string;
  manualActionReason?: string;
  manualActionUrl?: string;
  manualQuestion?: ManualApplicationQuestion;
  applicationAnswers?: Record<string, string>;
  failureReason?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type IndeedCompanionCommand = {
  id: string;
  applicationId: string;
  jobUrl: string;
  state: "queued" | "leased" | "running" | "completed" | "failed";
  allowSubmit: boolean;
  agentId: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  lastStep: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IndeedCompanionDispatchResponse = {
  command: IndeedCompanionCommand;
  application: IndeedApplicationRecord;
};

export type IndeedCompanionStatus = {
  ready: boolean;
  connectedAgents: number;
  extensionVersion?: string;
  lastSeenAt?: string;
};

export const indeedBackendUrl = process.env.NEXT_PUBLIC_INDEED_BACKEND_URL ?? "http://localhost:4100";
export const indeedSessionName = "default";

export async function readBackendJson(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Backend request failed.";
    throw new Error(message);
  }

  return payload;
}

export function postIndeedJson(path: string, body: Record<string, unknown> = {}) {
  return fetch(`${indeedBackendUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchIndeedApplications() {
  const payload = await readBackendJson(await fetch(`${indeedBackendUrl}/applications`));

  if (!payload || typeof payload !== "object" || !("applications" in payload) || !Array.isArray(payload.applications)) {
    return [];
  }

  return payload.applications
    .filter(isIndeedApplicationRecord)
    .filter((record) => record.lastStep !== "invalid_job_metadata");
}

export async function fetchIndeedApplication(applicationId: string) {
  const applications = await fetchIndeedApplications();
  return applications.find((application) => application.id === applicationId);
}

export async function fetchIndeedCompanionStatus(): Promise<IndeedCompanionStatus> {
  const payload = await readBackendJson(await fetch(`${indeedBackendUrl}/companion/status`));
  if (
    !payload ||
    typeof payload !== "object" ||
    !("ready" in payload) ||
    typeof payload.ready !== "boolean" ||
    !("connectedAgents" in payload) ||
    typeof payload.connectedAgents !== "number"
  ) {
    throw new Error("The Indeed companion returned an invalid status response.");
  }
  return payload as IndeedCompanionStatus;
}

export async function dispatchIndeedApplicationToCompanion(
  applicationId: string,
  allowSubmit = true,
): Promise<IndeedCompanionDispatchResponse> {
  const payload = await readBackendJson(
    await postIndeedJson(`/applications/${encodeURIComponent(applicationId)}/dispatch-companion`, { allowSubmit }),
  );

  if (!isIndeedCompanionDispatchResponse(payload)) {
    throw new Error("The Indeed companion returned an invalid dispatch response.");
  }

  return payload;
}

export async function submitIndeedApplicationAnswer(
  applicationId: string,
  questionKey: string,
  value: string,
  allowSubmit = true,
): Promise<IndeedCompanionDispatchResponse> {
  const payload = await readBackendJson(
    await postIndeedJson(`/applications/${encodeURIComponent(applicationId)}/answer`, {
      questionKey,
      value,
      allowSubmit,
    }),
  );
  if (!isIndeedCompanionDispatchResponse(payload)) {
    throw new Error("The Indeed companion returned an invalid answer response.");
  }
  return payload;
}

export function getIndeedApplicationAction(job: Pick<Job, "applicationStatus" | "applicationLastStep">, isApplying = false) {
  if (isApplying) return "applying" as const;

  if (job.applicationStatus === "in_progress") {
    if (job.applicationLastStep === "queued_for_companion") return "queued" as const;
    if (job.applicationLastStep === "leased_by_companion") return "opening" as const;
    return "applying" as const;
  }

  if (job.applicationStatus === "submitted") return "applied" as const;
  if (job.applicationStatus === "manual_action_required") return "finish" as const;

  if (job.applicationStatus === "failed" || job.applicationStatus === "skipped") {
    if (job.applicationLastStep === "external_application" || job.applicationLastStep === "invalid_job_metadata") {
      return "unsupported" as const;
    }

    return "retry" as const;
  }

  return "apply" as const;
}

export function mapApplicationRecordToJob(record: IndeedApplicationRecord): Job {
  const status = mapApplicationStatus(record.status);
  const jobType = record.jobType ?? "Full time";
  const experience = record.experience ?? "Experience not listed";
  const seniority = record.seniority ?? inferSeniority(record.title);

  return {
    id: `indeed-${record.id}`,
    applicationId: record.id,
    title: record.title,
    indeedUrl: record.jobUrl,
    company: record.company,
    companyLinkedInUrl: record.companyProfileUrl,
    companyLogoUrl: record.companyLogoUrl,
    location: record.location ?? "Location not listed",
    country: record.country,
    jobType,
    experience,
    funding: record.company,
    workplace: record.workplace ?? inferWorkplace(record.location),
    posted: formatRelativeTime(record.createdAt),
    applicants: 25,
    match: Math.max(55, Math.min(99, Math.round((record.relevanceScore ?? 0.75) * 100))),
    status,
    salary: record.salary ?? "Salary not listed",
    seniority,
    skills: [jobType, experience],
    description:
      record.failureReason ??
      "This role was collected from Indeed using your local JobNova preferences and is ready for the guarded application workflow.",
    requirements: [
      "Review the live Indeed posting before final submission.",
      "Complete any manual verification or unknown required fields yourself.",
      "Use only your own profile and resume information.",
    ],
    applicationStatus: record.status,
    applicationLastStep: record.lastStep,
    manualActionReason: record.manualActionReason,
    manualActionUrl: record.manualActionUrl,
    manualQuestion: record.manualQuestion,
    applicationFailureReason: record.failureReason,
    supportsIndeedApply: record.supportsIndeedApply,
    isLiveIndeedJob: true,
  };
}

function isIndeedApplicationRecord(value: unknown): value is IndeedApplicationRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    "id" in value &&
    "jobUrl" in value &&
    "title" in value &&
    "company" in value &&
    "status" in value
  );
}

function isIndeedCompanionDispatchResponse(value: unknown): value is IndeedCompanionDispatchResponse {
  return (
    value !== null &&
    typeof value === "object" &&
    "command" in value &&
    "application" in value &&
    isIndeedApplicationRecord(value.application)
  );
}

function mapApplicationStatus(status: string): JobStatus {
  if (status === "submitted" || status === "manual_action_required" || status === "in_progress" || status === "failed" || status === "skipped") {
    return "Applied";
  }
  return "Matched";
}

function inferWorkplace(location?: string): Job["workplace"] {
  const normalized = location?.toLowerCase() ?? "";
  if (normalized.includes("remote")) return "Remote";
  if (normalized.includes("hybrid")) return "Hybrid";
  return "On-site";
}

function inferSeniority(title: string) {
  const normalized = title.toLowerCase();
  if (/\b(intern|internship|student|junior|jr\.?|entry|associate)\b/.test(normalized)) return "Entry Level";
  if (/\b(senior|sr\.?|staff|principal|lead|director|head|vp|vice president)\b/.test(normalized)) return "Senior Level";
  return "Mid Level";
}

function formatRelativeTime(isoDate: string) {
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) return "Recently";

  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.round(hours / 24);
  return `${days} days ago`;
}
