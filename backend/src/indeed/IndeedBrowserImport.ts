import CDP from "chrome-remote-interface";
import { SessionStore } from "../storage/SessionStore.js";

type CdpCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  size?: number;
  httpOnly?: boolean;
  secure?: boolean;
  session?: boolean;
  sameSite?: "Strict" | "Lax" | "None" | "Extended" | "Unspecified";
};

type CdpTarget = {
  id: string;
  type: string;
  url: string;
};

type StorageOrigin = {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
};

const indeedOriginPattern = /(^|\.)indeed\.(com|[a-z.]+)$/i;

function parseCdpUrl(cdpUrl: string) {
  const url = new URL(cdpUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 9222),
    secure: url.protocol === "https:",
  };
}

function isIndeedCookie(cookie: CdpCookie) {
  return indeedOriginPattern.test(cookie.domain.replace(/^\./, ""));
}

function isIndeedUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return indeedOriginPattern.test(url.hostname);
  } catch {
    return false;
  }
}

function normalizeSameSite(cookie: CdpCookie) {
  if (cookie.sameSite === "Strict" || cookie.sameSite === "Lax" || cookie.sameSite === "None") {
    return cookie.sameSite;
  }

  return "Lax";
}

export async function importIndeedSessionFromChrome(
  cdpUrl = process.env.CHROME_CDP_URL ?? "http://127.0.0.1:9222",
  sessionName = process.env.INDEED_SESSION_NAME ?? "default",
) {
  const cdp = parseCdpUrl(cdpUrl);
  const client = await CDP(cdp);

  try {
    const { Network } = client;
    await Network.enable();
    const allCookies = (await Network.getAllCookies()).cookies as CdpCookie[];
    const cookies = allCookies.filter(isIndeedCookie).map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || "/",
      expires: cookie.expires && cookie.expires > 0 ? cookie.expires : -1,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
      sameSite: normalizeSameSite(cookie),
    }));

    if (cookies.length === 0) {
      throw new Error("No Indeed cookies were found in the connected Chrome session.");
    }

    const origins = await collectIndeedStorageOrigins(cdpUrl);

    await new SessionStore().saveState(
      {
        cookies,
        origins,
      },
      sessionName,
    );

    return {
      cookieCount: cookies.length,
      originCount: origins.length,
      origins: origins.map((origin) => ({
        origin: origin.origin,
        localStorageKeyCount: origin.localStorage.length,
      })),
    };
  } finally {
    await client.close();
  }
}

async function collectIndeedStorageOrigins(cdpUrl: string): Promise<StorageOrigin[]> {
  const cdp = parseCdpUrl(cdpUrl);
  const targets = await fetchTargets(cdpUrl);
  const pageTargets = targets.filter((target) => target.type === "page" && isIndeedUrl(target.url));
  const origins = new Map<string, StorageOrigin>();

  for (const target of pageTargets) {
    const targetClient = await CDP({ ...cdp, target: target.id });
    try {
      const { Runtime } = targetClient;
      await Runtime.enable();
      const result = await Runtime.evaluate({
        expression: `(() => {
          try {
            return {
              origin: window.location.origin,
              localStorage: Object.entries(window.localStorage).map(([name, value]) => ({ name, value }))
            };
          } catch (error) {
            return { origin: window.location.origin, localStorage: [] };
          }
        })()`,
        returnByValue: true,
      });
      const value = result.result.value as StorageOrigin | undefined;
      if (value?.origin && isIndeedUrl(value.origin)) {
        origins.set(value.origin, value);
      }
    } finally {
      await targetClient.close();
    }
  }

  return Array.from(origins.values());
}

async function fetchTargets(cdpUrl: string): Promise<CdpTarget[]> {
  const url = new URL("/json/list", cdpUrl);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to list Chrome debug targets: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as CdpTarget[];
}
