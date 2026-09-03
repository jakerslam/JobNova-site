import type { Page } from "playwright";
import { ApplicationStore } from "../storage/ApplicationStore.js";
import type { ApplicationRecord, CandidateProfile } from "../workflow/types.js";
import { IndeedSessionManager } from "./IndeedSessionManager.js";
import { detectFinalReview, detectManualCheckpoint, detectUnknownRequiredFields } from "./IndeedManualCheck.js";
import { applyButtonSelectors, nextButtonSelectors } from "./selectors.js";

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

  async applyPending(limit: number) {
    const pendingRecords = this.store.listPending(limit);
    const results: ApplicationRecord[] = [];

    for (const record of pendingRecords) {
      results.push(await this.applyToRecord(record));
    }

    return results;
  }

  async applyToRecord(record: ApplicationRecord) {
    let session: Awaited<ReturnType<IndeedSessionManager["openRestoredSession"]>> | undefined;

    try {
      const updated = this.store.update(record.id, {
        status: "in_progress",
        lastStep: "opened_job",
        manualActionReason: undefined,
        failureReason: undefined,
      });

      session = await this.sessionManager.openRestoredSession();
      await session.page.goto(record.jobUrl, { waitUntil: "domcontentloaded" });

      const initialManualCheck = await detectManualCheckpoint(session.page);
      if (!initialManualCheck.ok) {
        return this.pause(updated.id, initialManualCheck.reason, initialManualCheck.message, "manual_checkpoint_before_apply");
      }

      const openedApplication = await this.clickFirstVisible(session.page, applyButtonSelectors);
      if (!openedApplication) {
        return this.store.update(updated.id, {
          status: "skipped",
          lastStep: "apply_button_not_found",
          failureReason: "No recognizable Indeed apply button was found.",
        });
      }

      await session.page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await this.fillKnownFields(session.page);

      const unknownFieldCheck = await detectUnknownRequiredFields(session.page, this.knownFieldNames());
      if (!unknownFieldCheck.ok) {
        return this.pause(updated.id, unknownFieldCheck.reason, unknownFieldCheck.message, "unknown_required_fields");
      }

      const finalReview = await detectFinalReview(session.page);
      if (!finalReview.ok) {
        return this.pause(updated.id, finalReview.reason, finalReview.message, "final_review_guard");
      }

      const advanced = await this.clickFirstVisible(session.page, nextButtonSelectors);
      if (!advanced) {
        return this.pause(updated.id, "review_required", "No safe next step was detected after filling known fields.", "review_required");
      }

      await session.page.waitForLoadState("domcontentloaded").catch(() => undefined);

      return this.store.update(updated.id, {
        status: "manual_action_required",
        lastStep: "review_required_after_step",
        manualActionReason: "review_required",
        failureReason: "Stopped after one safe application step for manual review.",
      });
    } catch (error) {
      return this.store.update(record.id, {
        status: "manual_action_required",
        lastStep: "session_or_runner_exception",
        manualActionReason: "login",
        failureReason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await session?.browser.close();
    }
  }

  private async fillKnownFields(page: Page) {
    const fullName = `${this.profile.firstName} ${this.profile.lastName}`;
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

    const fileInputs = page.locator("input[type='file']");
    const uploadCount = await fileInputs.count().catch(() => 0);
    for (let index = 0; index < uploadCount; index += 1) {
      await fileInputs.nth(index).setInputFiles(this.profile.resumePath).catch(() => undefined);
    }
  }

  private knownFieldNames() {
    return [
      "first name",
      "last name",
      "full name",
      "name",
      "email",
      "phone",
      "mobile",
      "city",
      "location",
      "linkedin",
      "portfolio",
      "website",
      "github",
      "resume",
      "cv",
    ];
  }

  private async clickFirstVisible(page: Page, selectors: string[]) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if ((await locator.count().catch(() => 0)) === 0) continue;
      if (!(await locator.isVisible().catch(() => false))) continue;
      await locator.click();
      return true;
    }

    return false;
  }

  private pause(id: string, reason: ApplicationRecord["manualActionReason"], message: string, lastStep: string) {
    return this.store.update(id, {
      status: "manual_action_required",
      lastStep,
      manualActionReason: reason,
      failureReason: message,
    });
  }
}
