import { ChangePreferenceIcon } from "@/components/ChangePreferenceIcon";
import { TopMatchedIcon } from "@/components/TopMatchedIcon";

export function FeedActionToolbar() {
  return (
    <div className="mb-3 flex items-center gap-2">
      <button
        type="button"
        className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-full bg-violet px-4 text-[12px] font-medium text-white shadow-sm transition-shadow hover:shadow-md lg:text-[13px]"
      >
        <ChangePreferenceIcon className="mr-2 h-4 w-4 shrink-0" />
        <span className="truncate">Change Job Preference</span>
      </button>

      <button
        type="button"
        className="hidden h-8 shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-[12px] font-medium text-ink shadow-[0_4px_0_rgba(31,41,55,0.06),0_10px_18px_rgba(31,41,55,0.08)] transition-shadow hover:shadow-[0_5px_0_rgba(31,41,55,0.07),0_13px_22px_rgba(31,41,55,0.1)] sm:flex"
      >
        <TopMatchedIcon className="h-4 w-4" />
        Top matched
      </button>
    </div>
  );
}
