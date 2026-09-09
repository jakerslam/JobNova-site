export type JobStatus = "Matched" | "Liked" | "Applied";

export type ManualApplicationQuestion = {
  key: string;
  label: string;
  type: "text" | "single_choice" | "boolean" | "select";
  options?: string[];
  required: boolean;
};

export type Job = {
  id: string;
  applicationId?: string;
  title: string;
  indeedUrl: string;
  company: string;
  companyLinkedInUrl?: string;
  companyDomain?: string;
  companyLogoUrl?: string;
  location: string;
  country?: string;
  jobType?: string;
  experience?: string;
  funding: string;
  workplace: "On-site" | "Remote" | "Hybrid";
  posted: string;
  applicants: number;
  match: number;
  status: JobStatus;
  salary: string;
  seniority: string;
  skills: string[];
  description: string;
  requirements: string[];
  applicationStatus?: string;
  applicationLastStep?: string;
  manualActionReason?: string;
  manualActionUrl?: string;
  manualQuestion?: ManualApplicationQuestion;
  applicationFailureReason?: string;
  supportsIndeedApply?: boolean;
  isLiveIndeedJob?: boolean;
};
