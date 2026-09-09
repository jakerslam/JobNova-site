import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parse as parseUrl } from "node:url";
import { loadCandidateProfile, loadJobPreferences } from "./config/loadConfig.js";
import { checkChromeDebugStatus, launchMainChromeWithDebugging } from "./indeed/ChromeDebug.js";
import { IndeedApplicationRunner } from "./indeed/IndeedApplicationRunner.js";
import { importIndeedSessionFromChrome } from "./indeed/IndeedBrowserImport.js";
import { IndeedSearchManualCheckpointError, buildIndeedSearchUrls, collectIndeedJobs } from "./indeed/IndeedSearch.js";
import { IndeedSessionManager } from "./indeed/IndeedSessionManager.js";
import { IndeedSessionCoordinator } from "./indeed/IndeedSessionCoordinator.js";
import {
  ApplicationStore,
  getIndeedJobIdentity,
  isUsableApplicationMetadata,
} from "./storage/ApplicationStore.js";
import {
  CompanionCommandError,
  CompanionAgentRegistry,
  CompanionCommandService,
  CompanionCommandStore,
  type CompanionReport,
} from "./workflow/companion.js";
import type { ApplicationStatus, ManualActionReason } from "./workflow/statuses.js";
import type { ManualApplicationQuestion } from "./workflow/types.js";

type JsonBody = Record<string, unknown>;

const coordinator = new IndeedSessionCoordinator();
const companionCommands = new CompanionCommandService(new CompanionCommandStore(), new ApplicationStore());
const companionAgents = new CompanionAgentRegistry();
const port = Number(process.env.PORT ?? process.env.INDEED_API_PORT ?? 4100);
const allowedOrigins = (process.env.INDEED_API_CORS_ORIGIN ?? "http://localhost:3000,https://jakerslam.github.io")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function readBody(request: IncomingMessage): Promise<JsonBody> {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        request.destroy(new Error("Request body too large."));
      }
    });

    request.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw) as JsonBody);
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendNoContent(response: ServerResponse, requestOrigin?: string) {
  response.writeHead(204, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": getAllowedOrigin(requestOrigin),
  });
  response.end();
}

function getAllowedOrigin(requestOrigin?: string) {
  if (requestOrigin?.startsWith("chrome-extension://")) {
    return requestOrigin;
  }

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return allowedOrigins[0] ?? "http://localhost:3000";
}

function withCorsHeaders(request: IncomingMessage, response: ServerResponse) {
  const requestOrigin = request.headers.origin;
  response.setHeader("Access-Control-Allow-Origin", getAllowedOrigin(requestOrigin));
  response.setHeader("Vary", "Origin");
}

function getString(value: unknown, fallback?: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getSessionName(body: JsonBody) {
  return getString(body.sessionName, process.env.INDEED_SESSION_NAME ?? "default") ?? "default";
}

function getBoolean(value: unknown) {
  return value === true || value === "true";
}

function getNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getManualQuestion(value: unknown): ManualApplicationQuestion | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as JsonBody;
  const key = getString(candidate.key);
  const label = getString(candidate.label);
  const type = getString(candidate.type);
  if (!key || !label || !type) return undefined;

  const options = Array.isArray(candidate.options)
    ? candidate.options.filter((option): option is string => typeof option === "string" && Boolean(option.trim()))
    : undefined;
  return {
    key,
    label,
    type: type as ManualApplicationQuestion["type"],
    options,
    required: candidate.required === true,
  };
}

function getRouteId(pathname: string, prefix: string, suffix = "") {
  if (!pathname.startsWith(prefix)) return undefined;
  if (suffix && !pathname.endsWith(suffix)) return undefined;

  const withoutPrefix = pathname.slice(prefix.length);
  const rawId = suffix ? withoutPrefix.slice(0, -suffix.length) : withoutPrefix;
  if (!rawId || rawId.includes("/")) return undefined;

  return decodeURIComponent(rawId);
}

async function route(request: IncomingMessage, response: ServerResponse) {
  if (request.method === "OPTIONS") {
    sendNoContent(response, request.headers.origin);
    return;
  }

  withCorsHeaders(request, response);

  const pathname = parseUrl(request.url ?? "/").pathname ?? "/";

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "jobnova-indeed-backend",
      activeSessions: coordinator.listActiveSessions(),
      companion: companionAgents.status(),
    });
    return;
  }

  if (request.method === "GET" && pathname === "/companion/status") {
    sendJson(response, 200, companionAgents.status());
    return;
  }

  if (request.method === "POST" && pathname === "/companion/agents/heartbeat") {
    const body = await readBody(request);
    sendJson(
      response,
      200,
      companionAgents.heartbeat(
        getString(body.agentId, "") ?? "",
        getString(body.extensionVersion),
      ),
    );
    return;
  }

  if (request.method === "POST" && pathname === "/sessions/start") {
    const body = await readBody(request);
    const session = await coordinator.startLogin(getSessionName(body));
    sendJson(response, 201, session);
    return;
  }

  if (request.method === "GET" && pathname === "/sessions") {
    sendJson(response, 200, {
      activeSessions: coordinator.listActiveSessions(),
    });
    return;
  }

  if (request.method === "POST" && pathname === "/sessions/check") {
    const body = await readBody(request);
    const result = await coordinator.checkSavedSession(getSessionName(body));
    sendJson(response, 200, {
      ...result,
      message: result.ok ? "Indeed session restored successfully." : result.message,
    });
    return;
  }

  if (request.method === "POST" && pathname === "/sessions/diagnose") {
    const body = await readBody(request);
    const result = await coordinator.diagnoseSavedSession(getSessionName(body));
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && pathname === "/sessions/import") {
    const body = await readBody(request);
    const sessionName = getSessionName(body);
    const cdpUrl = getString(body.cdpUrl, process.env.CHROME_CDP_URL);
    const result = await importIndeedSessionFromChrome(cdpUrl, sessionName);
    sendJson(response, 201, {
      ...result,
      sessionName,
      message: "Encrypted Indeed-only session state imported from connected Chrome.",
    });
    return;
  }

  if (request.method === "GET" && pathname === "/chrome/debug/status") {
    sendJson(response, 200, await checkChromeDebugStatus());
    return;
  }

  if (request.method === "POST" && pathname === "/chrome/debug/launch") {
    sendJson(response, 200, await launchMainChromeWithDebugging());
    return;
  }

  if (request.method === "POST" && pathname === "/sessions/import-main-chrome") {
    const body = await readBody(request);
    const sessionName = getSessionName(body);
    const status = await checkChromeDebugStatus();
    if (!status.ok) {
      sendJson(response, 200, {
        ok: false,
        reason: "chrome_debug_unavailable",
        message: status.message,
        status,
      });
      return;
    }

    const result = await importIndeedSessionFromChrome(status.cdpUrl, sessionName);
    sendJson(response, 201, {
      ok: true,
      ...result,
      sessionName,
      message: "Encrypted Indeed-only session state imported from main Chrome.",
    });
    return;
  }

  const sessionSaveId = getRouteId(pathname, "/sessions/", "/save");
  if (request.method === "POST" && sessionSaveId) {
    sendJson(response, 200, await coordinator.saveAndClose(sessionSaveId));
    return;
  }

  const sessionCancelId = getRouteId(pathname, "/sessions/", "/cancel");
  if (request.method === "POST" && sessionCancelId) {
    sendJson(response, 200, await coordinator.cancel(sessionCancelId));
    return;
  }

  const sessionInspectId = getRouteId(pathname, "/sessions/", "/inspect");
  if (request.method === "GET" && sessionInspectId) {
    sendJson(response, 200, await coordinator.inspectActiveSession(sessionInspectId));
    return;
  }

  if (request.method === "GET" && pathname === "/applications") {
    const applications = new ApplicationStore().list().filter(isUsableApplicationMetadata);
    sendJson(response, 200, {
      message: `${applications.length} application record${applications.length === 1 ? "" : "s"} found.`,
      applications,
    });
    return;
  }

  const dispatchCompanionId = getRouteId(pathname, "/applications/", "/dispatch-companion");
  if (request.method === "POST" && dispatchCompanionId) {
    if (!companionAgents.status().ready) {
      throw new CompanionCommandError(
        "The JobNova Chrome companion is not connected. Reload the unpacked extension and try again.",
        503,
      );
    }
    const body = await readBody(request);
    sendJson(response, 200, companionCommands.dispatch(dispatchCompanionId, getBoolean(body.allowSubmit)));
    return;
  }

  const answerApplicationId = getRouteId(pathname, "/applications/", "/answer");
  if (request.method === "POST" && answerApplicationId) {
    if (!companionAgents.status().ready) {
      throw new CompanionCommandError(
        "The JobNova Chrome companion is not connected. Reload the unpacked extension and try again.",
        503,
      );
    }
    const body = await readBody(request);
    sendJson(
      response,
      200,
      companionCommands.answerAndDispatch(
        answerApplicationId,
        getString(body.questionKey, "") ?? "",
        getString(body.value, "") ?? "",
        getBoolean(body.allowSubmit),
      ),
    );
    return;
  }

  if (request.method === "POST" && pathname === "/companion/commands/claim") {
    const body = await readBody(request);
    const result = companionCommands.claim(getString(body.agentId, "") ?? "");
    sendJson(response, 200, result ?? { command: null });
    return;
  }

  const profileCommandId = getRouteId(pathname, "/companion/commands/", "/profile");
  if (request.method === "POST" && profileCommandId) {
    const body = await readBody(request);
    const profile = await loadCandidateProfile();
    sendJson(
      response,
      200,
      companionCommands.profile(
        profileCommandId,
        getString(body.agentId, "") ?? "",
        getString(body.leaseToken, "") ?? "",
        profile,
      ),
    );
    return;
  }

  const heartbeatCommandId = getRouteId(pathname, "/companion/commands/", "/heartbeat");
  if (request.method === "POST" && heartbeatCommandId) {
    const body = await readBody(request);
    sendJson(
      response,
      200,
      companionCommands.heartbeat(
        heartbeatCommandId,
        getString(body.agentId, "") ?? "",
        getString(body.leaseToken, "") ?? "",
        getString(body.lastStep),
      ),
    );
    return;
  }

  const reportCommandId = getRouteId(pathname, "/companion/commands/", "/report");
  if (request.method === "POST" && reportCommandId) {
    const body = await readBody(request);
    const status = getString(body.status);
    if (!status) throw new CompanionCommandError("Missing required field: status.");

    const report: CompanionReport = {
      status: status as ApplicationStatus,
      lastStep: getString(body.lastStep),
      manualActionReason: getString(body.manualActionReason) as ManualActionReason | undefined,
      manualActionUrl: getString(body.manualActionUrl),
      manualQuestion: getManualQuestion(body.manualQuestion),
      failureReason: getString(body.failureReason),
    };

    sendJson(
      response,
      200,
      companionCommands.report(
        reportCommandId,
        getString(body.agentId, "") ?? "",
        getString(body.leaseToken, "") ?? "",
        report,
      ),
    );
    return;
  }

  if (request.method === "POST" && pathname === "/applications/queue") {
    const body = await readBody(request);
    const jobUrl = getString(body.jobUrl);
    if (!jobUrl) throw new Error("Missing required field: jobUrl.");

    const record = new ApplicationStore().upsertPendingJob({
      jobUrl,
      title: getString(body.title, "Manually queued job") ?? "Manually queued job",
      company: getString(body.company, "Unknown company") ?? "Unknown company",
      companyProfileUrl: getString(body.companyProfileUrl),
      companyLogoUrl: getString(body.companyLogoUrl),
      location: getString(body.location),
      country: getString(body.country),
      jobType: getString(body.jobType),
      workplace: getString(body.workplace) as "On-site" | "Remote" | "Hybrid" | undefined,
      experience: getString(body.experience),
      salary: getString(body.salary),
      seniority: getString(body.seniority),
      supportsIndeedApply: typeof body.supportsIndeedApply === "boolean" ? body.supportsIndeedApply : undefined,
      relevanceScore: Number(body.relevanceScore ?? 1),
    });

    sendJson(response, 201, record);
    return;
  }

  if (request.method === "POST" && pathname === "/applications/queue-batch") {
    const body = await readBody(request);
    const jobs = Array.isArray(body.jobs) ? body.jobs : [];
    const store = new ApplicationStore();
    const candidates = jobs
      .map((job) => (job && typeof job === "object" ? (job as JsonBody) : undefined))
      .filter((job): job is JsonBody => Boolean(job && getString(job.jobUrl)))
      .map((job) => ({
        jobUrl: getString(job.jobUrl) ?? "",
        title: getString(job.title, "Indeed job") ?? "Indeed job",
        company: getString(job.company, "Unknown company") ?? "Unknown company",
        companyProfileUrl: getString(job.companyProfileUrl),
        companyLogoUrl: getString(job.companyLogoUrl),
        location: getString(job.location),
        country: getString(job.country),
        jobType: getString(job.jobType),
        workplace: getString(job.workplace) as "On-site" | "Remote" | "Hybrid" | undefined,
        experience: getString(job.experience),
        salary: getString(job.salary),
        seniority: getString(job.seniority),
        supportsIndeedApply: typeof job.supportsIndeedApply === "boolean" ? job.supportsIndeedApply : undefined,
        relevanceScore: getNumber(job.relevanceScore, 0.75),
      }));
    const acceptedByIdentity = new Map<string, (typeof candidates)[number]>();
    for (const job of candidates) {
      if (!isUsableApplicationMetadata(job) || job.supportsIndeedApply === false) continue;
      acceptedByIdentity.set(getIndeedJobIdentity(job.jobUrl), job);
    }
    const accepted = Array.from(acceptedByIdentity.values());
    const records = accepted
      .map((job) =>
        store.upsertPendingJob(job),
      );

    const ignored = jobs.length - records.length;

    sendJson(response, 201, {
      message: `Queued ${records.length} supported Indeed job${records.length === 1 ? "" : "s"}${ignored ? `; ignored ${ignored} malformed, duplicate, or external-apply result${ignored === 1 ? "" : "s"}` : ""}.`,
      queued: records.length,
      ignored,
      records,
    });
    return;
  }

  if (request.method === "POST" && pathname === "/jobs/collect") {
    const body = await readBody(request);
    const sessionName = getSessionName(body);
    const preferences = await loadJobPreferences();
    const manager = new IndeedSessionManager(undefined, sessionName);
    let session: Awaited<ReturnType<IndeedSessionManager["openRestoredSession"]>>;

    try {
      session = await manager.openRestoredSession();
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        sendJson(response, 200, {
          ok: false,
          reason: "login",
          message: `No saved Indeed session exists for "${sessionName}". Complete and save the login handoff first.`,
        });
        return;
      }

      throw error;
    }

    try {
      const jobs = await collectIndeedJobs(session.page, preferences);
      const store = new ApplicationStore();
      const records = jobs.map((job) => store.upsertPendingJob(job));
      sendJson(response, 201, {
        sessionName,
        message: `Collected ${records.length} suitable Indeed job${records.length === 1 ? "" : "s"}.`,
        saved: records.length,
        records,
      });
    } catch (error) {
      if (error instanceof IndeedSearchManualCheckpointError) {
        sendJson(response, 200, {
          ok: false,
          status: "manual_action_required",
          reason: error.reason,
          message: error.message,
        });
        return;
      }

      throw error;
    } finally {
      await session.close();
    }
    return;
  }

  if (request.method === "POST" && pathname === "/jobs/collect-active") {
    const body = await readBody(request);
    const sessionName = getSessionName(body);
    const preferences = await loadJobPreferences();
    try {
      sendJson(response, 200, await coordinator.collectJobsFromActiveSession(preferences, sessionName));
    } catch (error) {
      if (error instanceof IndeedSearchManualCheckpointError) {
        sendJson(response, 200, {
          ok: false,
          status: "manual_action_required",
          reason: error.reason,
          message: error.message,
        });
        return;
      }

      throw error;
    }
    return;
  }

  if (request.method === "POST" && pathname === "/jobs/collect-main-chrome") {
    const body = await readBody(request);
    const sessionName = getSessionName(body);
    const preferences = await loadJobPreferences();
    try {
      sendJson(response, 200, await coordinator.collectJobsFromMainChrome(preferences, sessionName));
    } catch (error) {
      if (error instanceof IndeedSearchManualCheckpointError) {
        sendJson(response, 200, {
          ok: false,
          status: "manual_action_required",
          reason: error.reason,
          message: error.message,
        });
        return;
      }

      throw error;
    }
    return;
  }

  if (request.method === "GET" && pathname === "/jobs/search-urls") {
    const preferences = await loadJobPreferences();
    sendJson(response, 200, {
      maxApplicationsPerRun: preferences.maxApplicationsPerRun,
      searchUrls: buildIndeedSearchUrls(preferences),
    });
    return;
  }

  if (request.method === "POST" && pathname === "/applications/apply") {
    const body = await readBody(request);
    const sessionName = getSessionName(body);
    const limit = Number(body.limit ?? (await loadJobPreferences()).maxApplicationsPerRun);
    const profile = await loadCandidateProfile();
    const runner = new IndeedApplicationRunner(
      profile,
      new ApplicationStore(),
      new IndeedSessionManager(undefined, sessionName),
    );
    const results = await runner.applyPending(limit, { allowSubmit: getBoolean(body.allowSubmit) });
    sendJson(response, 200, {
      sessionName,
      message: `Processed ${results.length} application record${results.length === 1 ? "" : "s"}.`,
      processed: results.length,
      results,
    });
    return;
  }

  if (request.method === "POST" && pathname === "/applications/apply-active") {
    const body = await readBody(request);
    const sessionName = getSessionName(body);
    const limit = Number(body.limit ?? (await loadJobPreferences()).maxApplicationsPerRun);
    const profile = await loadCandidateProfile();
    sendJson(
      response,
      200,
      await coordinator.applyPendingFromActiveSession(profile, limit, { allowSubmit: getBoolean(body.allowSubmit) }, sessionName),
    );
    return;
  }

  if (request.method === "POST" && pathname === "/applications/apply-main-chrome") {
    const body = await readBody(request);
    const sessionName = getSessionName(body);
    const limit = Number(body.limit ?? (await loadJobPreferences()).maxApplicationsPerRun);
    const profile = await loadCandidateProfile();
    sendJson(
      response,
      200,
      await coordinator.applyPendingFromMainChrome(profile, limit, { allowSubmit: getBoolean(body.allowSubmit) }, sessionName),
    );
    return;
  }

  const resumeId = getRouteId(pathname, "/applications/", "/resume");
  if (request.method === "POST" && resumeId) {
    const body = await readBody(request);
    const sessionName = getSessionName(body);
    const store = new ApplicationStore();
    const record = store.get(resumeId);
    if (!record) {
      sendJson(response, 404, { error: `Application not found: ${resumeId}` });
      return;
    }

    const profile = await loadCandidateProfile();
    const runner = new IndeedApplicationRunner(profile, store, new IndeedSessionManager(undefined, sessionName));
    sendJson(response, 200, {
      sessionName,
      result: await runner.applyToRecord(record, { allowSubmit: getBoolean(body.allowSubmit) }),
    });
    return;
  }

  const activeResumeId = getRouteId(pathname, "/applications/", "/resume-active");
  if (request.method === "POST" && activeResumeId) {
    const body = await readBody(request);
    const sessionName = getSessionName(body);
    const profile = await loadCandidateProfile();
    sendJson(
      response,
      200,
      await coordinator.applyRecordFromActiveSession(profile, activeResumeId, { allowSubmit: getBoolean(body.allowSubmit) }, sessionName),
    );
    return;
  }

  const mainChromeResumeId = getRouteId(pathname, "/applications/", "/resume-main-chrome");
  if (request.method === "POST" && mainChromeResumeId) {
    const body = await readBody(request);
    const sessionName = getSessionName(body);
    const profile = await loadCandidateProfile();
    sendJson(
      response,
      200,
      await coordinator.applyRecordFromMainChrome(profile, mainChromeResumeId, { allowSubmit: getBoolean(body.allowSubmit) }, sessionName),
    );
    return;
  }

  sendJson(response, 404, {
    error: "Route not found.",
    pathname,
  });
}

const server = createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    const statusCode = error instanceof CompanionCommandError ? error.statusCode : 500;
    sendJson(response, statusCode, {
      error: error instanceof Error ? error.message : String(error),
    });
  });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Stop the existing backend server or run with INDEED_API_PORT=<free-port>.`,
    );
    process.exitCode = 1;
    return;
  }

  throw error;
});

server.listen(port, () => {
  console.log(`JobNova Indeed backend listening on http://localhost:${port}`);
});
