import { notFound } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";
import { getJobs, slugToStatus } from "@/services/jobs";

type JobsStatusPageProps = {
  params: Promise<{
    status: string;
  }>;
};

export function generateStaticParams() {
  return ["matched", "liked", "applied"].map((status) => ({ status }));
}

export default async function JobsStatusPage({ params }: JobsStatusPageProps) {
  const { status: statusSlug } = await params;
  const status = slugToStatus(statusSlug);

  if (!status) {
    notFound();
  }

  const jobs = await getJobs();

  return <DashboardClient jobs={jobs} initialStatus={status} />;
}
