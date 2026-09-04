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
  const client = await CDP(parseCdpUrl(cdpUrl));

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

    await new SessionStore().saveState(
      {
        cookies,
        origins: [],
      },
      sessionName,
    );

    return {
      cookieCount: cookies.length,
      originCount: 0,
    };
  } finally {
    await client.close();
  }
}
