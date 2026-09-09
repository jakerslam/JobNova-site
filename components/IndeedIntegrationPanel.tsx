"use client";

import { CheckCircle2, CircleAlert, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  fetchIndeedApplications,
  fetchIndeedCompanionStatus,
  type IndeedApplicationRecord,
  type IndeedCompanionStatus,
} from "@/services/indeedBackend";

type PanelState = {
  loading: boolean;
  status?: IndeedCompanionStatus;
  applications: IndeedApplicationRecord[];
  error?: string;
};

export function IndeedIntegrationPanel() {
  const [state, setState] = useState<PanelState>({ loading: true, applications: [] });

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const [status, applications] = await Promise.all([
        fetchIndeedCompanionStatus(),
        fetchIndeedApplications(),
      ]);
      setState({ loading: false, status, applications });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const submitted = state.applications.filter((application) => application.status === "submitted").length;
  const active = state.applications.filter((application) => application.status === "in_progress").length;
  const waiting = state.applications.filter((application) => application.status === "manual_action_required").length;

  return (
    <section className="rounded-[13px] bg-white px-5 py-5 shadow-soft sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`grid h-11 w-11 place-items-center rounded-full ${state.status?.ready ? "bg-acid/20" : "bg-violet/15"}`}>
            {state.loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-violet" />
            ) : state.status?.ready ? (
              <CheckCircle2 className="h-5 w-5 text-ink" />
            ) : (
              <CircleAlert className="h-5 w-5 text-violet" />
            )}
          </div>
          <div>
            <p className="text-[12px] font-medium text-muted">Indeed companion</p>
            <h2 className="mt-0.5 text-[18px] font-semibold text-ink">
              {state.error ? "Backend unavailable" : state.status?.ready ? "Connected" : "Extension disconnected"}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="grid h-10 w-10 place-items-center rounded-full border border-zinc-200 text-ink transition-shadow hover:shadow-md"
            aria-label="Refresh Indeed companion status"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <Link
            href="/jobs/matched"
            className="inline-flex h-10 items-center rounded-full bg-violet px-5 text-[13px] font-medium text-white transition-shadow hover:shadow-md"
          >
            Open Jobs
          </Link>
        </div>
      </div>

      {state.error ? <p className="mt-4 text-[12px] font-medium text-red-600">{state.error}</p> : null}

      <div className="mt-5 grid grid-cols-3 divide-x divide-zinc-100 rounded-lg border border-zinc-100">
        <StatusMetric label="Active" value={active} />
        <StatusMetric label="Waiting" value={waiting} />
        <StatusMetric label="Submitted" value={submitted} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted">
        <span>Agents: {state.status?.connectedAgents ?? 0}</span>
        <span>Extension: {state.status?.extensionVersion ?? "Not detected"}</span>
        <span>Session vault: encrypted</span>
      </div>
    </section>
  );
}

function StatusMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-4 text-center">
      <strong className="block text-[20px] font-semibold text-ink">{value}</strong>
      <span className="mt-1 block text-[11px] font-medium text-muted">{label}</span>
    </div>
  );
}
