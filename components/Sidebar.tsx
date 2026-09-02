import {
  Bot,
  BriefcaseBusiness,
  CreditCard,
  FileText,
  Settings,
  UserRound,
  WalletCards,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";

const navItems = [
  { label: "Jobs", icon: BriefcaseBusiness, active: true },
  { label: "AI Mock Interview", icon: Bot },
  { label: "Resume", icon: FileText },
  { label: "Profile", icon: UserRound },
  { label: "Setting", icon: Settings },
  { label: "Subscription", icon: WalletCards },
  { label: "Extra Credits", icon: CreditCard },
];

export function Sidebar() {
  return (
    <aside className="flex h-full min-h-dvh w-[219px] shrink-0 flex-col border-r border-zinc-100 bg-white px-3 py-[10px] lg:min-h-[720px]">
      <div className="flex h-[61.15px] w-[219px] -translate-x-3 items-center px-3">
        <BrandLogo />
      </div>

      <nav className="mt-5 space-y-2" aria-label="Dashboard navigation">
        {navItems.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium ${
              item.active
                ? "rounded-full bg-violet text-white shadow-sm"
                : "text-ink hover:bg-zinc-50"
            }`}
          >
            <item.icon aria-hidden="true" className="h-[17px] w-[17px]" strokeWidth={2.1} />
            <span>{item.label}</span>
          </button>
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
