import { randomUUID } from "node:crypto";
import type { BrowserContext, Page } from "playwright";
import { ApplicationStore } from "../storage/ApplicationStore.js";
import type { CandidateProfile, JobPreferences } from "../workflow/types.js";
import { openMainChromeSession } from "./ChromeDebug.js";
import { IndeedApplicationRunner } from "./IndeedApplicationRunner.js";
import { detectManualCheckpoint } from "./IndeedManualCheck.js";
import { IndeedSessionManager } from "./IndeedSessionManager.js";
import { collectIndeedJobs } from "./IndeedSearch.js";

type ActiveHandoffSession = {
  id: string;
  sessionName: string;
  startedAt: string;
  manager: IndeedSessionManager;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
};

export type HandoffSessionSummary = {
  id: string;
  sessionName: string;
  startedAt: string;
  currentUrl: string;
};

export class IndeedSessionCoordinator {
  private readonly activeSessions = new Map<string, ActiveHandoffSession>();

  listActiveSessions(): HandoffSessionSummary[] {
    return Array.from(this.activeSessions.values()).map((session) => this.toSummary(session));
  }

  getActiveSession(sessionName = "default") {
    const session = this.activeSessions.get(sessionName);
    return session ? this.toSummary(session) : undefined;
  }

  async startLogin(sessionName = "default") {
    await this.closeActiveSession(sessionName);

    const manager = new IndeedSessionManager(undefined, sessionName);
    const session = await manager.openFreshSession();
    await session.page.goto("https://secure.indeed.com/auth", { waitUntil: "domcontentloaded" });

    const activeSession: ActiveHandoffSession = {
      id: randomUUID(),
      sessionName,
      startedAt: new Date().toISOString(),
      manager,
      ...session,
    };

    this.activeSessions.set(sessionName, activeSession);

    return {
      ...this.toSummary(activeSession),
      manualAction:
        "Complete Indeed login and any email, SMS, or CAPTCHA verification in the opened browser. Then call the save endpoint.",
    };
  }

  async saveAndClose(sessionName = "default") {
    const session = this.requireActiveSession(sessionName);
    await session.manager.save(session.context);
    const restoreCheck = await this.checkSavedSession(sessionName);

    if (restoreCheck.ok) {
      await this.closeActiveSession(sessionName);

      return {
        ok: true as const,
        sessionName,
        saved: true,
        closed: true,
        savedAt: new Date().toISOString(),
        restoreCheck,
        message: "Indeed connection saved and verified.",
      };
    }

    return {
      ok: false as const,
      sessionName,
      saved: true,
      closed: false,
      savedAt: new Date().toISOString(),
      activeSession: this.toSummary(session),
      restoreCheck,
      message:
        "Saved the browser state, but the restored session still needs login or verification. The handoff browser is still open.",
    };
  }

  async cancel(sessionName = "default") {
    await this.closeActiveSession(sessionName);

    return {
      sessionName,
      cancelled: true,
      closedAt: new Date().toISOString(),
    };
  }

  async inspectActiveSession(sessionName = "default") {
    const session = this.requireActiveSession(sessionName);
    const manualCheck = await detectManualCheckpoint(session.page);
    const title = await session.page.title().catch(() => "");

    return {
      ...this.toSummary(session),
      title,
      manualCheck,
    };
  }

  async collectJobsFromActiveSession(preferences: JobPreferences, sessionName = "default") {
    const session = this.requireActiveSession(sessionName);
    const manualCheck = await detectManualCheckpoint(session.page);
    if (!manualCheck.ok) {
      return {
        ok: false as const,
        sessionName,
        status: "manual_action_required" as const,
        reason: manualCheck.reason,
        message: manualCheck.message,
        activeSession: this.toSummary(session),
      };
    }

    const jobs = await collectIndeedJobs(session.page, preferences);
    const store = new ApplicationStore();
    const records = jobs.map((job) => store.upsertPendingJob(job));

    return {
      ok: true as const,
      sessionName,
      message: `Collected ${records.length} suitable Indeed job${records.length === 1 ? "" : "s"} from the active handoff browser.`,
      saved: records.length,
      records,
      activeSession: this.toSummary(session),
    };
  }

  async collectJobsFromMainChrome(preferences: JobPreferences, sessionName = "default") {
    const session = await openMainChromeSession();

    try {
      const manualCheck = await detectManualCheckpoint(session.page);
      if (!manualCheck.ok) {
        return {
          ok: false as const,
          sessionName,
          status: "manual_action_required" as const,
          reason: manualCheck.reason,
          message: manualCheck.message,
          activeSession: {
            id: "main-chrome",
            sessionName,
            startedAt: new Date().toISOString(),
            currentUrl: session.page.url(),
          },
        };
      }

      const jobs = await collectIndeedJobs(session.page, preferences);
      const store = new ApplicationStore();
      const records = jobs.map((job) => store.upsertPendingJob(job));

      return {
        ok: true as const,
        sessionName,
        message: `Collected ${records.length} suitable Indeed job${records.length === 1 ? "" : "s"} from main Chrome.`,
        saved: records.length,
        records,
        activeSession: {
          id: "main-chrome",
          sessionName,
          startedAt: new Date().toISOString(),
          currentUrl: session.page.url(),
        },
      };
    } finally {
      await session.close();
    }
  }

  async applyPendingFromActiveSession(
    profile: CandidateProfile,
    limit: number,
    options: { allowSubmit?: boolean } = {},
    sessionName = "default",
  ) {
    const session = this.requireActiveSession(sessionName);
    const store = new ApplicationStore();
    const runner = new IndeedApplicationRunner(profile, store, session.manager);
    const records = store.listPending(limit);
    const results = [];

    for (const record of records) {
      try {
        results.push(await runner.applyToRecordWithPage(session.page, record, options));
      } catch (error) {
        results.push(
          store.update(record.id, {
            status: "failed",
            lastStep: "active_runner_exception",
            failureReason: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }

    return {
      ok: true as const,
      sessionName,
      message: `Processed ${results.length} application record${results.length === 1 ? "" : "s"} in the active handoff browser.`,
      processed: results.length,
      results,
      activeSession: this.toSummary(session),
    };
  }

  async applyPendingFromMainChrome(
    profile: CandidateProfile,
    limit: number,
    options: { allowSubmit?: boolean } = {},
    sessionName = "default",
  ) {
    const session = await openMainChromeSession();
    const store = new ApplicationStore();
    const runner = new IndeedApplicationRunner(profile, store);
    const records = store.listPending(limit);
    const results = [];

    try {
      for (const record of records) {
        try {
          results.push(await runner.applyToRecordWithPage(session.page, record, options));
        } catch (error) {
          results.push(
            store.update(record.id, {
              status: "failed",
              lastStep: "main_chrome_runner_exception",
              failureReason: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      }

      return {
        ok: true as const,
        sessionName,
        message: `Processed ${results.length} application record${results.length === 1 ? "" : "s"} in main Chrome.`,
        processed: results.length,
        results,
        activeSession: {
          id: "main-chrome",
          sessionName,
          startedAt: new Date().toISOString(),
          currentUrl: session.page.url(),
        },
      };
    } finally {
      await session.close();
    }
  }

  async applyRecordFromActiveSession(
    profile: CandidateProfile,
    recordId: string,
    options: { allowSubmit?: boolean } = {},
    sessionName = "default",
  ) {
    const session = this.requireActiveSession(sessionName);
    const store = new ApplicationStore();
    const record = store.get(recordId);
    if (!record) {
      throw new Error(`Application not found: ${recordId}`);
    }

    const runner = new IndeedApplicationRunner(profile, store, session.manager);
    const result = await runner.applyToRecordWithPage(session.page, record, options).catch((error: unknown) =>
      store.update(record.id, {
        status: "failed",
        lastStep: "active_runner_exception",
        failureReason: error instanceof Error ? error.message : String(error),
      }),
    );

    return {
      ok: true as const,
      sessionName,
      result,
      activeSession: this.toSummary(session),
    };
  }

  async applyRecordFromMainChrome(
    profile: CandidateProfile,
    recordId: string,
    options: { allowSubmit?: boolean } = {},
    sessionName = "default",
  ) {
    const session = await openMainChromeSession();
    const store = new ApplicationStore();
    const record = store.get(recordId);
    if (!record) {
      throw new Error(`Application not found: ${recordId}`);
    }

    try {
      const runner = new IndeedApplicationRunner(profile, store);
      const result = await runner.applyToRecordWithPage(session.page, record, options).catch((error: unknown) =>
        store.update(record.id, {
          status: "failed",
          lastStep: "main_chrome_runner_exception",
          failureReason: error instanceof Error ? error.message : String(error),
        }),
      );

      return {
        ok: true as const,
        sessionName,
        result,
        activeSession: {
          id: "main-chrome",
          sessionName,
          startedAt: new Date().toISOString(),
          currentUrl: session.page.url(),
        },
      };
    } finally {
      await session.close();
    }
  }

  async checkSavedSession(sessionName = "default") {
    const manager = new IndeedSessionManager(undefined, sessionName);
    try {
      return await manager.checkSession();
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return {
          ok: false as const,
          reason: "login" as const,
          message: `No saved Indeed session exists for "${sessionName}". Start a login handoff first.`,
        };
      }

      throw error;
    }
  }

  async diagnoseSavedSession(sessionName = "default") {
    const manager = new IndeedSessionManager(undefined, sessionName);
    try {
      return await manager.diagnoseSession();
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return {
          ok: false as const,
          reason: "login" as const,
          message: `No saved Indeed session exists for "${sessionName}". Start a login handoff first.`,
        };
      }

      throw error;
    }
  }

  private requireActiveSession(sessionName: string) {
    const session = this.activeSessions.get(sessionName);
    if (!session) {
      throw new Error(`No active Indeed handoff session found for "${sessionName}".`);
    }

    return session;
  }

  private async closeActiveSession(sessionName: string) {
    const existing = this.activeSessions.get(sessionName);
    if (!existing) return;

    this.activeSessions.delete(sessionName);
    await existing.close();
  }

  private toSummary(session: ActiveHandoffSession): HandoffSessionSummary {
    return {
      id: session.id,
      sessionName: session.sessionName,
      startedAt: session.startedAt,
      currentUrl: session.page.url(),
    };
  }
}
