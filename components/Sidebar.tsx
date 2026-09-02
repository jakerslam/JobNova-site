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
                ? "bg-violet text-white shadow-sm"
                : "text-ink hover:bg-zinc-50"
            }`}
          >
            <item.icon aria-hidden="true" className="h-[17px] w-[17px]" strokeWidth={2.1} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto rounded-lg bg-violet px-5 py-6 text-white">
        <p className="mb-2 text-[17px] font-medium leading-tight">Upgrade Your Plan</p>
        <p className="mb-5 text-[12px] leading-5 text-white/75">Boost your success rate now!</p>
        <button type="button" className="h-10 w-full rounded-full bg-white text-[12px] font-semibold text-ink">
          Subscription
        </button>
      </div>
    </aside>
  );
}
