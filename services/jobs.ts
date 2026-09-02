import type { Job, JobStatus } from "@/types/job";

function createIndeedUrl(title: string, company: string, location: string) {
  const params = new URLSearchParams({
    q: `${title} ${company}`,
    l: location,
  });

  return `https://www.indeed.com/jobs?${params.toString()}`;
}

const jobs: Job[] = [
  {
    id: "web-application-developer",
    title: "Web Application Developer",
    indeedUrl: createIndeedUrl("Web Application Developer", "Backd Business Funding", "Austin, Texas Metropolitan Area"),
    company: "Backd Business Funding",
    companyLinkedInUrl: "https://www.linkedin.com/company/backdbusinessfunding",
    location: "Austin, Texas Metropolitan Area",
    funding: "Backd Business Funding",
    workplace: "On-site",
    posted: "1 hours ago",
    applicants: 25,
    match: 64,
    status: "Matched",
    salary: "$65/yr - $70/yr",
    seniority: "Mid Level",
    skills: ["Full time", "0 of 3 skills match"],
    description:
      "Build responsive customer-facing web application flows and collaborate with design and product partners.",
    requirements: ["3+ years with modern JavaScript", "Responsive UI implementation", "Comfort with product iteration"],
  },
  {
    id: "network-infrastructure-engineer",
    title: "Software Engineer, Network Infrastructure",
    indeedUrl: createIndeedUrl("Software Engineer, Network Infrastructure", "Cursor AI", "Sunnyvale, CA"),
    company: "Cursor AI",
    companyLinkedInUrl: "https://www.linkedin.com/company/cursorai",
    location: "Sunnyvale, CA",
    funding: "Cursor AI",
    workplace: "On-site",
    posted: "2 hours ago",
    applicants: 25,
    match: 93,
    status: "Matched",
    salary: "$161K/yr - $239K/yr",
    seniority: "Mid Level",
    skills: ["Full time", "5+ years exp"],
    description:
      "Own scalable services and platform infrastructure for AI-assisted developer tooling.",
    requirements: ["Distributed systems experience", "Service observability", "Strong API design habits"],
  },
  {
    id: "full-stack-web-developer",
    title: "Full-Stack Software Engineer (Web Developer)",
    indeedUrl: createIndeedUrl("Full-Stack Software Engineer Web Developer", "Simons Foundation", "New York, NY"),
    company: "Simons Foundation",
    companyLinkedInUrl: "https://www.linkedin.com/company/simons-foundation",
    location: "New York, NY",
    funding: "Simons Foundation",
    workplace: "On-site",
    posted: "2 hours ago",
    applicants: 25,
    match: 82,
    status: "Matched",
    salary: "$125K/yr - $140K/yr",
    seniority: "Mid Level",
    skills: ["Full time", "5+ years exp"],
    description:
      "Develop web applications and internal tools for research and operational teams.",
    requirements: ["Full-stack application delivery", "Database-backed features", "Clear technical communication"],
  },
  {
    id: "ux-designer",
    title: "UX Designer",
    indeedUrl: createIndeedUrl("UX Designer", "Google", "Ann Arbor, MI"),
    company: "Google",
    companyLinkedInUrl: "https://www.linkedin.com/company/google",
    location: "Ann Arbor, MI",
    funding: "Google",
    workplace: "Hybrid",
    posted: "2 hours ago",
    applicants: 27,
    match: 91,
    status: "Liked",
    salary: "$120K/yr - $180K/yr",
    seniority: "Mid Level",
    skills: ["Portfolio", "UX research", "Prototyping"],
    description:
      "Shape user-centered product experiences, prototypes, and design systems for complex workflows.",
    requirements: ["3+ years of design experience", "Strong online portfolio", "Experience prototyping in Figma"],
  },
  {
    id: "frontend-application-engineer",
    title: "Frontend Application Engineer",
    indeedUrl: createIndeedUrl("Frontend Application Engineer", "Northstar Systems", "Remote"),
    company: "Northstar Systems",
    companyLinkedInUrl: "https://ca.linkedin.com/company/north-star-systems-inc1",
    location: "Remote",
    funding: "Northstar Systems",
    workplace: "Remote",
    posted: "3 hours ago",
    applicants: 18,
    match: 87,
    status: "Applied",
    salary: "$95K/yr - $130K/yr",
    seniority: "Entry Level",
    skills: ["React", "TypeScript", "Tailwind"],
    description:
      "Implement accessible front-end workflows and collaborate with backend services for a recruiting platform.",
    requirements: ["React and TypeScript experience", "Responsive application UI", "API integration experience"],
  },
];

export async function getJobs(status?: JobStatus): Promise<Job[]> {
  if (!status) {
    return jobs;
  }

  return jobs.filter((job) => job.status === status);
}

export async function getFeaturedJob(): Promise<Job> {
  return jobs.find((job) => job.id === "ux-designer") ?? jobs[0];
}

export async function getJobById(jobId: string): Promise<Job | undefined> {
  return jobs.find((job) => job.id === jobId);
}

export function slugToStatus(slug: string): JobStatus | undefined {
  const normalized = slug.toLowerCase();

  if (normalized === "matched") return "Matched";
  if (normalized === "liked") return "Liked";
  if (normalized === "applied") return "Applied";

  return undefined;
}
