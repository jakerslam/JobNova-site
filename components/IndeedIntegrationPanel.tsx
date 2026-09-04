"use client";

import {
  BriefcaseBusiness,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";

type ApiState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
  detail?: unknown;
};

const backendUrl = process.env.NEXT_PUBLIC_INDEED_BACKEND_URL ?? "http://localhost:4100";
const sessionName = "default";
const offlineMessage = `Cannot reach the Indeed backend at ${backendUrl}. Start it with: cd "/Users/jay/Document (Lcl)/Coding/Career dashboard/backend" && npm run dev`;

function getMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  return "Request completed.";
}

async function readJson(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    throw new Error(getMessage(payload));
  }

  return payload;
}

function postJson(path: string, body: Record<string, unknown> = {}) {
  return fetch(`${backendUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function IndeedIntegrationPanel() {
  const [state, setState] = useState<ApiState>({
    status: "idle",
    message: "Start a secure Indeed login handoff when you are ready to connect the backend workflow.",
  });

  async function runAction(label: string, action: () => Promise<unknown>) {
    setState({ status: "loading", message: label });

    try {
      const detail = await action();
      setState({ status: "success", message: getMessage(detail), detail });
    } catch (error) {
      const message = error instanceof Error && error.message === "Failed to fetch" ? offlineMessage : error instanceof Error ? error.message : String(error);

      setState({
        status: "error",
        message,
      });
    }
  }

  return (
    <section className="rounded-[13px] bg-white px-5 py-5 shadow-soft sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium text-muted">Indeed connection</p>
          <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-ink">Manual login handoff</h2>
          <p className="mt-2 max-w-[620px] text-[13px] leading-6 text-muted">
            Connect Indeed by opening a dedicated browser session, completing verification yourself, and saving the
            encrypted session state for later workflow runs.
          </p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-full bg-violet/15">
          <ShieldCheck className="h-6 w-6 text-violet" />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() =>
            runAction("Opening the Indeed login handoff...", async () => {
              const response = await postJson("/sessions/start", { sessionName });
              return readJson(response);
            })
          }
          className="flex h-11 items-center justify-center gap-2 rounded-full bg-violet px-4 text-[13px] font-medium text-white shadow-sm transition hover:shadow-md"
        >
          <Play className="h-4 w-4" />
          Start Login
        </button>
        <button
          type="button"
          onClick={() =>
            runAction("Checking the active login handoff...", async () => {
              const response = await fetch(`${backendUrl}/sessions/${sessionName}/inspect`);
              return readJson(response);
            })
          }
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-[13px] font-medium text-ink transition hover:shadow-md"
        >
          <RefreshCw className="h-4 w-4" />
          Inspect
        </button>
        <button
          type="button"
          onClick={() =>
            runAction("Saving encrypted Indeed session...", async () => {
              const response = await fetch(`${backendUrl}/sessions/${sessionName}/save`, { method: "POST" });
              return readJson(response);
            })
          }
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-[13px] font-medium text-ink transition hover:shadow-md"
        >
          <Save className="h-4 w-4" />
          Save Session
        </button>
        <button
          type="button"
          onClick={() =>
            runAction("Checking saved Indeed session...", async () => {
              const response = await postJson("/sessions/check", { sessionName });
              return readJson(response);
            })
          }
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-[13px] font-medium text-ink transition hover:shadow-md"
        >
          <CheckCircle2 className="h-4 w-4" />
          Check
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() =>
            runAction("Loading application records...", async () => {
              const response = await fetch(`${backendUrl}/applications`);
              return readJson(response);
            })
          }
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-[13px] font-medium text-ink transition hover:shadow-md"
        >
          <BriefcaseBusiness className="h-4 w-4" />
          Status
        </button>
        <button
          type="button"
          onClick={() =>
            runAction("Collecting suitable jobs from Indeed...", async () => {
              const response = await postJson("/jobs/collect", { sessionName });
              return readJson(response);
            })
          }
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-[13px] font-medium text-ink transition hover:shadow-md"
        >
          <RefreshCw className="h-4 w-4" />
          Collect Jobs
        </button>
        <button
          type="button"
          onClick={() =>
            runAction("Running guarded Indeed apply workflow...", async () => {
              const response = await postJson("/applications/apply", { sessionName, limit: 3 });
              return readJson(response);
            })
          }
          className="flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-white shadow-sm transition hover:shadow-md"
        >
          <Send className="h-4 w-4" />
          Run Apply
        </button>
      </div>

      <div className="mt-5 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
        <div className="flex items-start gap-3">
          {state.status === "loading" ? (
            <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-violet" />
          ) : state.status === "error" ? (
            <XCircle className="mt-0.5 h-4 w-4 text-red-500" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-violet" />
          )}
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">{state.message}</p>
            {state.detail ? (
              <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-[11px] leading-5 text-muted">
                {JSON.stringify(state.detail, null, 2)}
              </pre>
            ) : null}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-5 text-muted">
        Backend URL: <span className="font-medium text-ink">{backendUrl}</span>
      </p>

      <button
        type="button"
        onClick={() => window.open("https://secure.indeed.com/auth", "_blank", "noopener,noreferrer")}
        className="mt-4 inline-flex items-center gap-2 text-[13px] font-medium text-violet"
      >
        Open Indeed in a regular tab
        <ExternalLink className="h-4 w-4" />
      </button>
    </section>
  );
}
