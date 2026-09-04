import { randomUUID } from "node:crypto";
import type { BrowserContext, Page } from "playwright";
import { detectManualCheckpoint } from "./IndeedManualCheck.js";
import { IndeedSessionManager } from "./IndeedSessionManager.js";

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
    await this.closeActiveSession(sessionName);

    return {
      sessionName,
      saved: true,
      closed: true,
      savedAt: new Date().toISOString(),
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

    return {
      ...this.toSummary(session),
      manualCheck,
    };
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
