import type { Page } from "playwright";
import type { ManualCheckResult } from "../workflow/types.js";
import { finalSubmitText, manualVerificationSelectors } from "./selectors.js";

const manualSignals = [
  { reason: "captcha", pattern: /captcha|verify you are human|human verification|security check|just a moment|checking your browser/i },
  { reason: "sms", pattern: /sms|text message|verification code|phone verification/i },
  { reason: "email", pattern: /email verification|check your email|verification email/i },
  { reason: "login", pattern: /sign in|log in|password/i },
] as const;

export async function detectManualCheckpoint(page: Page): Promise<ManualCheckResult> {
  const url = page.url();

  if (/secure\.indeed\.com\/auth|account\/login|\/login/i.test(url)) {
    return { ok: false, reason: "login", message: "Indeed is asking for login." };
  }

  const title = await page.title().catch(() => "");
  const checkpointText = await page.evaluate<string>(String.raw`(() => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };

    return Array.from(document.querySelectorAll("h1, h2, h3, [role='alert'], [role='dialog']"))
      .filter(isVisible)
      .map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean)
      .join("\n");
  })()`).catch(() => "");
  const signalText = `${title}\n${checkpointText}`;

  for (const selector of manualVerificationSelectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    let hasVisibleMatch = false;
    for (let index = 0; index < count; index += 1) {
      if (await locator.nth(index).isVisible().catch(() => false)) {
        hasVisibleMatch = true;
        break;
      }
    }
    if (hasVisibleMatch) {
      return { ok: false, reason: "captcha", message: `Manual verification selector detected: ${selector}` };
    }
  }

  for (const signal of manualSignals) {
    if (signal.pattern.test(signalText)) {
      return {
        ok: false,
        reason: signal.reason,
        message: `Manual checkpoint detected: ${signal.reason}.`,
      };
    }
  }

  return { ok: true };
}

export async function detectUnknownRequiredFields(page: Page): Promise<ManualCheckResult> {
  const incompleteRequiredLabels = await page.evaluate<string[]>(String.raw`(() => {
    const controls = Array.from(document.querySelectorAll("input, textarea, select"));
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const labelledText = (element) =>
      (element.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    const getLabel = (control) => {
      const group = control.closest("fieldset, [role='radiogroup'], [role='group']");
      const groupLabel = group?.querySelector("legend")?.textContent || group?.getAttribute("aria-label") || (group ? labelledText(group) : "");
      const directLabel = control.labels?.[0]?.textContent || control.getAttribute("aria-label") || labelledText(control);
      const placeholder = control instanceof HTMLSelectElement ? "" : control.placeholder;
      return (groupLabel || directLabel || control.name || placeholder || control.type)
        .replace(/\brequired\b/gi, "")
        .replace(/\s*\*\s*$/, "")
        .replace(/\s+/g, " ")
        .trim();
    };
    const isIncomplete = (control) => {
      if (control instanceof HTMLInputElement && control.type === "radio") {
        const group = control.name
          ? Array.from(document.querySelectorAll("input[type='radio'][name='" + CSS.escape(control.name) + "']"))
          : [control];
        return !group.some((option) => option.checked);
      }
      if (control instanceof HTMLInputElement && control.type === "checkbox") return !control.checked;
      if (control instanceof HTMLInputElement && control.type === "file") return !control.files?.length;
      return !control.value.trim();
    };
    const requiredControls = controls.filter((control) =>
      isVisible(control) &&
      !control.disabled &&
      (control.required || control.getAttribute("aria-required") === "true") &&
      isIncomplete(control),
    );
    const renderedRequiredRadios = Array.from(document.querySelectorAll("[role='radiogroup'], fieldset"))
      .filter(isVisible)
      .filter((group) => {
        const text = group.innerText.replace(/\s+/g, " ").trim();
        return group.getAttribute("aria-required") === "true" || /(?:^|\s)\*(?:\s|$)|\brequired\b|choose an option to continue/i.test(text);
      })
      .flatMap((group) => {
        const radios = Array.from(group.querySelectorAll("input[type='radio']")).filter(isVisible);
        return radios.length && !radios.some((radio) => radio.checked) ? [radios[0]] : [];
      });

    return [...requiredControls, ...renderedRequiredRadios]
      .map(getLabel)
      .filter(Boolean)
      .filter((label, index, labels) => labels.indexOf(label) === index);
  })()`);

  if (incompleteRequiredLabels.length > 0) {
    return {
      ok: false,
      reason: "unknown_field",
      message: `Required field(s) still need input: ${incompleteRequiredLabels.join(", ")}`,
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
