import { chromium, type Page } from "playwright";
import path from "node:path";

const runnerPath = path.resolve(process.cwd(), "../extension/indeed-runner.js");
const manualActionPolicyPath = path.resolve(process.cwd(), "../extension/manual-action-policy.js");
const profile = {
  firstName: "Test",
  lastName: "Candidate",
  email: "test@example.com",
  phone: "555-0100",
  location: "Austin, TX",
  links: { linkedIn: "https://linkedin.com/in/test", portfolio: "https://example.com" },
  workExperience: [{ company: "Example Employer", title: "Account Executive" }],
  education: [{ school: "Example University", degree: "Bachelor of Science", field: "Computer Science" }],
  answers: { authorized_to_work_us: "Yes" },
};

async function createPage(html: string, url = "https://www.indeed.com/viewjob?jk=runner-test") {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript({ content: buildChromeStub(profile) });
  await page.route(url, async (route) => {
    await route.fulfill({ contentType: "text/html", body: html });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ path: runnerPath });
  return { browser, page };
}

async function runCommand(page: Page, command: Partial<RunnerCommand> = {}) {
  const fullCommand = {
    id: "runner-command",
    applicationId: "application",
    jobUrl: "https://www.indeed.com/viewjob?jk=runner-test",
    state: "leased",
    allowSubmit: false,
    agentId: "test-agent",
    leaseToken: "test-token",
    ...command,
  };
  await page.evaluate((message) => (window as JobNovaTestWindow).__jobnovaDeliver(message), {
    type: "JOBNOVA_RUN_INDEED_COMMAND",
    command: fullCommand,
  });
  return fullCommand;
}

async function waitForReport(page: Page, status: string, lastStep?: string) {
  const expected = { status, lastStep };
  await page.waitForFunction(
    (candidate) => (window as JobNovaTestWindow).__jobnovaReports.some(
      (report) => report.status === candidate.status && (!candidate.lastStep || report.lastStep === candidate.lastStep),
    ),
    expected,
  );
  return page.evaluate(
    (candidate) => {
      const reports = (window as JobNovaTestWindow).__jobnovaReports.filter(
        (report) => report.status === candidate.status && (!candidate.lastStep || report.lastStep === candidate.lastStep),
      );
      return reports[reports.length - 1];
    },
    expected,
  );
}

async function testLoginPause() {
  const { browser, page } = await createPage("<h1>Sign in to Indeed</h1>", "https://secure.indeed.com/auth");
  try {
    await runCommand(page);
    const report = await waitForReport(page, "manual_action_required");
    assertEqual(report?.manualActionReason, "login", "login pause reason");
  } finally {
    await browser.close();
  }
}

async function testCaptchaPause() {
  const { browser, page } = await createPage("<h1>Verify you are human</h1><div>Cloudflare challenge</div>");
  try {
    await runCommand(page);
    const report = await waitForReport(page, "manual_action_required");
    assertEqual(report?.manualActionReason, "captcha", "CAPTCHA pause reason");
  } finally {
    await browser.close();
  }
}

async function testTransientCaptchaDoesNotPause() {
  const { browser, page } = await createPage(`
    <h1 id="checkpoint">Verify you are human</h1>
    <script>
      setTimeout(() => {
        document.body.innerHTML = '<h1>Software Engineer</h1><button type="button">Apply with Indeed</button>';
      }, 50);
    </script>`);
  try {
    await runCommand(page);
    const report = await waitForReport(page, "manual_action_required");
    assertEqual(report?.manualActionReason, "review_required", "resolved interstitial reaches guarded application flow");
    const reports = await page.evaluate(() => (window as JobNovaTestWindow).__jobnovaReports);
    assertEqual(
      reports.some((candidate) => candidate.manualActionReason === "captcha"),
      false,
      "transient verification surface is not reported as a persistent CAPTCHA",
    );
  } finally {
    await browser.close();
  }
}

async function testManualActionRevealPolicy() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.addScriptTag({ path: manualActionPolicyPath });
    const results = await page.evaluate(() => {
      const policy = (globalThis as typeof globalThis & {
        JobNovaManualActionPolicy: { shouldRevealManualAction: (report: Record<string, unknown>) => boolean };
      }).JobNovaManualActionPolicy;
      return {
        captcha: policy.shouldRevealManualAction({ status: "manual_action_required", manualActionReason: "captcha" }),
        login: policy.shouldRevealManualAction({ status: "manual_action_required", manualActionReason: "login" }),
        browserOnlyField: policy.shouldRevealManualAction({ status: "manual_action_required", manualActionReason: "unknown_field" }),
        inAppQuestion: policy.shouldRevealManualAction({
          status: "manual_action_required",
          manualActionReason: "unknown_field",
          manualQuestion: { label: "Relocate?" },
        }),
        review: policy.shouldRevealManualAction({ status: "manual_action_required", manualActionReason: "review_required" }),
      };
    });
    assertEqual(results.captcha, true, "persistent CAPTCHA reveals Indeed");
    assertEqual(results.login, true, "login reveals Indeed");
    assertEqual(results.browserOnlyField, true, "browser-only unknown field reveals Indeed");
    assertEqual(results.inAppQuestion, false, "relayable question stays in JobNova");
    assertEqual(results.review, false, "generic review state stays in JobNova");
  } finally {
    await browser.close();
  }
}

async function testNormalSignInHeaderDoesNotPauseLogin() {
  const { browser, page } = await createPage("<header><a>Sign in</a><span>Indeed</span></header><h1>Software Engineer</h1>");
  try {
    await runCommand(page);
    const report = await waitForReport(page, "skipped");
    assertEqual(report?.lastStep, "apply_button_not_found", "normal sign-in header is not a login checkpoint");
    const reports = await page.evaluate(() => (window as JobNovaTestWindow).__jobnovaReports);
    assertEqual(
      reports.some((candidate) => candidate.manualActionReason === "login"),
      false,
      "normal sign-in header does not report login required",
    );
  } finally {
    await browser.close();
  }
}

async function testDescriptionTextDoesNotConfirmSubmission() {
  const { browser, page } = await createPage(
    "<h1>Software Engineer</h1><p>You will receive an email after your application has been submitted.</p>",
  );
  try {
    await runCommand(page);
    await waitForReport(page, "skipped");
    const reports = await page.evaluate(() => (window as JobNovaTestWindow).__jobnovaReports);
    assertEqual(reports.some((candidate) => candidate.status === "submitted"), false, "description prose is not submission proof");
  } finally {
    await browser.close();
  }
}

async function testDescriptionTextDoesNotTriggerCaptcha() {
  const { browser, page } = await createPage(
    "<h1>Software Engineer</h1><p>You will improve Cloudflare integrations and human verification documentation.</p>",
  );
  try {
    await runCommand(page);
    const report = await waitForReport(page, "skipped");
    assertEqual(report?.lastStep, "apply_button_not_found", "description prose is not a CAPTCHA checkpoint");
    const reports = await page.evaluate(() => (window as JobNovaTestWindow).__jobnovaReports);
    assertEqual(reports.some((candidate) => candidate.manualActionReason === "captcha"), false, "description does not report CAPTCHA");
  } finally {
    await browser.close();
  }
}

async function testApplyWithIndeedEndToEnd() {
  const { browser, page } = await createPage(`
    <h1>Software Engineer</h1>
    <button type="button" id="start">Apply with Indeed</button>
    <script>
      document.querySelector('#start').addEventListener('click', () => {
        document.body.innerHTML = '<form><label>Email <input type="email" aria-label="Email" required></label><button type="submit" id="submit">Submit application</button></form>';
        document.querySelector('#submit').addEventListener('click', (event) => {
          event.preventDefault();
          document.body.innerHTML = '<h1>Application submitted</h1>';
        });
      });
    </script>`);
  try {
    await runCommand(page, { allowSubmit: true });
    const report = await waitForReport(page, "submitted");
    assertEqual(report?.lastStep, "submission_confirmed", "Apply with Indeed reaches confirmed submission");
  } finally {
    await browser.close();
  }
}

async function testAlternateIndeedApplyControl() {
  const { browser, page } = await createPage(`
    <h1>Software Engineer</h1>
    <div role="button" tabindex="0" id="start">Apply on Indeed</div>
    <script>
      document.querySelector('#start').addEventListener('click', () => {
        document.body.innerHTML = '<form><label>Email <input type="email" aria-label="Email" required></label><button type="submit" id="submit">Submit application</button></form>';
        document.querySelector('#submit').addEventListener('click', (event) => {
          event.preventDefault();
          document.body.innerHTML = '<h1>Application submitted</h1>';
        });
      });
    </script>`);
  try {
    await runCommand(page, { allowSubmit: true });
    const report = await waitForReport(page, "submitted");
    assertEqual(report?.lastStep, "submission_confirmed", "alternate Indeed apply control reaches confirmed submission");
  } finally {
    await browser.close();
  }
}

async function testDelayedIndeedApplyControl() {
  const { browser, page } = await createPage(`
    <h1>Software Engineer</h1>
    <main id="application-root">Loading job application...</main>
    <script>
      setTimeout(() => {
        document.querySelector('#application-root').innerHTML = '<button id="start">Apply with Indeed</button>';
        document.querySelector('#start').addEventListener('click', () => {
          document.body.innerHTML = '<form><label>Email <input type="email" aria-label="Email" required></label><button type="submit" id="submit">Submit application</button></form>';
          document.querySelector('#submit').addEventListener('click', (event) => {
            event.preventDefault();
            document.body.innerHTML = '<h1>Application submitted</h1>';
          });
        });
      }, 100);
    </script>`);
  try {
    await runCommand(page, { allowSubmit: true });
    const report = await waitForReport(page, "submitted");
    assertEqual(report?.lastStep, "submission_confirmed", "delayed Indeed apply control reaches confirmed submission");
  } finally {
    await browser.close();
  }
}

async function testUnknownRequiredFieldPause() {
  const { browser, page } = await createPage(
    `<form>
      <label>Favorite framework <input required></label>
      <button type="button">Continue</button>
    </form>`,
    "https://smartapply.indeed.com/apply/runner-test",
  );
  try {
    await runCommand(page);
    const report = await waitForReport(page, "manual_action_required");
    assertEqual(report?.manualActionReason, "unknown_field", "unknown field reason");
    assertTruthy(String(report?.failureReason).includes("Favorite framework"), "unknown field label");
    assertEqual(report?.manualQuestion?.label, "Favorite framework", "unknown field question label");
    assertEqual(report?.manualQuestion?.type, "text", "unknown field question type");
  } finally {
    await browser.close();
  }
}

async function testRelayedApplicationAnswer() {
  const { browser, page } = await createPage(
    `<form>
      <fieldset>
        <legend>Are you willing to relocate?</legend>
        <label>Yes <input type="radio" name="relocate" value="Yes" required></label>
        <label>No <input type="radio" name="relocate" value="No" required></label>
      </fieldset>
      <button type="submit" id="submit">Submit application</button>
    </form>
    <script>
      document.querySelector('#submit').addEventListener('click', (event) => {
        event.preventDefault();
        window.__relayedAnswer = document.querySelector('[name="relocate"]:checked')?.value;
        document.body.innerHTML = window.__relayedAnswer === 'Yes'
          ? '<h1>Application submitted</h1>'
          : '<h1>Application needs attention</h1>';
      });
    </script>`,
    "https://smartapply.indeed.com/apply/answer-relay-test",
  );
  try {
    await page.evaluate(() => {
      (window as JobNovaTestWindow).__jobnovaProfile.applicationAnswers = {
        "indeed:radio:are you willing to relocate?": "Yes",
      };
    });
    await runCommand(page, { allowSubmit: true });
    await waitForReport(page, "submitted");
    assertEqual(await page.evaluate(() => (window as JobNovaTestWindow).__relayedAnswer), "Yes", "relayed radio answer");
  } finally {
    await browser.close();
  }
}

async function testRenderedRequiredRadioGroupPause() {
  const { browser, page } = await createPage(
    `<form>
      <div role="radiogroup" aria-label="Will you reliably commute to Austin?">
        <span>*</span>
        <label>Yes <input type="radio" name="commute" value="Yes"></label>
        <label>No <input type="radio" name="commute" value="No"></label>
        <span>Choose an option to continue.</span>
      </div>
      <button type="button">Continue</button>
    </form>`,
    "https://smartapply.indeed.com/apply/rendered-required-radio-test",
  );
  try {
    await runCommand(page);
    const report = await waitForReport(page, "manual_action_required");
    assertEqual(report?.manualActionReason, "unknown_field", "rendered required radio reason");
    assertEqual(report?.manualQuestion?.label, "Will you reliably commute to Austin?", "rendered radio label");
    assertEqual(report?.manualQuestion?.type, "single_choice", "rendered radio type");
    assertEqual(report?.manualQuestion?.options?.join(","), "Yes,No", "rendered radio options");
  } finally {
    await browser.close();
  }
}

async function testDelayedSmartApplyTransition() {
  const { browser, page } = await createPage(
    `<main><h1>Loading application</h1></main>
    <script>
      setTimeout(() => {
        document.body.innerHTML = '<main><h1>Before you continue</h1><button id="continue">Continue applying</button></main>';
        document.querySelector('#continue').addEventListener('click', () => {
          document.body.innerHTML = '<main><h1>Employer questions</h1><form><label>Relocation preference <input required></label><button type="button">Continue</button></form></main>';
        });
      }, 100);
    </script>`,
    "https://smartapply.indeed.com/beta/indeedapply/applybyapplyablejobid?fixture=delayed",
  );
  try {
    await runCommand(page);
    const report = await waitForReport(page, "manual_action_required");
    assertEqual(report?.manualActionReason, "unknown_field", "delayed SmartApply reaches real field");
    const reports = await page.evaluate(() => (window as JobNovaTestWindow).__jobnovaReports);
    assertTruthy(
      reports.some((candidate) => candidate.lastStep === "clicked_continue_applying"),
      "Continue applying is recognized after delayed render",
    );
  } finally {
    await browser.close();
  }
}

async function testExistingIndeedResumeSelection() {
  const { browser, page } = await createPage(
    `<main>
      <h1>Add a resume</h1>
      <label data-testid="resume-selection-ai-radio-card">
        <input type="radio" name="resume-selection" value="ai" checked> AI-tailored Indeed Resume
      </label>
      <label data-testid="resume-selection-structured-resume-radio-card">
        <input type="radio" name="resume-selection" value="structured"> Use your Indeed Resume
      </label>
      <button id="next">Review resume</button>
    </main>
    <script>
      document.querySelectorAll('[name="resume-selection"]').forEach((radio) => radio.addEventListener('change', () => {
        document.querySelector('#next').textContent = 'Continue';
      }));
      document.querySelector('#next').addEventListener('click', () => {
        window.__selectedResume = document.querySelector('[name="resume-selection"]:checked')?.value;
        document.body.innerHTML = '<main><h1>Employer questions</h1><form><label>Relocation preference <input required></label><button type="button">Continue</button></form></main>';
      });
    </script>`,
    "https://smartapply.indeed.com/beta/indeedapply/form/resume-selection-module/resume-selection",
  );
  try {
    await runCommand(page);
    await waitForReport(page, "manual_action_required");
    assertEqual(
      await page.evaluate(() => (window as JobNovaTestWindow).__selectedResume),
      "structured",
      "existing Indeed resume is selected instead of AI tailoring",
    );
  } finally {
    await browser.close();
  }
}

async function testEmailVerificationPause() {
  const { browser, page } = await createPage("<h1>Enter the verification code sent to your email</h1>");
  try {
    await runCommand(page);
    const report = await waitForReport(page, "manual_action_required");
    assertEqual(report?.manualActionReason, "email", "email verification pause reason");
  } finally {
    await browser.close();
  }
}

async function testSmsVerificationPause() {
  const { browser, page } = await createPage("<h1>Enter the SMS code sent to your phone</h1>");
  try {
    await runCommand(page);
    const report = await waitForReport(page, "manual_action_required");
    assertEqual(report?.manualActionReason, "sms", "SMS verification pause reason");
  } finally {
    await browser.close();
  }
}

async function testRequiredResumePause() {
  const { browser, page } = await createPage(
    `<form>
      <label>Resume <input type="file" required></label>
      <button type="button">Continue</button>
    </form>`,
    "https://smartapply.indeed.com/apply/resume-test",
  );
  try {
    await runCommand(page);
    const report = await waitForReport(page, "manual_action_required");
    assertEqual(report?.manualActionReason, "unknown_field", "resume upload pause reason");
    assertTruthy(String(report?.failureReason).includes("resume upload"), "resume upload message");
  } finally {
    await browser.close();
  }
}

async function testReviewPause() {
  const { browser, page } = await createPage(`
    <form>
      <label>Email <input type="email" aria-label="Email" required></label>
      <button type="submit">Apply now</button>
    </form>`);
  try {
    await runCommand(page, { allowSubmit: false });
    const report = await waitForReport(page, "manual_action_required");
    assertEqual(report?.manualActionReason, "review_required", "review pause reason");
    assertEqual(report?.lastStep, "final_review_guard", "review pause step");
  } finally {
    await browser.close();
  }
}

async function testConfirmedSubmit() {
  const { browser, page } = await createPage(`
    <form>
      <label>First name <input aria-label="First name" required></label>
      <label>Email <input type="email" aria-label="Email" required></label>
      <label>Most recent employer <input aria-label="Most recent employer" required></label>
      <label>School or university <input aria-label="School or university" required></label>
      <fieldset>
        <legend>Are you authorized to work in the United States?</legend>
        <label>Yes <input type="radio" name="authorized" value="Yes" required></label>
        <label>No <input type="radio" name="authorized" value="No" required></label>
      </fieldset>
      <button type="submit" id="submit">Submit application</button>
    </form>
    <script>
      document.querySelector('#submit').addEventListener('click', (event) => {
        event.preventDefault();
        window.__submittedEmail = document.querySelector('[aria-label="Email"]').value;
        window.__submittedEmployer = document.querySelector('[aria-label="Most recent employer"]').value;
        window.__submittedSchool = document.querySelector('[aria-label="School or university"]').value;
        window.__authorized = document.querySelector('[name="authorized"]:checked')?.value;
        document.body.innerHTML = window.__authorized === 'Yes'
          ? '<h1>Application submitted</h1>'
          : '<h1>Application needs attention</h1>';
      });
    </script>`);
  try {
    await runCommand(page, { allowSubmit: true });
    const report = await waitForReport(page, "submitted");
    assertEqual(report?.lastStep, "submission_confirmed", "confirmed submit step");
    assertEqual(await page.evaluate(() => (window as JobNovaTestWindow).__submittedEmail), "test@example.com", "email filled");
    assertEqual(await page.evaluate(() => (window as JobNovaTestWindow).__submittedEmployer), "Example Employer", "work experience filled");
    assertEqual(await page.evaluate(() => (window as JobNovaTestWindow).__submittedSchool), "Example University", "education filled");
    assertEqual(await page.evaluate(() => (window as JobNovaTestWindow).__authorized), "Yes", "radio answer selected");
  } finally {
    await browser.close();
  }
}

async function testClickWithoutConfirmationDoesNotSubmit() {
  const { browser, page } = await createPage(`
    <form>
      <label>Email <input type="email" aria-label="Email" required></label>
      <button type="submit" id="submit">Submit application</button>
    </form>
    <script>
      document.querySelector('#submit').addEventListener('click', (event) => event.preventDefault());
    </script>`);
  try {
    await runCommand(page, { allowSubmit: true });
    const report = await waitForReport(page, "manual_action_required");
    assertEqual(report?.manualActionReason, "review_required", "unconfirmed submit reason");
    assertEqual(report?.lastStep, "submission_clicked_without_confirmation", "unconfirmed submit step");
    const reports = await page.evaluate(() => (window as JobNovaTestWindow).__jobnovaReports);
    assertEqual(reports.some((candidate) => candidate.status === "submitted"), false, "unconfirmed click is not submitted");
  } finally {
    await browser.close();
  }
}

async function testExternalUrlIsSkipped() {
  const externalUrl = "https://employer.example/apply";
  const { browser, page } = await createPage("<h1>External employer</h1>", externalUrl);
  try {
    await runCommand(page, { jobUrl: externalUrl });
    const report = await waitForReport(page, "skipped");
    assertEqual(report?.lastStep, "external_application", "external URL step");
  } finally {
    await browser.close();
  }
}

function buildChromeStub(candidateProfile: typeof profile) {
  return `
    window.__jobnovaReports = [];
    window.__JOBNOVA_TEST_TIMEOUT_MS__ = 500;
    window.__jobnovaListeners = [];
    window.__jobnovaProfile = ${JSON.stringify(candidateProfile)};
    window.chrome = {
      runtime: {
        onMessage: { addListener(listener) { window.__jobnovaListeners.push(listener); } },
        sendMessage(message) {
          if (message.type === 'JOBNOVA_FETCH_COMPANION_PROFILE') return Promise.resolve({ ok: true, profile: window.__jobnovaProfile });
          if (message.type === 'JOBNOVA_CHECK_COMPANION_OWNER') return Promise.resolve({ ok: true, isCurrentTab: true });
          if (message.type === 'JOBNOVA_REPORT_COMPANION_RESULT') {
            window.__jobnovaReports.push(message);
            return Promise.resolve({ ok: true, command: { id: message.commandId, leaseToken: message.leaseToken } });
          }
          return Promise.resolve({ ok: true });
        }
      }
    };
    window.__jobnovaDeliver = (message) => new Promise((resolve) => {
      let answered = false;
      const sendResponse = (response) => { answered = true; resolve(response); };
      for (const listener of window.__jobnovaListeners) listener(message, {}, sendResponse);
      if (!answered) resolve({ ok: true });
    });
  `;
}

type RunnerCommand = {
  id: string;
  applicationId: string;
  jobUrl: string;
  state: string;
  allowSubmit: boolean;
  agentId: string;
  leaseToken: string;
};

type RunnerReport = {
  status: string;
  manualActionReason?: string;
  lastStep?: string;
  failureReason?: string;
  manualQuestion?: {
    key: string;
    label: string;
    type: string;
    options?: string[];
  };
};

declare global {
  interface Window {
    __jobnovaDeliver: (message: unknown) => Promise<unknown>;
    __jobnovaReports: RunnerReport[];
    __submittedEmail?: string;
    __submittedEmployer?: string;
    __submittedSchool?: string;
    __authorized?: string;
    __selectedResume?: string;
    __relayedAnswer?: string;
    __jobnovaProfile: typeof profile & { applicationAnswers?: Record<string, string> };
  }
}

type JobNovaTestWindow = Window;

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

function assertTruthy(actual: unknown, label: string) {
  if (!actual) throw new Error(`${label}: expected a truthy value`);
}

async function main() {
  await testLoginPause();
  await testCaptchaPause();
  await testTransientCaptchaDoesNotPause();
  await testManualActionRevealPolicy();
  await testNormalSignInHeaderDoesNotPauseLogin();
  await testDescriptionTextDoesNotConfirmSubmission();
  await testDescriptionTextDoesNotTriggerCaptcha();
  await testApplyWithIndeedEndToEnd();
  await testAlternateIndeedApplyControl();
  await testDelayedIndeedApplyControl();
  await testEmailVerificationPause();
  await testSmsVerificationPause();
  await testRequiredResumePause();
  await testUnknownRequiredFieldPause();
  await testRelayedApplicationAnswer();
  await testRenderedRequiredRadioGroupPause();
  await testDelayedSmartApplyTransition();
  await testExistingIndeedResumeSelection();
  await testReviewPause();
  await testConfirmedSubmit();
  await testClickWithoutConfirmationDoesNotSubmit();
  await testExternalUrlIsSkipped();
  console.log("Indeed runner test passed: alternate Apply controls, login, CAPTCHA, verification, resume, unknown-field, review, confirmation, and external URL paths.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
