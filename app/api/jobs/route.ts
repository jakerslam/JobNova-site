import { NextResponse } from "next/server";
import { getJobs } from "@/services/jobs";
import type { JobStatus } from "@/types/job";

const statuses = new Set<JobStatus>(["Matched", "Liked", "Applied"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const jobs = await getJobs(statuses.has(status as JobStatus) ? (status as JobStatus) : undefined);

  return NextResponse.json({ jobs });
}
