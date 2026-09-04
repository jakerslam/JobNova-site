import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parse as parseUrl } from "node:url";
import { loadCandidateProfile, loadJobPreferences } from "./config/loadConfig.js";
import { IndeedApplicationRunner } from "./indeed/IndeedApplicationRunner.js";
import { importIndeedSessionFromChrome } from "./indeed/IndeedBrowserImport.js";
import { IndeedSearchManualCheckpointError, buildIndeedSearchUrls, collectIndeedJobs } from "./indeed/IndeedSearch.js";
import { IndeedSessionManager } from "./indeed/IndeedSessionManager.js";
import { IndeedSessionCoordinator } from "./indeed/IndeedSessionCoordinator.js";
import { ApplicationStore } from "./storage/ApplicationStore.js";

type JsonBody = Record<string, unknown>;

const coordinator = new IndeedSessionCoordinator();
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
    });
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
    sendJson(response, result.ok ? 200 : 409, {
      ...result,
      message: result.ok ? "Indeed session restored successfully." : result.message,
    });
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
    const applications = new ApplicationStore().list();
    sendJson(response, 200, {
      message: `${applications.length} application record${applications.length === 1 ? "" : "s"} found.`,
      applications,
    });
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
      location: getString(body.location),
      relevanceScore: Number(body.relevanceScore ?? 1),
    });

    sendJson(response, 201, record);
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
        sendJson(response, 409, {
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
        sendJson(response, 409, {
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
    const results = await runner.applyPending(limit);
    sendJson(response, 200, {
      sessionName,
      message: `Processed ${results.length} application record${results.length === 1 ? "" : "s"}.`,
      processed: results.length,
      results,
    });
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
      result: await runner.applyToRecord(record),
    });
    return;
  }

  sendJson(response, 404, {
    error: "Route not found.",
    pathname,
  });
}

const server = createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    sendJson(response, 500, {
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
