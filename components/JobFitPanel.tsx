import type { Job } from "@/types/job";

type JobFitPanelProps = {
  job: Job;
  hasPremium: boolean;
};

function MiniScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid min-h-[72px] place-items-center bg-white px-2 py-3 text-center">
      <div className="grid h-[36px] w-[36px] place-items-center rounded-full border-[3px] border-violet text-[9px] font-medium leading-none text-ink">
        {value}%
      </div>
      <span className="mt-2 text-[9px] font-medium leading-none text-ink">{label}</span>
    </div>
  );
}

function PremiumFitContent({ job }: { job: Job }) {
  const scoreItems = [
    { label: "Education", value: 93 },
    { label: "Work Exp", value: Math.max(88, job.match) },
    { label: "Skills", value: job.match },
    { label: "Exp. Level", value: job.seniority === "Mid Level" ? 44 : 72 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {scoreItems.map((item) => (
          <MiniScore key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <div className="mt-5 space-y-4 border-t border-zinc-200 pt-4 text-[11px] leading-[16px] text-ink">
        <section>
          <h3 className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold">
            Relevant Experience <span className="h-2 w-2 rounded-sm bg-acid" />
          </h3>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              You have substantial experience as a UX Designer, Interaction Designer, and User Research Specialist.
              Your role at Sohui aligns with designing interaction elements relevant to user experience design for digital
              products.
            </li>
          </ul>
        </section>

        <section>
          <h3 className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold">
            Seniority <span className="h-2 w-2 rounded-sm bg-acid" />
          </h3>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              You have amassed over eight years of relevant experience, meeting the mid-level seniority requirement for
              the role.
            </li>
          </ul>
        </section>

        <section>
          <h3 className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold">
            Education <span className="h-2 w-2 rounded-sm bg-acid" />
          </h3>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              While you hold a Master&apos;s degree from Politecnico di Milano in Digital and Interaction Design, it does not
              strictly align with the specified fields of Computer Science, Computer Engineering, or Information Science
              and Technology required by the job.
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}

function LockedFitContent() {
  return (
    <div className="relative min-h-[520px] flex-1 overflow-hidden rounded-lg bg-white">
      <div className="absolute inset-x-5 top-7 space-y-5 blur-[10px]">
        <div className="h-14 rounded-full bg-gradient-to-r from-violet/35 via-sky-200 to-violet/20" />
        <div className="h-24 rounded-2xl bg-gradient-to-br from-zinc-100 via-violet/20 to-sky-100" />
        <div className="h-20 rounded-2xl bg-gradient-to-r from-zinc-100 via-zinc-200 to-violet/20" />
        <div className="h-28 rounded-2xl bg-gradient-to-br from-zinc-100 via-acid/30 to-violet/20" />
        <div className="h-24 rounded-2xl bg-gradient-to-r from-zinc-100 via-violet/25 to-zinc-100" />
      </div>
      <div className="absolute inset-x-0 bottom-7 flex justify-center">
        <button type="button" className="h-10 rounded-full bg-ink px-6 text-[13px] font-medium text-white">
          Upgrade to check
        </button>
      </div>
    </div>
  );
}

export function JobFitPanel({ job, hasPremium }: JobFitPanelProps) {
  return (
    <aside className="flex h-full w-full shrink-0 flex-col overflow-y-auto bg-zinc-50 px-[22px] py-7 xl:w-[285px]">
      <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-white px-5 py-6 shadow-sm">
        <h2 className="mb-5 text-center text-[13px] font-semibold leading-5 text-ink">
          Why is this job a good fit for me?
        </h2>
        {hasPremium ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PremiumFitContent job={job} />
          </div>
        ) : (
          <LockedFitContent />
        )}
      </div>
    </aside>
  );
}
