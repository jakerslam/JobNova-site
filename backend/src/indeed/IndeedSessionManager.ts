import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import { SessionStore } from "../storage/SessionStore.js";
import { detectManualCheckpoint } from "./IndeedManualCheck.js";

type ManagedSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

function shouldRunHeadless() {
  return process.env.INDEED_HEADLESS === "true";
}

export class IndeedSessionManager {
  constructor(private readonly sessionStore = new SessionStore()) {}

  async openFreshSession(): Promise<ManagedSession> {
    const browser = await chromium.launch({ headless: shouldRunHeadless() });
    const context = await browser.newContext();
    const page = await context.newPage();
    return { browser, context, page };
  }

  async openRestoredSession(): Promise<ManagedSession> {
    const storageState = await this.sessionStore.load();
    const browser = await chromium.launch({ headless: shouldRunHeadless() });
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    return { browser, context, page };
  }

  async save(context: BrowserContext) {
    await this.sessionStore.save(context);
  }

  async checkSession() {
    const session = await this.openRestoredSession();

    try {
      await session.page.goto("https://myjobs.indeed.com/", { waitUntil: "domcontentloaded" });
      const manualCheck = await detectManualCheckpoint(session.page);

      if (!manualCheck.ok) {
        return manualCheck;
      }

      return { ok: true as const };
    } finally {
      await session.browser.close();
    }
  }
}
