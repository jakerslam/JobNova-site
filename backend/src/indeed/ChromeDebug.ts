import { spawn } from "node:child_process";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export type ChromeDebugStatus =
  | {
      ok: true;
      cdpUrl: string;
      browser: string;
      webSocketDebuggerUrl?: string;
    }
  | {
      ok: false;
      cdpUrl: string;
      message: string;
    };

const defaultChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

type MainChromeSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
};

export function getChromeDebugUrl() {
  return process.env.CHROME_CDP_URL ?? "http://127.0.0.1:9222";
}

export async function checkChromeDebugStatus(cdpUrl = getChromeDebugUrl()): Promise<ChromeDebugStatus> {
  try {
    const response = await fetch(new URL("/json/version", cdpUrl));
    if (!response.ok) {
      return {
        ok: false,
        cdpUrl,
        message: `Chrome DevTools responded with ${response.status} ${response.statusText}.`,
      };
    }

    const payload = (await response.json()) as {
      Browser?: string;
      webSocketDebuggerUrl?: string;
    };

    return {
      ok: true,
      cdpUrl,
      browser: payload.Browser ?? "Chrome",
      webSocketDebuggerUrl: payload.webSocketDebuggerUrl,
    };
  } catch {
    return {
      ok: false,
      cdpUrl,
      message:
        "Main Chrome is not reachable on the DevTools port. Quit Chrome fully, then launch it from JobNova or with the remote-debugging command.",
    };
  }
}

export async function launchMainChromeWithDebugging(cdpUrl = getChromeDebugUrl()) {
  const before = await checkChromeDebugStatus(cdpUrl);
  if (before.ok) {
    return {
      ...before,
      launched: false,
      message: "Main Chrome is already reachable through the DevTools port.",
    };
  }

  const url = new URL(cdpUrl);
  const port = url.port || "9222";
  const userDataDir = process.env.CHROME_USER_DATA_DIR ?? `${process.env.HOME}/Library/Application Support/Google/Chrome`;
  const chromePath = process.env.CHROME_PATH ?? defaultChromePath;

  const child = spawn(
    chromePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "https://www.indeed.com/",
    ],
    {
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();

  await new Promise((resolve) => setTimeout(resolve, 2000));
  const after = await checkChromeDebugStatus(cdpUrl);

  return {
    ...after,
    launched: after.ok,
    message: after.ok
      ? "Main Chrome launched with DevTools enabled. Log into Indeed there, keep an Indeed tab open, then import the session."
      : "Chrome did not expose the DevTools port. If Chrome was already open, quit it fully and try Launch Main Chrome again.",
  };
}

export async function openMainChromeSession(cdpUrl = getChromeDebugUrl()): Promise<MainChromeSession> {
  const status = await checkChromeDebugStatus(cdpUrl);
  if (!status.ok) {
    throw new Error(status.message);
  }

  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const pages = context.pages();
  const indeedPage = pages.find((page) => {
    try {
      return new URL(page.url()).hostname.includes("indeed.");
    } catch {
      return false;
    }
  });
  const page = indeedPage ?? (await context.newPage());

  return {
    browser,
    context,
    page,
    close: async () => undefined,
  };
}
