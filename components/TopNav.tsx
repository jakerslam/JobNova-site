import type { JobStatus } from "@/types/job";
import Link from "next/link";

const tabs: JobStatus[] = ["Matched", "Liked", "Applied"];

type TopNavProps = {
  activeStatus: JobStatus;
  counts: Record<JobStatus, number>;
};

export function TopNav({ activeStatus, counts }: TopNavProps) {
  return (
    <header className="flex min-h-[74px] items-center border-b border-zinc-100 bg-white px-4 py-4 lg:px-7">
      <div className="flex items-center overflow-x-auto">
        {tabs.map((tab, index) => (
          <div key={tab} className="flex items-center">
            {index > 0 ? <span aria-hidden="true" className="mx-7 h-8 w-px bg-zinc-200" /> : null}
            <Link
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
          </div>
        ))}
      </div>
    </header>
  );
}
