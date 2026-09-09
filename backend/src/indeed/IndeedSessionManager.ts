import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { SessionStore } from "../storage/SessionStore.js";
import { detectManualCheckpoint } from "./IndeedManualCheck.js";

type ManagedSession = {
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
};

type BrowserStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

function shouldRunHeadless() {
  return process.env.INDEED_HEADLESS === "true";
}

function getBrowserChannel() {
  return process.env.INDEED_BROWSER_CHANNEL || undefined;
}

function shouldUsePersistentProfile() {
  return process.env.INDEED_USE_PERSISTENT_PROFILE === "true";
}

function shouldRestoreWithPersistentProfile() {
  return process.env.INDEED_RESTORE_WITH_PERSISTENT_PROFILE === "true";
}

function getPersistentProfileDir(sessionName: string) {
  const root = process.env.INDEED_BROWSER_PROFILE_DIR ?? "./data/browser-profile";
  return path.resolve(root, sessionName);
}

export class IndeedSessionManager {
  constructor(
    private readonly sessionStore = new SessionStore(),
    private readonly sessionName = process.env.INDEED_SESSION_NAME ?? "default",
  ) {}

  async openFreshSession(): Promise<ManagedSession> {
    return this.openSession(undefined, shouldUsePersistentProfile());
  }

  async openRestoredSession(): Promise<ManagedSession> {
    const storageState = await this.sessionStore.load(this.sessionName);
    return this.openSession(storageState, shouldRestoreWithPersistentProfile());
  }

  async save(context: BrowserContext) {
    await this.sessionStore.save(context, this.sessionName);
  }

  async checkSession() {
    const session = await this.openRestoredSession();

    try {
      await session.page.goto("https://myjobs.indeed.com/", { waitUntil: "domcontentloaded" });
      const currentUrl = session.page.url();
      const title = await session.page.title().catch(() => "");
      const manualCheck = await detectManualCheckpoint(session.page);

      if (!manualCheck.ok) {
        return {
          ...manualCheck,
          currentUrl,
          title,
        };
      }

      return {
        ok: true as const,
        currentUrl,
        title,
      };
    } finally {
      await session.close();
    }
  }

  async diagnoseSession() {
    const storage = await this.sessionStore.inspect(this.sessionName);
    const session = await this.openRestoredSession();

    try {
      const probes = [];
      for (const url of ["https://www.indeed.com/", "https://myjobs.indeed.com/"]) {
        await session.page.goto(url, { waitUntil: "domcontentloaded" });
        const manualCheck = await detectManualCheckpoint(session.page);
        probes.push({
          targetUrl: url,
          currentUrl: session.page.url(),
          title: await session.page.title().catch(() => ""),
          manualCheck,
        });
      }

      return {
        ok: probes.every((probe) => probe.manualCheck.ok),
        storage,
        probes,
      };
    } finally {
      await session.close();
    }
  }

  private async openSession(storageState?: BrowserStorageState, usePersistentProfile = false): Promise<ManagedSession> {
    if (usePersistentProfile) {
      const profileDir = getPersistentProfileDir(this.sessionName);
      await mkdir(profileDir, { recursive: true });
      const context = await chromium.launchPersistentContext(profileDir, {
        channel: getBrowserChannel(),
        headless: shouldRunHeadless(),
      });
      const page = context.pages()[0] ?? (await context.newPage());

      return { context, page, close: () => context.close() };
    }

    const browser = await chromium.launch({ channel: getBrowserChannel(), headless: shouldRunHeadless() });
    const context = await browser.newContext(storageState ? { storageState } : undefined);
    const page = await context.newPage();

    return {
      context,
      page,
      close: async () => {
        await browser.close();
      },
    };
  }
}
