import type { JobStatus } from "@/types/job";
import { Undo2 } from "lucide-react";
import Link from "next/link";

const tabs: JobStatus[] = ["Matched", "Liked", "Applied"];

type TopNavProps = {
  activeStatus: JobStatus;
  counts: Record<JobStatus, number>;
};

export function TopNav({ activeStatus, counts }: TopNavProps) {
  return (
    <header className="flex min-h-[74px] flex-col gap-3 border-b border-zinc-100 bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-7">
      <div className="flex items-center gap-3 overflow-x-auto">
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={`/jobs/${tab.toLowerCase()}`}
            className={`flex h-9 shrink-0 items-center gap-2 rounded-full px-5 text-[13px] font-medium transition ${
              activeStatus === tab ? "border border-violet text-ink" : "text-ink hover:bg-zinc-50"
            }`}
          >
            {tab}
            {tab !== "Matched" && counts[tab] ? (
              <span className="grid h-[15px] min-w-[15px] place-items-center rounded-full bg-acid px-1 text-[10px] font-bold text-ink">
                {counts[tab]}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      <div className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-lg bg-violet px-4 text-[12px] font-medium text-white lg:max-w-[520px] lg:text-[13px]">
        <Undo2 aria-hidden="true" className="mr-2 h-4 w-4 shrink-0" />
        <span className="truncate">Change Job Preference</span>
      </div>

      <button type="button" className="hidden h-9 rounded-lg border border-zinc-200 bg-white px-4 text-[13px] font-medium shadow-sm lg:block">
        Top matched
      </button>
    </header>
  );
}
