import { NextResponse } from "next/server";
import { getJobs } from "@/services/jobs";

export const dynamic = "force-static";

export async function GET() {
  const jobs = await getJobs();

  return NextResponse.json({ jobs });
}
