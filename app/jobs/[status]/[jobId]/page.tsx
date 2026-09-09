import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { JobDetailClient } from "@/components/JobDetailClient";
import { getJobById, getJobs, slugToStatus } from "@/services/jobs";

type JobDetailPageProps = {
  params: Promise<{
    status: string;
    jobId: string;
  }>;
};

export async function generateStaticParams() {
  const jobs = await getJobs();

  return [
    ...jobs.map((job) => ({
      status: job.status.toLowerCase(),
      jobId: job.id,
    })),
    { status: "matched", jobId: "live" },
    { status: "liked", jobId: "live" },
    { status: "applied", jobId: "live" },
  ];
}

export async function generateMetadata({ params }: JobDetailPageProps): Promise<Metadata> {
  const { jobId } = await params;
  const job = await getJobById(jobId);

  return {
    title: job ? `${job.title} | Jobnova` : "Job detail | Jobnova",
    description: job?.description ?? "Review a matched Jobnova role.",
  };
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { status: statusSlug, jobId } = await params;
  const status = slugToStatus(statusSlug);
  const [jobs, job] = await Promise.all([getJobs(), getJobById(jobId)]);

  if (!status) {
    notFound();
  }

  if (jobId === "live") {
    return <JobDetailClient jobs={jobs} job={{ ...jobs[0], id: "live", status }} liveStatus={status} />;
  }

  if (!job) {
    notFound();
  }

  if (job.status !== status) {
    redirect(`/jobs/${job.status.toLowerCase()}/${job.id}`);
  }

  return <JobDetailClient jobs={jobs} job={job} />;
}
