"use client";

import { Bot, Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import type { JobStatus } from "@/types/job";

type DashboardShellProps = {
  activeStatus: JobStatus;
  counts: Record<JobStatus, number>;
  mobileTitle: string;
  rightPanel: ReactNode;
  children: ReactNode;
};

export function DashboardShell({
  activeStatus,
  counts,
  mobileTitle,
  rightPanel,
  children,
}: DashboardShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  return (
    <main className="h-screen overflow-hidden bg-[#ececec] px-0 py-0 sm:px-4 lg:px-6">
      <div className="mx-auto flex h-full max-w-[1375px] overflow-hidden bg-white shadow-soft sm:rounded-2xl lg:rounded-none">
        <div className="hidden h-full lg:block">
          <Sidebar />
        </div>

        {isMenuOpen ? (
          <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setIsMenuOpen(false)}>
            <div className="flex h-dvh max-h-dvh w-[236px] flex-col bg-white" onClick={(event) => event.stopPropagation()}>
              <div className="shrink-0 px-4 pt-4">
                <div className="flex justify-end">
                  <button type="button" aria-label="Close menu" onClick={() => setIsMenuOpen(false)}>
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <Sidebar />
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f7f7f7]">
          <div className="flex h-14 items-center justify-between border-b border-zinc-100 bg-white px-4 lg:hidden">
            <button type="button" aria-label="Open menu" onClick={() => setIsMenuOpen(true)}>
              <Menu className="h-6 w-6" />
            </button>
            <span className="text-[15px] font-semibold">{mobileTitle}</span>
            <button type="button" aria-label="Open right panel" onClick={() => setIsRightPanelOpen(true)}>
              <Bot className="h-5 w-5" />
            </button>
          </div>

          <TopNav activeStatus={activeStatus} counts={counts} />

          <div className="flex min-h-0 flex-1">
            <section className="h-full min-w-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 xl:w-[870px] xl:max-w-[870px] xl:shrink-0 xl:px-[23px]">
              {children}
            </section>

            <div className="hidden h-full shrink-0 overflow-hidden xl:block">{rightPanel}</div>
          </div>
        </div>
      </div>

      {isRightPanelOpen ? (
        <div className="fixed inset-0 z-50 bg-black/35 p-4 xl:hidden" onClick={() => setIsRightPanelOpen(false)}>
          <div
            className="ml-auto flex h-full max-h-full w-full max-w-[340px] flex-col overflow-hidden rounded-2xl bg-zinc-50"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 justify-end px-4 pt-4">
              <button type="button" aria-label="Close right panel" onClick={() => setIsRightPanelOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{rightPanel}</div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
