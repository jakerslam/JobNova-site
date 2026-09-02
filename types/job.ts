export type JobStatus = "Matched" | "Liked" | "Applied";

export type Job = {
  id: string;
  title: string;
  indeedUrl: string;
  company: string;
  companyLinkedInUrl?: string;
  location: string;
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
};
