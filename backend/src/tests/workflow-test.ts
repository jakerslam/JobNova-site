import "dotenv/config";
import { chromium, type Browser } from "playwright";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { IndeedApplicationRunner } from "../indeed/IndeedApplicationRunner.js";
import { buildIndeedSearchUrls, scoreJob } from "../indeed/IndeedSearch.js";
import { ApplicationStore } from "../storage/ApplicationStore.js";
import { SessionStore } from "../storage/SessionStore.js";
import type { CandidateProfile, JobPreferences, JobSearchResult } from "../workflow/types.js";

process.env.INDEED_SESSION_ENCRYPTION_KEY = "jobnova-test-only-session-encryption-key";

const testProfile: CandidateProfile = {
  firstName: "Test",
  lastName: "Candidate",
  email: "test@example.com",
  phone: "5550101000",
  location: "Austin, TX",
  resumePath: path.join(tmpdir(), "jobnova-test-resume.docx"),
  links: {
    linkedIn: "https://www.linkedin.com/in/test-candidate",
    portfolio: "https://example.com",
    github: "https://github.com/test-candidate",
  },
  workExperience: [
    {
      company: "Example Company",
      title: "Account Executive",
      location: "Austin, TX",
      startDate: "2024-01",
      description: "Test fixture experience.",
    },
  ],
  education: [
    {
      school: "Example University",
      degree: "Bachelor of Science",
      field: "Computer Science",
      startDate: "2022",
      endDate: "2026",
    },
  ],
  answers: { authorized_to_work_us: "Yes" },
};

type TestContext = {
  browser: Browser;
  store: ApplicationStore;
  tempDir: string;
};

async function createContext(): Promise<TestContext> {
  const tempDir = mkdtempSync(path.join(tmpdir(), "jobnova-workflow-test-"));
  const browser = await chromium.launch({ headless: true });

  return {
    browser,
    store: new ApplicationStore(path.join(tempDir, "applications.json")),
    tempDir,
  };
}

async function closeContext(context: TestContext) {
  await context.browser.close();
  rmSync(context.tempDir, { recursive: true, force: true });
}

async function testSuccessfulSubmit() {
  const context = await createContext();

  try {
    const page = await context.browser.newPage();
    await page.route("https://www.indeed.com/viewjob?jk=mock-submit", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html>
          <html>
            <body>
              <button id="start">Apply now</button>
              <script>
                document.getElementById("start").addEventListener("click", () => {
                  document.body.innerHTML = [
                    '<label>First name <input aria-label="First name" required></label>',
                    '<label>Last name <input aria-label="Last name" required></label>',
                    '<label>Email <input aria-label="Email" required></label>',
                    '<label>Phone <input aria-label="Phone" required></label>',
                    '<label>Are you authorized to work in the United States? <select aria-label="Are you authorized to work in the United States?" required><option></option><option>Yes</option><option>No</option></select></label>',
                    '<button id="final">Apply now</button>',
                  ].join("");
                  document.getElementById("final").addEventListener("click", () => {
                    const firstName = document.querySelector("[aria-label='First name']").value;
                    const email = document.querySelector("[aria-label='Email']").value;
                    const authorized = document.querySelector("[aria-label='Are you authorized to work in the United States?']").value;
                    document.body.innerHTML = firstName && email && authorized === "Yes"
                      ? "<h1>Application submitted</h1>"
                      : "<h1>Missing required profile data</h1>";
                  });
                });
              </script>
            </body>
          </html>`,
      });
    });

    const record = context.store.create({
      jobUrl: "https://www.indeed.com/viewjob?jk=mock-submit",
      title: "Software Engineer Intern",
      company: "Mock Company",
      status: "pending",
    });
    const runner = new IndeedApplicationRunner(testProfile, context.store);
    const result = await runner.applyToRecordWithPage(page, record, { allowSubmit: true });

    assertEqual(result.status, "submitted", "submitted workflow status");
    assertEqual(result.lastStep, "submitted", "submitted workflow step");
    assertTruthy(result.submittedAt, "submitted timestamp");
    assertTruthy((await page.locator("body").innerText()).includes("Application submitted"), "application form was filled before submit");
  } finally {
    await closeContext(context);
  }
}

async function testSuccessfulSubmitFromPopupFlow() {
  const context = await createContext();

  try {
    const page = await context.browser.newPage();
    await page.route("https://www.indeed.com/viewjob?jk=mock-popup-submit", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html>
          <html>
            <body>
              <button id="start" onclick="window.open('https://smartapply.indeed.com/apply/mock-popup')">Apply now</button>
            </body>
          </html>`,
      });
    });
    await page.context().route("https://smartapply.indeed.com/apply/mock-popup", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html>
          <html>
            <body>
              <label>Email <input aria-label="Email" required></label>
              <button id="final">Submit application</button>
              <script>
                document.getElementById("final").addEventListener("click", () => {
                  document.body.innerHTML = document.querySelector("[aria-label='Email']").value
                    ? "<h1>Application submitted</h1>"
                    : "<h1>Missing required profile data</h1>";
                });
              </script>
            </body>
          </html>`,
      });
    });

    const record = context.store.create({
      jobUrl: "https://www.indeed.com/viewjob?jk=mock-popup-submit",
      title: "Software Engineer Intern",
      company: "Mock Company",
      status: "pending",
    });
    const runner = new IndeedApplicationRunner(testProfile, context.store);
    const result = await runner.applyToRecordWithPage(page, record, { allowSubmit: true });

    assertEqual(result.status, "submitted", "popup workflow submitted status");
    assertEqual(result.lastStep, "submitted", "popup workflow submitted step");
  } finally {
    await closeContext(context);
  }
}

async function testFinalReviewPauseWhenSubmitIsNotAllowed() {
  const context = await createContext();

  try {
    const page = await context.browser.newPage();
    await page.route("https://www.indeed.com/viewjob?jk=mock-review", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html>
          <html>
            <body>
              <button id="start">Apply now</button>
              <script>
                document.getElementById("start").addEventListener("click", () => {
                  document.body.innerHTML = '<label>Email <input aria-label="Email" required></label><button>Apply now</button>';
                });
              </script>
            </body>
          </html>`,
      });
    });

    const record = context.store.create({
      jobUrl: "https://www.indeed.com/viewjob?jk=mock-review",
      title: "Frontend Developer",
      company: "Mock Company",
      status: "pending",
    });
    const runner = new IndeedApplicationRunner(testProfile, context.store);
    const result = await runner.applyToRecordWithPage(page, record, { allowSubmit: false });

    assertEqual(result.status, "manual_action_required", "review workflow status");
    assertEqual(result.manualActionReason, "review_required", "review manual reason");
    assertEqual(result.lastStep, "final_review_guard", "review workflow step");
  } finally {
    await closeContext(context);
  }
}

async function testFinalClickWithoutConfirmationDoesNotSubmit() {
  const context = await createContext();

  try {
    const page = await context.browser.newPage();
    await page.route("https://www.indeed.com/viewjob?jk=mock-unconfirmed", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html>
          <html>
            <body>
              <button id="start">Apply now</button>
              <script>
                document.getElementById("start").addEventListener("click", () => {
                  document.body.innerHTML = '<label>Email <input aria-label="Email" required></label><button id="final">Submit application</button>';
                  document.getElementById("final").addEventListener("click", (event) => event.preventDefault());
                });
              </script>
            </body>
          </html>`,
      });
    });

    const record = context.store.create({
      jobUrl: "https://www.indeed.com/viewjob?jk=mock-unconfirmed",
      title: "Account Executive",
      company: "Mock Company",
      status: "pending",
    });
    const runner = new IndeedApplicationRunner(testProfile, context.store);
    const result = await runner.applyToRecordWithPage(page, record, {
      allowSubmit: true,
      confirmationTimeoutMs: 150,
    });

    assertEqual(result.status, "manual_action_required", "unconfirmed click status");
    assertEqual(result.manualActionReason, "review_required", "unconfirmed click reason");
    assertEqual(result.lastStep, "submission_clicked_without_confirmation", "unconfirmed click step");
    assertEqual(result.submittedAt, undefined, "unconfirmed click has no submitted timestamp");
  } finally {
    await closeContext(context);
  }
}

async function testDescriptionTextDoesNotTriggerManualCheckpoint() {
  const context = await createContext();

  try {
    const page = await context.browser.newPage();
    await page.route("https://www.indeed.com/viewjob?jk=mock-description", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html>
          <html>
            <body>
              <header><a>Sign in</a></header>
              <h1>Account Executive</h1>
              <p>This role supports CAPTCHA and human verification products.</p>
              <button id="start">Apply now</button>
              <script>
                document.getElementById("start").addEventListener("click", () => {
                  document.body.innerHTML = '<label>Email <input aria-label="Email" required></label><button>Submit application</button>';
                });
              </script>
            </body>
          </html>`,
      });
    });

    const record = context.store.create({
      jobUrl: "https://www.indeed.com/viewjob?jk=mock-description",
      title: "Account Executive",
      company: "Mock Company",
      status: "pending",
    });
    const runner = new IndeedApplicationRunner(testProfile, context.store);
    const result = await runner.applyToRecordWithPage(page, record, { allowSubmit: false });

    assertEqual(result.manualActionReason, "review_required", "description text reaches final review");
    assertEqual(result.lastStep, "final_review_guard", "description text is not treated as verification");
  } finally {
    await closeContext(context);
  }
}

async function testUnknownRequiredFieldPause() {
  const context = await createContext();

  try {
    const page = await context.browser.newPage();
    await page.route("https://www.indeed.com/viewjob?jk=mock-unknown-field", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html>
          <html>
            <body>
              <button id="start">Apply now</button>
              <script>
                document.getElementById("start").addEventListener("click", () => {
                  document.body.innerHTML = '<label>Favorite framework <input id="framework" required></label><button>Continue</button>';
                });
              </script>
            </body>
          </html>`,
      });
    });

    const record = context.store.create({
      jobUrl: "https://www.indeed.com/viewjob?jk=mock-unknown-field",
      title: "React Developer",
      company: "Mock Company",
      status: "pending",
    });
    const runner = new IndeedApplicationRunner(testProfile, context.store);
    const result = await runner.applyToRecordWithPage(page, record, { allowSubmit: true });

    assertEqual(result.status, "manual_action_required", "unknown-field workflow status");
    assertEqual(result.manualActionReason, "unknown_field", "unknown-field manual reason");
  } finally {
    await closeContext(context);
  }
}

async function testRenderedRequiredRadioGroupPause() {
  const context = await createContext();

  try {
    const page = await context.browser.newPage();
    await page.route("https://www.indeed.com/viewjob?jk=mock-rendered-radio", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html>
          <html>
            <body>
              <button id="start">Apply now</button>
              <script>
                document.getElementById("start").addEventListener("click", () => {
                  document.body.innerHTML = [
                    '<div role="radiogroup" aria-label="Will you reliably commute to Austin?">',
                    '<span>*</span>',
                    '<label>Yes <input type="radio" name="commute" value="Yes"></label>',
                    '<label>No <input type="radio" name="commute" value="No"></label>',
                    '<span>Choose an option to continue.</span>',
                    '</div>',
                    '<button>Continue</button>',
                  ].join('');
                });
              </script>
            </body>
          </html>`,
      });
    });

    const record = context.store.create({
      jobUrl: "https://www.indeed.com/viewjob?jk=mock-rendered-radio",
      title: "Account Executive",
      company: "Mock Company",
      status: "pending",
    });
    const runner = new IndeedApplicationRunner(testProfile, context.store);
    const result = await runner.applyToRecordWithPage(page, record, { allowSubmit: true });

    assertEqual(result.status, "manual_action_required", "rendered radio workflow status");
    assertEqual(result.manualActionReason, "unknown_field", "rendered radio manual reason");
    assertTruthy(result.failureReason?.includes("Will you reliably commute to Austin?"), "rendered radio label");
  } finally {
    await closeContext(context);
  }
}

async function testCaptchaPause() {
  const context = await createContext();

  try {
    const page = await context.browser.newPage();
    await page.route("https://www.indeed.com/viewjob?jk=mock-captcha", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><body><h1>Verify you are human</h1><div id="captcha">captcha</div></body></html>`,
      });
    });

    const record = context.store.create({
      jobUrl: "https://www.indeed.com/viewjob?jk=mock-captcha",
      title: "Account Executive",
      company: "Mock Company",
      status: "pending",
    });
    const runner = new IndeedApplicationRunner(testProfile, context.store);
    const result = await runner.applyToRecordWithPage(page, record, { allowSubmit: true });

    assertEqual(result.status, "manual_action_required", "captcha workflow status");
    assertEqual(result.manualActionReason, "captcha", "captcha manual reason");
    assertTruthy(result.manualActionUrl, "captcha manual action URL");
  } finally {
    await closeContext(context);
  }
}

async function testMalformedRecordIsSkipped() {
  const context = await createContext();

  try {
    const page = await context.browser.newPage();
    const record = context.store.create({
      jobUrl: "https://www.indeed.com/addlLoc/redirect?jk=mock",
      title: "Indeed Home",
      company: "if (window.performance !== undefined) {",
      status: "pending",
    });
    const runner = new IndeedApplicationRunner(testProfile, context.store);
    const result = await runner.applyToRecordWithPage(page, record, { allowSubmit: true });

    assertEqual(result.status, "skipped", "malformed workflow status");
    assertEqual(result.lastStep, "invalid_job_metadata", "malformed workflow step");
  } finally {
    await closeContext(context);
  }
}

async function testEncryptedSessionStoreRoundTrip() {
  const tempDir = mkdtempSync(path.join(tmpdir(), "jobnova-session-test-"));

  try {
    const store = new SessionStore(tempDir);
    await store.saveState(
      {
        cookies: [
          {
            name: "MOCK_INDEED_COOKIE",
            value: "secret-cookie-value",
            domain: ".indeed.com",
            path: "/",
            expires: -1,
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
          },
        ],
        origins: [{ origin: "https://www.indeed.com", localStorage: [{ name: "token", value: "secret-local-storage" }] }],
      },
      "test",
    );

    const savedPath = path.join(tempDir, "test.storage-state.enc");
    const encrypted = readFileSync(savedPath, "utf8");
    const restored = await store.load("test");

    assertTruthy(!encrypted.includes("secret-cookie-value"), "session file does not contain plaintext cookie");
    assertTruthy(!encrypted.includes("secret-local-storage"), "session file does not contain plaintext local storage");
    assertEqual(restored.cookies[0]?.value, "secret-cookie-value", "encrypted session cookie round trip");
    assertEqual(restored.origins?.[0]?.localStorage[0]?.value, "secret-local-storage", "encrypted session storage round trip");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testJobSelectionRules() {
  const preferences: JobPreferences = {
    titles: ["Frontend Developer", "Account Executive", "Software Engineer Intern"],
    locations: ["Austin, TX", "Remote", "Salt Lake City, UT"],
    remoteOptions: ["remote", "hybrid", "onsite"],
    excludedCompanies: ["Bad Company"],
    requiredKeywords: ["frontend", "react", "sales", "account executive"],
    excludedKeywords: ["senior", "principal"],
    maxApplicationsPerRun: 3,
  };
  const relevantJob: Omit<JobSearchResult, "relevanceScore"> = {
    jobUrl: "https://www.indeed.com/viewjob?jk=relevant",
    title: "Frontend Developer",
    company: "Mock Company",
    location: "Austin, TX",
    snippet: "React and TypeScript role",
  };
  const excludedJob: Omit<JobSearchResult, "relevanceScore"> = {
    jobUrl: "https://www.indeed.com/viewjob?jk=excluded",
    title: "Senior Frontend Developer",
    company: "Mock Company",
    location: "Austin, TX",
    snippet: "React role",
  };

  assertEqual(buildIndeedSearchUrls(preferences).length, 8, "search URL generation remains low-volume");
  assertTruthy(scoreJob(relevantJob, preferences) > 0, "relevant job receives a positive score");
  assertEqual(scoreJob(excludedJob, preferences), 0, "excluded keyword job is rejected");
}


function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertTruthy(actual: unknown, label: string) {
  if (!actual) {
    throw new Error(`${label}: expected a truthy value`);
  }
}

async function main() {
  await testEncryptedSessionStoreRoundTrip();
  testJobSelectionRules();
  await testSuccessfulSubmit();
  await testSuccessfulSubmitFromPopupFlow();
  await testFinalReviewPauseWhenSubmitIsNotAllowed();
  await testFinalClickWithoutConfirmationDoesNotSubmit();
  await testDescriptionTextDoesNotTriggerManualCheckpoint();
  await testUnknownRequiredFieldPause();
  await testRenderedRequiredRadioGroupPause();
  await testCaptchaPause();
  await testMalformedRecordIsSkipped();

  console.log("Indeed workflow test passed: encrypted session, confirmed submit, review guard, unknown-field pause, CAPTCHA pause, and malformed-record skip paths are working.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
