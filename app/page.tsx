import { DashboardClient } from "@/components/DashboardClient";
import { getJobs } from "@/services/jobs";

export default async function DashboardPage() {
  const jobs = await getJobs();

  return <DashboardClient jobs={jobs} initialStatus="Matched" />;
}
