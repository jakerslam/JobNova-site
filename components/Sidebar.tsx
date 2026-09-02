import { BrandLogo } from "./BrandLogo";
import type { ComponentType } from "react";
import {
  ExtraCreditsIcon,
  JobsIcon,
  MockInterviewIcon,
  ProfileIcon,
  ResumeIcon,
  SettingsIcon,
  SubscriptionIcon,
} from "./SidebarIcons";

type SidebarIcon = ComponentType<{ className?: string; active?: boolean }>;

const navGroups: Array<Array<{ label: string; icon: SidebarIcon; active?: boolean }>> = [
  [
    { label: "Jobs", icon: JobsIcon, active: true },
    { label: "AI Mock Interview", icon: MockInterviewIcon },
    { label: "Resume", icon: ResumeIcon },
  ],
  [
    { label: "Profile", icon: ProfileIcon },
    { label: "Setting", icon: SettingsIcon },
  ],
  [
    { label: "Subscription", icon: SubscriptionIcon },
    { label: "Extra Credits", icon: ExtraCreditsIcon },
  ],
];

export function Sidebar() {
  return (
    <aside className="flex h-full min-h-0 w-[219px] shrink-0 flex-col overflow-hidden border-r border-zinc-100 bg-white px-3 py-[10px]">
      <div className="flex h-[61.15px] w-[219px] -translate-x-3 items-center px-3">
        <BrandLogo />
      </div>

      <nav className="mt-5 min-h-0 overflow-y-auto pb-4" aria-label="Dashboard navigation">
        {navGroups.map((group, groupIndex) => (
          <div
            key={group.map((item) => item.label).join("-")}
            className={`${groupIndex === 0 ? "" : "mt-[22px] border-t border-zinc-200 pt-[22px]"} space-y-[13px]`}
          >
            {group.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`flex h-[44px] w-full items-center gap-[14px] rounded-full px-[15px] text-left text-[18px] font-medium tracking-[-0.02em] transition-shadow ${
                  item.active
                    ? "bg-violet text-white shadow-sm hover:shadow-md"
                    : "text-ink hover:bg-zinc-50 hover:shadow-sm"
                }`}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center">
                  <item.icon className="max-h-6 max-w-6" active={item.active} />
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="mx-auto mt-auto h-[214px] w-[179px] rounded-[14px] bg-gradient-to-br from-[#7a4ff2] to-[#d4a8ff] px-[21px] pb-6 pt-[30px] text-white">
        <p className="mb-[15px] w-[140px] text-[18px] font-medium leading-6 tracking-[-0.02em]">Upgrade Your Plan</p>
        <p className="mb-[18px] w-[137px] text-[14px] font-normal leading-[22px] tracking-[-0.02em] text-white">Boost your success rate now!</p>
        <button type="button" className="h-10 w-[135px] rounded-full bg-white text-[16px] font-medium leading-[20.3px] tracking-[-0.02em] text-ink">
          Subscription
        </button>
      </div>
    </aside>
  );
}
