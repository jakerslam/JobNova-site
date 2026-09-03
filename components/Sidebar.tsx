import { BrandLogo } from "./BrandLogo";
import type { ComponentType } from "react";
import Link from "next/link";
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
export type SidebarSection = "jobs" | "mock-interview" | "resume" | "profile" | "settings" | "subscription" | "credits";

const navGroups: Array<Array<{ label: string; href: string; section: SidebarSection; icon: SidebarIcon }>> = [
  [
    { label: "Jobs", href: "/jobs/matched", section: "jobs", icon: JobsIcon },
    { label: "AI Mock Interview", href: "/mock-interview", section: "mock-interview", icon: MockInterviewIcon },
    { label: "Resume", href: "/resume", section: "resume", icon: ResumeIcon },
  ],
  [
    { label: "Profile", href: "/profile", section: "profile", icon: ProfileIcon },
    { label: "Setting", href: "/settings", section: "settings", icon: SettingsIcon },
  ],
  [
    { label: "Subscription", href: "/subscription", section: "subscription", icon: SubscriptionIcon },
    { label: "Extra Credits", href: "/credits", section: "credits", icon: ExtraCreditsIcon },
  ],
];

type SidebarProps = {
  activeSection?: SidebarSection;
};

export function Sidebar({ activeSection = "jobs" }: SidebarProps) {
  return (
    <aside className="flex h-full max-h-dvh min-h-0 w-[219px] shrink-0 flex-col overflow-hidden border-r border-zinc-100 bg-white px-3 py-[10px]">
      <div className="flex h-[61.15px] w-[219px] -translate-x-3 items-center px-3">
        <BrandLogo />
      </div>

      <nav className="mt-5 min-h-0 flex-1 overflow-y-auto pb-4" aria-label="Dashboard navigation">
        {navGroups.map((group, groupIndex) => (
          <div
            key={group.map((item) => item.label).join("-")}
            className={`${groupIndex === 0 ? "" : "mt-[22px] border-t border-zinc-200 pt-[22px]"} space-y-[13px]`}
          >
            {group.map((item) => {
              const isActive = item.section === activeSection;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex h-[44px] w-full items-center gap-[14px] rounded-full px-[15px] text-left text-[18px] font-medium tracking-[-0.02em] transition-shadow ${
                    isActive
                      ? "bg-violet text-white shadow-sm hover:shadow-md"
                      : "text-ink hover:bg-zinc-50 hover:shadow-sm"
                  }`}
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center">
                    <item.icon className="max-h-6 max-w-6" active={isActive} />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mx-auto mt-4 h-[214px] w-[179px] shrink-0 rounded-[14px] bg-gradient-to-br from-[#7a4ff2] to-[#d4a8ff] px-[21px] pb-6 pt-[30px] text-white">
        <p className="mb-[15px] w-[140px] text-[18px] font-medium leading-6 tracking-[-0.02em]">Upgrade Your Plan</p>
        <p className="mb-[18px] w-[137px] text-[14px] font-normal leading-[22px] tracking-[-0.02em] text-white">Boost your success rate now!</p>
        <Link
          href="/subscription"
          className="grid h-10 w-[135px] place-items-center rounded-full bg-white text-[16px] font-medium leading-[20.3px] tracking-[-0.02em] text-ink transition-shadow hover:shadow-md"
        >
          Subscription
        </Link>
      </div>
    </aside>
  );
}
