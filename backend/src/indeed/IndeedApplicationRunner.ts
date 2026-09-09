import type { Page } from "playwright";
import { ApplicationStore } from "../storage/ApplicationStore.js";
import type { ApplicationRecord, CandidateProfile } from "../workflow/types.js";
import { IndeedSessionManager } from "./IndeedSessionManager.js";
import { detectFinalReview, detectManualCheckpoint, detectUnknownRequiredFields } from "./IndeedManualCheck.js";
import { applyButtonSelectors, finalSubmitButtonSelectors, nextButtonSelectors } from "./selectors.js";

type ApplyOptions = {
  allowSubmit?: boolean;
  maxSteps?: number;
  confirmationTimeoutMs?: number;
};

export class IndeedApplicationRunner {
  constructor(
    private readonly profile: CandidateProfile,
    private readonly store = new ApplicationStore(),
    private readonly sessionManager = new IndeedSessionManager(),
  ) {}

  summarizePlannedFields() {
    return {
      name: `${this.profile.firstName} ${this.profile.lastName}`,
      emailConfigured: Boolean(this.profile.email),
      phoneConfigured: Boolean(this.profile.phone),
      resumeConfigured: Boolean(this.profile.resumePath),
      workExperienceCount: this.profile.workExperience.length,
      educationCount: this.profile.education.length,
      answerCount: Object.keys(this.profile.answers).length,
    };
  }

  async applyPending(limit: number, options: ApplyOptions = {}) {
    const pendingRecords = this.store.listPending(limit);
    const results: ApplicationRecord[] = [];

    for (const record of pendingRecords) {
      results.push(await this.applyToRecord(record, options));
    }

    return results;
  }

  async applyToRecord(record: ApplicationRecord, options: ApplyOptions = {}) {
    let session: Awaited<ReturnType<IndeedSessionManager["openRestoredSession"]>> | undefined;

    try {
      if (!isSafeApplicationCandidate(record)) {
        return this.store.update(record.id, {
          status: "skipped",
          lastStep: "invalid_job_metadata",
          failureReason: "Skipped because the queued record does not look like a real Indeed job application candidate.",
        });
      }

      const updated = this.store.update(record.id, {
        status: "in_progress",
        lastStep: "opened_job",
        manualActionReason: undefined,
        manualActionUrl: undefined,
        failureReason: undefined,
      });

      session = await this.sessionManager.openRestoredSession();
      return await this.applyToRecordWithPage(session.page, updated, options);
    } catch (error) {
      const missingSession =
        error instanceof Error && "code" in error && error.code === "ENOENT";

      return this.store.update(record.id, {
        status: "manual_action_required",
        lastStep: "session_or_runner_exception",
        manualActionReason: "login",
        failureReason: missingSession
          ? "No saved Indeed session exists. Complete and save the login handoff first."
          : error instanceof Error
            ? error.message
            : String(error),
      });
    } finally {
      await session?.close();
    }
  }

  async applyToRecordWithPage(page: Page, record: ApplicationRecord, options: ApplyOptions = {}) {
    if (!isSafeApplicationCandidate(record)) {
      return this.store.update(record.id, {
        status: "skipped",
        lastStep: "invalid_job_metadata",
        failureReason: "Skipped because the queued record does not look like a real Indeed job application candidate.",
      });
    }

    const updated = this.store.update(record.id, {
      status: "in_progress",
      lastStep: "opened_job",
      manualActionReason: undefined,
      manualActionUrl: undefined,
      failureReason: undefined,
    });
    const maxSteps = options.maxSteps ?? 8;

    let currentPage = page;

    await currentPage.goto(record.jobUrl, { waitUntil: "domcontentloaded" });

    const initialManualCheck = await detectManualCheckpoint(currentPage);
    if (!initialManualCheck.ok) {
      return this.pause(updated.id, initialManualCheck.reason, initialManualCheck.message, "manual_checkpoint_before_apply", currentPage.url());
    }

    const openedApplication = await this.clickFirstVisible(currentPage, applyButtonSelectors);
    if (!openedApplication) {
      return this.store.update(updated.id, {
        status: "skipped",
        lastStep: "apply_button_not_found",
        failureReason: "No recognizable Indeed apply button was found.",
      });
    }
    currentPage = openedApplication;

    await currentPage.waitForLoadState("domcontentloaded").catch(() => undefined);

    for (let step = 1; step <= maxSteps; step += 1) {
      const resumeUploadFailure = await this.fillKnownFields(currentPage);
      if (resumeUploadFailure) {
        return this.pause(updated.id, "unknown_field", resumeUploadFailure, `resume_upload_required_${step}`, currentPage.url());
      }

      const manualCheck = await detectManualCheckpoint(currentPage);
      if (!manualCheck.ok) {
        return this.pause(updated.id, manualCheck.reason, manualCheck.message, `manual_checkpoint_step_${step}`, currentPage.url());
      }

      const unknownFieldCheck = await detectUnknownRequiredFields(currentPage);
      if (!unknownFieldCheck.ok) {
        return this.pause(updated.id, unknownFieldCheck.reason, unknownFieldCheck.message, `unknown_required_fields_step_${step}`, currentPage.url());
      }

      const hasFinalSubmitButton = await this.hasVisibleSelector(currentPage, finalSubmitButtonSelectors);
      if (hasFinalSubmitButton) {
        if (!options.allowSubmit) {
          return this.pause(
            updated.id,
            "review_required",
            "Final submit button detected. Manual review is required before submission.",
            "final_review_guard",
            currentPage.url(),
          );
        }

        currentPage = (await this.clickFirstVisible(currentPage, finalSubmitButtonSelectors)) ?? currentPage;

        const postSubmitOutcome = await this.waitForPostSubmitOutcome(currentPage, options.confirmationTimeoutMs);
        if (postSubmitOutcome.kind === "manual") {
          return this.pause(
            updated.id,
            postSubmitOutcome.check.reason,
            postSubmitOutcome.check.message,
            "manual_checkpoint_after_submit",
            currentPage.url(),
          );
        }
        if (postSubmitOutcome.kind !== "confirmed") {
          return this.pause(
            updated.id,
            "review_required",
            "The final button was clicked, but no unambiguous Indeed confirmation was observed.",
            "submission_clicked_without_confirmation",
            currentPage.url(),
          );
        }

        return this.store.update(updated.id, {
          status: "submitted",
          lastStep: "submitted",
          manualActionReason: undefined,
          manualActionUrl: undefined,
          failureReason: undefined,
          submittedAt: new Date().toISOString(),
        });
      }

      const finalReview = await detectFinalReview(currentPage);
      if (!finalReview.ok) {
        return this.pause(updated.id, finalReview.reason, finalReview.message, "final_review_guard", currentPage.url());
      }

      const advanced = await this.clickFirstVisible(currentPage, nextButtonSelectors);
      if (!advanced) {
        return this.pause(updated.id, "review_required", "No safe next step was detected after filling known fields.", "review_required", currentPage.url());
      }
      currentPage = advanced;

      await currentPage.waitForLoadState("domcontentloaded").catch(() => undefined);
      await currentPage.waitForTimeout(700);
    }

    return this.store.update(updated.id, {
      status: "manual_action_required",
      lastStep: "max_steps_reached",
      manualActionReason: "review_required",
      manualActionUrl: currentPage.url(),
      failureReason: "Stopped after the maximum number of guarded application steps for manual review.",
    });
  }

  private async fillKnownFields(page: Page) {
    const fullName = `${this.profile.firstName} ${this.profile.lastName}`;
    const latestWork = this.profile.workExperience[0];
    const latestEducation = this.profile.education[0];
    const fieldMap = [
      { labels: ["first name"], value: this.profile.firstName },
      { labels: ["last name"], value: this.profile.lastName },
      { labels: ["full name", "name"], value: fullName },
      { labels: ["email"], value: this.profile.email },
      { labels: ["phone", "mobile"], value: this.profile.phone },
      { labels: ["city", "location"], value: this.profile.location },
      { labels: ["linkedin"], value: this.profile.links.linkedIn },
      { labels: ["portfolio", "website"], value: this.profile.links.portfolio },
      { labels: ["github"], value: this.profile.links.github },
      { labels: ["current job title", "most recent job title", "current position"], value: latestWork?.title },
      { labels: ["current employer", "most recent employer", "current company"], value: latestWork?.company },
      { labels: ["school", "university", "college"], value: latestEducation?.school },
      { labels: ["degree"], value: latestEducation?.degree },
      { labels: ["field of study", "major"], value: latestEducation?.field },
    ];

    for (const field of fieldMap) {
      if (!field.value) continue;

      for (const label of field.labels) {
        const locator = page.getByLabel(new RegExp(label, "i")).first();
        if ((await locator.count().catch(() => 0)) > 0) {
          await locator.fill(field.value).catch(() => undefined);
        }
      }
    }

    await this.fillKnownAnswerFields(page);

    const fileInputs = page.locator("input[type='file']");
    const uploadCount = await fileInputs.count().catch(() => 0);
    for (let index = 0; index < uploadCount; index += 1) {
      try {
        await fileInputs.nth(index).setInputFiles(this.profile.resumePath);
      } catch {
        return "Indeed requested a resume upload, but the configured resume could not be attached.";
      }
    }

    return undefined;
  }

  private async fillKnownAnswerFields(page: Page) {
    const answerFields = this.knownAnswerFields();

    for (const field of answerFields) {
      for (const label of field.labels) {
        const locator = page.getByLabel(new RegExp(label, "i")).first();
        if ((await locator.count().catch(() => 0)) === 0) continue;

        const tagName = await locator.evaluate((element) => element.tagName.toLowerCase()).catch(() => "");
        const type = await locator.evaluate((element) => ("type" in element ? String(element.type).toLowerCase() : "")).catch(() => "");

        if (tagName === "select") {
          await locator
            .evaluate((element, value) => {
              const select = element as HTMLSelectElement;
              const option = Array.from(select.options).find(
                (candidate) => candidate.label.toLowerCase() === value.toLowerCase() || candidate.value.toLowerCase() === value.toLowerCase(),
              );
              if (!option) return;

              select.value = option.value;
              select.dispatchEvent(new Event("input", { bubbles: true }));
              select.dispatchEvent(new Event("change", { bubbles: true }));
            }, field.value)
            .catch(() => undefined);
          continue;
        }

        if (type === "checkbox" || type === "radio") {
          if (/^(yes|true)$/i.test(field.value)) {
            await locator.check().catch(() => undefined);
          } else if (/^(no|false)$/i.test(field.value)) {
            await locator.uncheck().catch(() => undefined);
          }
          continue;
        }

        await locator.fill(field.value).catch(() => undefined);
      }
    }
  }

  private knownAnswerFields() {
    const aliasMap: Record<string, string[]> = {
      authorized_to_work_us: ["authorized to work", "legally authorized", "work in the united states", "work in the us"],
      requires_sponsorship: ["require sponsorship", "requires sponsorship", "need sponsorship", "visa sponsorship", "sponsorship"],
      security_clearance: ["security clearance", "clearance"],
      willing_to_relocate: ["relocate", "relocation"],
      willing_to_commute: ["commute"],
    };

    return Object.entries(this.profile.answers).flatMap(([key, value]) => {
      const labels = aliasMap[key] ?? [key.replace(/_/g, " ")];
      return value ? [{ labels, value }] : [];
    });
  }

  private async clickFirstVisible(page: Page, selectors: string[]) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if ((await locator.count().catch(() => 0)) === 0) continue;
      if (!(await locator.isVisible().catch(() => false))) continue;
      const popupPromise = page.waitForEvent("popup", { timeout: 2500 }).catch(() => null);
      await locator.click();
      const popup = await popupPromise;
      if (popup) {
        await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
        return popup;
      }
      return page;
    }

    return null;
  }

  private async hasVisibleSelector(page: Page, selectors: string[]) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if ((await locator.count().catch(() => 0)) === 0) continue;
      if (await locator.isVisible().catch(() => false)) return true;
    }

    return false;
  }

  private async waitForPostSubmitOutcome(page: Page, timeoutMs = 8_000): Promise<
    | { kind: "confirmed" }
    | { kind: "manual"; check: Exclude<Awaited<ReturnType<typeof detectManualCheckpoint>>, { ok: true }> }
    | { kind: "unconfirmed" }
  > {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.hasSubmissionConfirmation(page)) return { kind: "confirmed" };
      const manualCheck = await detectManualCheckpoint(page);
      if (!manualCheck.ok) return { kind: "manual", check: manualCheck };
      await page.waitForTimeout(250);
    }
    return { kind: "unconfirmed" };
  }

  private async hasSubmissionConfirmation(page: Page) {
    const confirmationPattern = /^(?:your\s+)?application\s+(?:has been\s+)?(?:submitted|sent|completed)|^thanks for applying[!.]?$|^you(?:'ve| have) applied(?: successfully)?[!.]?$/i;
    const labels = await page
      .locator("h1, h2, [role='status'], [role='alert'], [data-testid*='confirmation' i], [data-testid*='success' i]")
      .allTextContents()
      .catch(() => []);
    return labels.some((label) => confirmationPattern.test(label.replace(/\s+/g, " ").trim()));
  }

  private pause(
    id: string,
    reason: ApplicationRecord["manualActionReason"],
    message: string,
    lastStep: string,
    manualActionUrl?: string,
  ) {
    return this.store.update(id, {
      status: "manual_action_required",
      lastStep,
      manualActionReason: reason,
      manualActionUrl,
      failureReason: message,
    });
  }
}

function isSafeApplicationCandidate(record: ApplicationRecord) {
  const text = `${record.title} ${record.company}`.toLowerCase();

  if (!record.jobUrl.includes("indeed.com/")) return false;
  if (!/\/(?:viewjob|rc\/clk|pagead\/clk)\b/i.test(record.jobUrl)) return false;
  if (record.jobUrl.includes("/addlLoc/redirect")) return false;
  if (/indeed home|view similar jobs|unknown company|window\.performance|function\s*\(|__initial_state__|mosaic/.test(text)) return false;

  return Boolean(record.title.trim() && record.company.trim());
}
