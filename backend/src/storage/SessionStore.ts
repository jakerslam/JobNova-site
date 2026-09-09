import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext } from "playwright";
import { decryptText, encryptText } from "./crypto.js";

type BrowserStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

const indeedCookiePattern = /(^|\.)indeed\./i;

export class SessionStore {
  private readonly sessionDir: string;

  constructor(sessionDir = process.env.INDEED_SESSION_DIR ?? "./data/sessions") {
    this.sessionDir = path.resolve(sessionDir);
  }

  private getSessionPath(sessionName = process.env.INDEED_SESSION_NAME ?? "default") {
    return path.join(this.sessionDir, `${sessionName}.storage-state.enc`);
  }

  async save(context: BrowserContext, sessionName?: string) {
    await mkdir(this.sessionDir, { recursive: true });
    const storageState = await context.storageState();
    await this.saveState(storageState, sessionName);
  }

  async saveState(storageState: BrowserStorageState, sessionName?: string) {
    await mkdir(this.sessionDir, { recursive: true });
    const encrypted = encryptText(JSON.stringify(storageState, null, 2));
    await writeFile(this.getSessionPath(sessionName), encrypted, "utf8");
  }

  async load(sessionName?: string): Promise<BrowserStorageState> {
    const encrypted = await readFile(this.getSessionPath(sessionName), "utf8");
    return JSON.parse(decryptText(encrypted)) as BrowserStorageState;
  }

  async inspect(sessionName?: string) {
    const state = await this.load(sessionName);
    const cookies = state.cookies ?? [];
    const indeedCookies = cookies.filter((cookie) => indeedCookiePattern.test(cookie.domain.replace(/^\./, "")));
    const domains = Array.from(new Set(cookies.map((cookie) => cookie.domain))).sort();
    const indeedDomains = Array.from(new Set(indeedCookies.map((cookie) => cookie.domain))).sort();

    return {
      cookieCount: cookies.length,
      indeedCookieCount: indeedCookies.length,
      originCount: state.origins?.length ?? 0,
      domains,
      indeedDomains,
      indeedCookieNames: Array.from(new Set(indeedCookies.map((cookie) => cookie.name))).sort(),
      hasIndeedCookies: indeedCookies.length > 0,
    };
  }
}
