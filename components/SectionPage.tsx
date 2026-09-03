import {
  Bot,
  CheckCircle2,
  CreditCard,
  FileText,
  Gauge,
  Mail,
  MapPin,
  MessageSquareText,
  Shield,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { InterviewPanel } from "@/components/InterviewPanel";
import type { SidebarSection } from "@/components/Sidebar";
import { getJobs } from "@/services/jobs";
import type { JobStatus } from "@/types/job";

type SectionPageProps = {
  section: SidebarSection;
  title: string;
  eyebrow: string;
  summary: string;
  children: ReactNode;
};

function getCounts(jobs: Awaited<ReturnType<typeof getJobs>>) {
  return jobs.reduce<Record<JobStatus, number>>(
    (totals, job) => {
      totals[job.status] += 1;
      return totals;
    },
    { Matched: 0, Liked: 0, Applied: 0 },
  );
}

export async function SectionPage({ section, title, eyebrow, summary, children }: SectionPageProps) {
  const jobs = await getJobs();

  return (
    <DashboardShell
      activeStatus="Matched"
      activeSection={section}
      counts={getCounts(jobs)}
      mobileTitle={title}
      rightPanel={<InterviewPanel />}
      showJobTabs={false}
    >
      <div className="space-y-5">
        <header className="rounded-[13px] bg-white px-5 py-5 shadow-soft sm:px-6">
          <p className="text-[12px] font-medium text-muted">{eyebrow}</p>
          <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[32px]">
            {title}
          </h1>
          <p className="mt-3 max-w-[620px] text-[13px] leading-6 text-muted">{summary}</p>
        </header>

        {children}
      </div>
    </DashboardShell>
  );
}

export function MetricStrip({ items }: { items: Array<{ label: string; value: string; tone?: "acid" | "violet" }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-[13px] bg-white px-5 py-4 shadow-soft">
          <p className="text-[12px] font-medium text-muted">{item.label}</p>
          <p className={`mt-2 text-[24px] font-semibold ${item.tone === "acid" ? "text-acid" : "text-ink"}`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ActionList({ items }: { items: Array<{ title: string; detail: string }> }) {
  return (
    <div className="rounded-[13px] bg-white px-5 py-5 shadow-soft sm:px-6">
      <div className="space-y-4">
        {items.map((item) => (
          <section key={item.title} className="border-b border-zinc-100 pb-4 last:border-0 last:pb-0">
            <h2 className="text-[15px] font-semibold text-ink">{item.title}</h2>
            <p className="mt-1 text-[13px] leading-5 text-muted">{item.detail}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

export function PillGrid({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] text-ink">
          {item}
        </span>
      ))}
    </div>
  );
}

export function MockInterviewContent() {
  return (
    <>
      <MetricStrip
        items={[
          { label: "Readiness", value: "82%" },
          { label: "Sessions", value: "6" },
          { label: "Next focus", value: "System design" },
        ]}
      />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <ActionList
          items={[
            { title: "Frontend behavioral screen", detail: "Practice product tradeoffs, collaboration examples, and internship motivation." },
            { title: "Technical walkthrough", detail: "Explain routing, component boundaries, static export, and the local state model." },
            { title: "Design critique round", detail: "Review the JobNova UI against Figma and call out responsive decisions." },
          ]}
        />
        <div className="rounded-[13px] bg-acid px-5 py-5 shadow-soft">
          <Bot className="h-9 w-9 text-ink" />
          <h2 className="mt-4 text-[18px] font-semibold text-ink">Start mock interview</h2>
          <p className="mt-2 text-[13px] leading-5 text-ink/65">
            Generate a short role-specific interview flow based on the selected job and resume profile.
          </p>
          <button type="button" className="mt-5 h-10 rounded-full bg-ink px-5 text-[13px] font-semibold text-white">
            Begin Session
          </button>
        </div>
      </div>
    </>
  );
}

export function ResumeContent() {
  return (
    <>
      <MetricStrip
        items={[
          { label: "Resume score", value: "88%" },
          { label: "Keyword match", value: "74%" },
          { label: "Open fixes", value: "5" },
        ]}
      />
      <div className="rounded-[13px] bg-white px-5 py-5 shadow-soft sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-violet/15">
              <FileText className="h-6 w-6 text-violet" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-ink">Jay Resume 2026.pdf</h2>
              <p className="text-[12px] text-muted">Last scanned for frontend internship roles</p>
            </div>
          </div>
          <button type="button" className="h-10 rounded-full border border-zinc-200 px-5 text-[13px] font-medium text-ink">
            Replace
          </button>
        </div>
      </div>
      <ActionList
        items={[
          { title: "Tighten project bullets", detail: "Lead each bullet with shipped behavior, technical scope, and measurable product impact." },
          { title: "Mirror the job language", detail: "Add terms around responsive UI, TypeScript, API integration, and component architecture." },
          { title: "Add deployment proof", detail: "Include the GitHub Pages link and repository link near the JobNova project entry." },
        ]}
      />
    </>
  );
}

export function ProfileContent() {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-[13px] bg-white px-5 py-5 shadow-soft">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-violet/15">
          <UserRound className="h-8 w-8 text-violet" />
        </div>
        <h2 className="mt-4 text-[20px] font-semibold text-ink">Jay Slam</h2>
        <p className="mt-1 flex items-center gap-2 text-[13px] text-muted">
          <MapPin className="h-4 w-4" />
          Salt Lake City, UT
        </p>
        <PillGrid items={["React", "TypeScript", "Next.js", "Tailwind CSS", "Figma"]} />
      </div>
      <ActionList
        items={[
          { title: "Target role", detail: "Frontend / full-stack web development internship with product-facing UI work." },
          { title: "Work preferences", detail: "Remote, hybrid, or onsite roles in the United States with mentorship and modern web stacks." },
          { title: "Portfolio emphasis", detail: "Responsive dashboards, service boundaries, API-ready data flows, and design implementation." },
        ]}
      />
    </div>
  );
}

export function SettingsContent() {
  const settings = [
    ["Email job matches", "Receive a daily digest of high-confidence job matches.", Mail],
    ["Interview reminders", "Show reminders when a saved role has not been practiced.", MessageSquareText],
    ["Privacy mode", "Hide personal profile details during screen sharing.", Shield],
  ] as const;

  return (
    <div className="rounded-[13px] bg-white px-5 py-5 shadow-soft sm:px-6">
      <div className="space-y-4">
        {settings.map(([title, detail, Icon]) => (
          <div key={title} className="flex items-center justify-between gap-4 border-b border-zinc-100 pb-4 last:border-0 last:pb-0">
            <div className="flex items-start gap-3">
              <Icon className="mt-1 h-5 w-5 text-ink" />
              <div>
                <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
                <p className="mt-1 text-[13px] leading-5 text-muted">{detail}</p>
              </div>
            </div>
            <span className="h-7 w-12 shrink-0 rounded-full bg-violet p-1">
              <span className="block h-5 w-5 translate-x-5 rounded-full bg-white" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SubscriptionContent() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {[
        ["Starter", "$0", "Track matches, save jobs, and open static detail pages."],
        ["JobNova Pro", "$19", "Unlock fit analysis, richer interview prep, and advanced recommendations."],
      ].map(([name, price, detail]) => (
        <div key={name} className="rounded-[13px] bg-white px-5 py-5 shadow-soft">
          <div className="flex items-center gap-3">
            <CreditCard className="h-6 w-6 text-violet" />
            <h2 className="text-[18px] font-semibold text-ink">{name}</h2>
          </div>
          <p className="mt-5 text-[34px] font-semibold tracking-[-0.02em] text-ink">
            {price}
            <span className="text-[13px] font-normal text-muted"> / month</span>
          </p>
          <p className="mt-3 text-[13px] leading-5 text-muted">{detail}</p>
          <button type="button" className="mt-6 h-10 rounded-full bg-ink px-5 text-[13px] font-semibold text-white">
            Choose Plan
          </button>
        </div>
      ))}
    </div>
  );
}

export function CreditsContent() {
  return (
    <>
      <MetricStrip
        items={[
          { label: "Available credits", value: "120", tone: "acid" },
          { label: "Used this week", value: "18" },
          { label: "Projected sessions", value: "12" },
        ]}
      />
      <ActionList
        items={[
          { title: "AI mock interview", detail: "10 credits per generated interview session with feedback." },
          { title: "Resume keyword scan", detail: "4 credits per scan against a selected job description." },
          { title: "Job-fit explanation", detail: "2 credits per premium fit breakdown when subscription access is inactive." },
        ]}
      />
      <div className="rounded-[13px] bg-white px-5 py-5 shadow-soft sm:px-6">
        <h2 className="mb-3 text-[16px] font-semibold text-ink">Recent usage</h2>
        <div className="space-y-3 text-[13px] text-muted">
          {["UX Designer fit analysis", "Frontend interview practice", "Resume keyword scan"].map((item) => (
            <div key={item} className="flex items-center justify-between border-b border-zinc-100 pb-3 last:border-0 last:pb-0">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-violet" />
                {item}
              </span>
              <span>-4</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function SectionVisual({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[13px] bg-white px-5 py-5 shadow-soft">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-acid">
          <Sparkles className="h-5 w-5 text-ink" />
        </div>
        <div>
          <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
          <p className="text-[13px] leading-5 text-muted">{detail}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="h-2 rounded-full bg-violet" />
        <div className="h-2 rounded-full bg-acid" />
        <div className="h-2 rounded-full bg-zinc-200" />
      </div>
    </div>
  );
}

export const sectionIcons = { Gauge, Star };
