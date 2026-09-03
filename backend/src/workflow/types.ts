import type { ApplicationStatus, ManualActionReason } from "./statuses.js";

export type WorkExperience = {
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate?: string;
  description: string;
};

export type Education = {
  school: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
};

export type CandidateProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  resumePath: string;
  links: {
    linkedIn?: string;
    portfolio?: string;
    github?: string;
  };
  workExperience: WorkExperience[];
  education: Education[];
  answers: Record<string, string>;
};

export type JobPreferences = {
  titles: string[];
  locations: string[];
  remoteOptions: Array<"remote" | "hybrid" | "onsite">;
  salaryMin?: number;
  excludedCompanies: string[];
  requiredKeywords: string[];
  excludedKeywords: string[];
  maxApplicationsPerRun: number;
};

export type ApplicationRecord = {
  id: string;
  jobUrl: string;
  title: string;
  company: string;
  location?: string;
  relevanceScore?: number;
  status: ApplicationStatus;
  lastStep?: string;
  manualActionReason?: ManualActionReason;
  failureReason?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ManualCheckResult =
  | { ok: true }
  | { ok: false; reason: ManualActionReason; message: string };

export type JobSearchResult = {
  jobUrl: string;
  title: string;
  company: string;
  location?: string;
  snippet?: string;
  relevanceScore: number;
};
