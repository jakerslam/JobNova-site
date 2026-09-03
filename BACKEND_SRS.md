# Backend SRS: Indeed Auto-Apply Module

## 1. Purpose

Build a minimal, reusable backend module that can run a controlled end-to-end Indeed auto-apply workflow for a single real candidate profile.

This module is intended for an engineering ability test. It is not a production job-application platform and must stay conservative around account security, verification, platform rules, and personal information.

## 2. Scope

### In Scope

- Create a backend module for Indeed login/session management.
- Support manual account creation and manual verification steps.
- Store and restore an authenticated Indeed browser session without keeping the browser open continuously.
- Store a candidate profile with resume, contact details, work history, education, and preferences.
- Select a small number of relevant jobs.
- Attempt applications only for jobs that are reasonably relevant to the candidate profile.
- Complete simple Indeed application flows when fields can be safely mapped from the candidate profile.
- Pause and resume when manual verification or unknown form input is required.
- Record application status and workflow events.
- Include a backend README explaining architecture, session restore, manual handling, failures, and multi-user extension.

### Out of Scope

- CAPTCHA bypassing or solving.
- SMS/email verification bypassing.
- Proxy rotation, stealth plugins, anti-detection tooling, or bot-evasion behavior.
- High-volume scraping or bulk applications.
- Applying with fake, incomplete, or irrelevant candidate information.
- Production-grade multi-user auth, billing, or queue infrastructure.
- Direct integration into the existing front-end dashboard, unless added later as a separate phase.

## 3. Compliance And Safety Requirements

- The workflow must use only the developer/tester's own Indeed account.
- The workflow must use only the developer/tester's own real candidate information.
- The workflow must apply only to roles reasonably relevant to the candidate background.
- The workflow must not attempt to bypass CAPTCHA, SMS, email verification, login checks, or platform security mechanisms.
- If verification, CAPTCHA, or an ambiguous required question appears, the workflow must pause and mark the application as `manual_action_required`.
- The backend README must clearly state these constraints.
- Session artifacts, candidate profile details, resume files, database files, and secrets must not be committed.

## 4. Recommended Stack

- Runtime: Node.js
- Language: TypeScript
- Browser automation: Playwright
- Persistence: local JSON for the minimal prototype, with SQLite as the recommended production upgrade
- Session storage: encrypted Playwright `storageState` JSON
- Secrets: `.env` file loaded locally
- Interface: CLI-first, with optional lightweight HTTP service later

This fits the existing project stack while keeping the backend test isolated from the deployed static front end.

## 5. Proposed Directory Structure

```txt
backend/
  README.md
  package.json
  tsconfig.json
  .env.example
  src/
    cli.ts
    config/
      candidateProfile.example.ts
      jobPreferences.example.ts
    indeed/
      IndeedApplicationRunner.ts
      IndeedLogin.ts
      IndeedManualCheck.ts
      IndeedSearch.ts
      IndeedSessionManager.ts
      selectors.ts
    storage/
      ApplicationStore.ts
      SessionStore.ts
    workflow/
      AutoApplyWorkflow.ts
      statuses.ts
      types.ts
  data/
    .gitkeep
```

Private files that must be ignored:

```txt
backend/.env
backend/data/*.sqlite
backend/data/sessions/*
backend/data/resumes/*
backend/src/config/candidateProfile.ts
backend/src/config/jobPreferences.ts
```

## 6. Data Model

### Candidate Profile

```ts
type CandidateProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  resumePath: string;
  workExperience: WorkExperience[];
  education: Education[];
  links: {
    linkedIn?: string;
    portfolio?: string;
    github?: string;
  };
  answers: Record<string, string>;
};
```

### Job Preferences

```ts
type JobPreferences = {
  titles: string[];
  locations: string[];
  remoteOptions: Array<"remote" | "hybrid" | "onsite">;
  salaryMin?: number;
  excludedCompanies?: string[];
  requiredKeywords: string[];
  excludedKeywords: string[];
  maxApplicationsPerRun: number;
};
```

### Application Record

```ts
type ApplicationStatus =
  | "pending"
  | "in_progress"
  | "manual_action_required"
  | "submitted"
  | "failed"
  | "skipped";

type ApplicationRecord = {
  id: string;
  jobUrl: string;
  title: string;
  company: string;
  location?: string;
  status: ApplicationStatus;
  lastStep?: string;
  manualActionReason?: "captcha" | "sms" | "email" | "login" | "unknown_field" | "review_required";
  failureReason?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
};
```

## 7. Functional Requirements

### FR-1: Manual Account Setup

- The system must provide a CLI command to open Indeed in a visible browser.
- The user must create or log into an Indeed account manually.
- The user must complete email, phone, CAPTCHA, or other verification manually.
- After successful login, the system must save the browser session.

Acceptance criteria:

- Running `npm run indeed:login` opens a non-headless browser.
- User can manually complete login/verification.
- Session state is saved after confirmation.
- No password is stored by the app.

### FR-2: Secure Session Storage And Restore

- The system must save Playwright `storageState`.
- The saved session must be encrypted before being written to disk.
- The encryption key must come from `.env`.
- The system must restore the session into a fresh browser context.
- The browser must not need to remain running between workflow runs.

Acceptance criteria:

- Running `npm run indeed:check-session` restores the saved session.
- If the session is expired, the workflow reports `manual_action_required`.
- Raw session JSON is not committed and is not stored unencrypted.

### FR-3: Candidate Profile Loading

- The system must load a local candidate profile from a private config file.
- The committed repo must include only example profile files.
- The system must validate required profile fields before applying.

Acceptance criteria:

- Missing `candidateProfile.ts` causes a clear setup error.
- Missing resume path, email, phone, or name prevents auto-apply.
- Example config documents the expected shape without personal data.

### FR-4: Job Discovery

- The system must select a small number of suitable jobs from user-provided search criteria.
- Job discovery must be low volume.
- The system must avoid jobs that fail basic relevance checks.

Acceptance criteria:

- `maxApplicationsPerRun` limits the run.
- Jobs with excluded keywords are skipped.
- Jobs without a clear apply path are marked `skipped` or `manual_action_required`.

### FR-5: Application Execution

- The system must open each selected job in a visible browser context.
- The system must attempt to complete only recognized form fields.
- The system must upload the configured resume only when the flow requests a resume.
- The system must not guess answers to ambiguous required questions.
- The system must optionally pause before final submission if configured.

Acceptance criteria:

- Known fields such as name, email, phone, links, resume, work authorization, and location can be filled from the profile.
- Unknown required fields pause the workflow.
- Submitted applications are recorded as `submitted`.
- Failed applications include a failure reason.

### FR-6: Manual Pause And Resume

- The workflow must detect common manual checkpoints.
- The workflow must leave the browser open when manual input is required.
- The workflow must save the current application state before pausing.
- The workflow must provide a resume command.

Acceptance criteria:

- CAPTCHA, SMS, email verification, login expiration, unknown required fields, and final review screens are represented as manual action reasons.
- Running `npm run indeed:resume -- --application-id <id>` resumes a paused application.
- Resuming does not duplicate submitted applications.

### FR-7: Application Status Tracking

- The system must record status for each application.
- The system must record timestamps and last known workflow step.
- The system must expose a simple status command.

Acceptance criteria:

- `npm run indeed:status` lists application records.
- Records can show `pending`, `in_progress`, `manual_action_required`, `submitted`, `failed`, or `skipped`.
- Each failure/manual state has a human-readable reason.

### FR-8: Backend README

- The backend README must explain the architecture.
- It must explain how sessions are saved/restored.
- It must explain manual verification and failure handling.
- It must explain how the design could support multiple users.
- It must document setup and run commands.

Acceptance criteria:

- README is present at `backend/README.md`.
- README includes safety/compliance notes.
- README includes the command flow from login through apply/resume/status.

## 8. Non-Functional Requirements

- The module should be small and readable.
- Selectors should be isolated in one file where possible.
- Logs should avoid printing secrets or full personal profile data.
- Workflow steps should be idempotent enough to resume safely.
- Browser automation should run visibly for actions that may require manual review.
- The system should prefer explicit failure over unsafe guessing.

## 9. CLI Commands

Initial command set:

```bash
npm run indeed:login
npm run indeed:check-session
npm run indeed:search
npm run indeed:apply
npm run indeed:resume -- --application-id <id>
npm run indeed:status
```

Optional later commands:

```bash
npm run indeed:reset-session
npm run indeed:export-status
```

## 10. Workflow States

```txt
pending
  -> in_progress
  -> submitted
  -> failed
  -> skipped
  -> manual_action_required
       -> in_progress
       -> submitted
       -> failed
```

## 11. Manual Action Detection

The workflow must pause when it detects:

- CAPTCHA or human verification copy.
- SMS/phone verification request.
- Email verification request.
- Login page after restoring a session.
- Unknown required form field.
- Required file upload failure.
- Final review screen when `REQUIRE_FINAL_REVIEW=true`.

Detection should use conservative text/selector checks and return a typed result instead of throwing generic errors.

## 12. Multi-User Extension Plan

To support multiple users later:

- Add a `users` table.
- Store one encrypted session per user.
- Store candidate profiles per user.
- Add a job/application queue keyed by user ID.
- Move encryption keys to a managed secret service or KMS.
- Add audit logs for every automated action.
- Add per-user run limits and explicit consent records.
- Add a web UI for manual checkpoints.
- Run workflows in isolated browser contexts or containers.

## 13. Implementation Milestones

1. Scaffold backend TypeScript project and `.gitignore` updates.
2. Add profile/preferences example configs.
3. Implement status types and SQLite application store.
4. Implement encrypted session store.
5. Implement manual login and session restore commands.
6. Implement manual checkpoint detector.
7. Implement low-volume job search and relevance filtering.
8. Implement application runner for recognized fields.
9. Implement pause/resume/status commands.
10. Add backend README and final validation notes.

## 14. Open Questions

- Should the runner stop before final submission by default, or submit automatically when the application is fully recognized?
- Will the tester use a newly created Indeed account or an existing account?
- Where should the private resume file live locally?
- Should this backend live inside this repo under `backend/`, or in a separate repo for the backend test?
- Should the frontend show application records later, or is CLI/status output enough for the test?
