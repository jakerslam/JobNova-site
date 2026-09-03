import type { Page } from "playwright";
import type { ManualCheckResult } from "../workflow/types.js";
import { finalSubmitText, manualVerificationSelectors } from "./selectors.js";

const manualSignals = [
  { reason: "captcha", pattern: /captcha|verify you are human|human verification/i },
  { reason: "sms", pattern: /sms|text message|verification code|phone verification/i },
  { reason: "email", pattern: /email verification|check your email|verification email/i },
  { reason: "login", pattern: /sign in|log in|password/i },
] as const;

export async function detectManualCheckpoint(page: Page): Promise<ManualCheckResult> {
  const url = page.url();

  if (/secure\.indeed\.com\/auth|account\/login|\/login/i.test(url)) {
    return { ok: false, reason: "login", message: "Indeed is asking for login." };
  }

  const bodyText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");

  for (const selector of manualVerificationSelectors) {
    if ((await page.locator(selector).count().catch(() => 0)) > 0) {
      return { ok: false, reason: "captcha", message: `Manual verification selector detected: ${selector}` };
    }
  }

  for (const signal of manualSignals) {
    if (signal.pattern.test(bodyText)) {
      return {
        ok: false,
        reason: signal.reason,
        message: `Manual checkpoint detected: ${signal.reason}.`,
      };
    }
  }

  return { ok: true };
}

export async function detectUnknownRequiredFields(page: Page, knownFieldNames: string[]): Promise<ManualCheckResult> {
  const unknownRequiredLabels = await page.evaluate((knownNames) => {
    const known = knownNames.map((name) => name.toLowerCase());
    const controls = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"));

    return controls
      .filter((control) => control.required || control.getAttribute("aria-required") === "true")
      .map((control) => {
        const id = control.id;
        const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() : undefined;
        const name = control.name || control.getAttribute("aria-label") || label || control.getAttribute("placeholder") || control.type;
        return name.trim();
      })
      .filter((name) => name && !known.some((knownName) => name.toLowerCase().includes(knownName)));
  }, knownFieldNames);

  if (unknownRequiredLabels.length > 0) {
    return {
      ok: false,
      reason: "unknown_field",
      message: `Unknown required field(s): ${unknownRequiredLabels.join(", ")}`,
    };
  }

  return { ok: true };
}

export async function detectFinalReview(page: Page): Promise<ManualCheckResult> {
  const buttons = await page.locator("button").allTextContents().catch(() => []);
  const hasSubmitButton = buttons.some((label) => finalSubmitText.test(label));

  if (process.env.INDEED_REQUIRE_FINAL_REVIEW !== "false" && hasSubmitButton) {
    return {
      ok: false,
      reason: "review_required",
      message: "Final submit button detected. Manual review is required before submission.",
    };
  }

  return { ok: true };
}
