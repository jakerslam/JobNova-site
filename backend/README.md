# JobNova Indeed Backend

Minimal, reusable Indeed auto-apply module for the JobNova internship project. It uses only the candidate's own profile and authenticated Indeed account. It never attempts to bypass login, CAPTCHA, email verification, SMS verification, or another platform security mechanism.

## Architecture

```text
Next.js job card
  -> POST /applications/:id/dispatch-companion
  -> durable command + application state
  -> Chrome companion claims a leased command
  -> background worker opens Indeed in normal Chrome
  -> guarded runner fills and advances the application
  -> backend records every state transition
```

The system has three boundaries:

- **Web application:** imports backend records into the feed and dispatches one application when the candidate clicks Apply or Finish.
- **Backend orchestrator:** owns candidate configuration, canonical job records, command leases, encrypted managed sessions, and application status history.
- **Chrome companion:** performs the live workflow inside the candidate's authenticated normal Chrome session. The Indeed tab stays in the background unless manual action is required.

The product Apply path uses the Chrome companion because Indeed accepted the user's ordinary Chrome session while repeatedly challenging automation-launched login browsers. The managed Playwright session implementation remains available as the remote-session abstraction and encrypted restore proof.

## Project Layout

```text
src/
  server.ts                         HTTP API
  cli.ts                            CLI diagnostics
  config/loadConfig.ts              Private candidate/preferences loader
  indeed/IndeedApplicationRunner.ts Managed Playwright executor
  indeed/IndeedSessionManager.ts     Fresh/restored browser contexts
  storage/SessionStore.ts            AES-256-GCM session vault
  storage/ApplicationStore.ts        Canonical jobs and statuses
  workflow/companion.ts              Commands, leases, heartbeats, reports
  workflow/statuses.ts               Status/reason enums
../extension/
  app-bridge.js                      Fast polling while JobNova is open
  background.js                      Durable heartbeat, polling, and tab ownership
  content.js                         Indeed job extraction
  indeed-runner.js                   Guarded live application runner
```

## Setup

From the repository root:

```bash
npm ci
npm --prefix backend ci
npm run dev:all
```

The app runs at `http://localhost:3000` and the backend at `http://localhost:4100`.

Load the companion once:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select Load unpacked.
4. Choose the repository's `extension` directory.
5. Reload the extension after changing extension source files.

Private files are ignored by Git:

- `backend/.env`
- `backend/config/candidate-profile.json`
- `backend/config/job-preferences.json`
- `backend/data/applications.json`
- `backend/data/companion-commands.json`
- `backend/data/browser-profile/`
- `backend/data/sessions/`
- `backend/data/resumes/`

Create local configuration from the committed examples:

```bash
cp backend/.env.example backend/.env
cp backend/config/candidate-profile.example.json backend/config/candidate-profile.json
cp backend/config/job-preferences.example.json backend/config/job-preferences.json
openssl rand -base64 32
```

Put the generated value in `INDEED_SESSION_ENCRYPTION_KEY`, point `resumePath` at the candidate's real local resume, and replace every example profile/preference value. The loader rejects missing contact details, resume, work history, education, or a run limit above five.

## End-To-End Flow

1. The candidate opens a relevant Indeed search in their authenticated Chrome profile.
2. The companion sends visible supported listings to `POST /applications/queue-batch`.
3. The backend canonicalizes listings by Indeed `jk`, rejects malformed metadata and external-only application results, and records accepted jobs as `pending`.
4. Clicking Apply in JobNova creates an idempotent command and marks the application `in_progress`.
5. The extension service worker or foreground app bridge claims the command with an expiring lease.
6. The background worker opens or reuses the Indeed page without switching away from JobNova.
7. The runner recognizes **Apply with Indeed**, follows same-tab or SmartApply tab transitions, fills known profile fields and configured answers, and advances safe steps.
8. With `allowSubmit=true`, the runner clicks a recognized final submission control.
9. The backend accepts `submitted` only when the runner observes an unambiguous Indeed confirmation.
10. Ordinary required questions are relayed to a JobNova modal and resumed in the background after validation.
11. Login, CAPTCHA, email/SMS verification, ambiguous resume selection, and non-relayable review steps bring the Indeed tab forward.

External employer application sites are deliberately marked `skipped` with `external_application`; this minimal module automates only Indeed-hosted applications.

## Session Storage And Restore

`SessionStore` serializes Playwright `storageState`, encrypts it with AES-256-GCM using `INDEED_SESSION_ENCRYPTION_KEY`, and stores only the encrypted envelope under `backend/data/sessions/`. Authentication material is never committed.

The managed-session sequence is:

1. Start a visible handoff browser with `POST /sessions/start`.
2. Complete login and verification manually.
3. Save with `POST /sessions/:sessionName/save`.
4. The backend encrypts storage state and closes the handoff browser only after a fresh-context restore check succeeds.
5. Later managed runs decrypt the state into a fresh context and close that context after the operation, so the browser does not need to remain running.

Indeed can expire or challenge a technically valid restored session. `check-session` and `diagnose-session` therefore probe the restored context and report `login` or `captcha` instead of treating successful decryption as proof of authentication.

The Chrome companion does not read or upload Chrome cookies. It relies on Chrome's own encrypted profile persistence for the live executor. Both executors sit behind the same application/status model, allowing a hosted remote-browser adapter to replace the local companion later.

## Manual Verification And Resume

The runner pauses and records `manual_action_required` for:

- `login`
- `captcha`
- `sms`
- `email`
- `unknown_field`
- `review_required`

The application record stores the exact Indeed URL and last completed step. For an ordinary text, select, boolean, or single-choice employer question, it also stores a normalized question descriptor. JobNova validates the answer against that descriptor, stores it only on the application, and creates a new leased command that resumes from the saved URL. The runner receives those answers only while it owns that command.

Security checks and non-relayable screens still pause on Indeed. CAPTCHA and verification controls are detected from visible checkpoint elements and authentication URLs, not broad job-description text.

Failures such as a closed tab, expired lease, missing extension receiver, unsupported external redirect, or unconfirmed final click are recorded truthfully as `failed`, `skipped`, or `manual_action_required`. A button click alone is never treated as proof of submission.

## Application States

- `pending`
- `in_progress`
- `submitted`
- `failed`
- `manual_action_required`
- `skipped`

Companion commands use `queued`, `leased`, `running`, `completed`, and `failed`. The service worker maintains a periodic readiness heartbeat even when no JobNova tab is open; the app bridge provides faster polling while the user is in JobNova. Heartbeats prevent the API from accepting an Apply dispatch when no current extension is available.

## Core API

```text
GET  /health
GET  /applications
POST /applications/queue-batch
POST /applications/:id/dispatch-companion
POST /applications/:id/answer
GET  /companion/status
POST /companion/agents/heartbeat
POST /companion/commands/claim
POST /companion/commands/:id/profile
POST /companion/commands/:id/heartbeat
POST /companion/commands/:id/report

POST /sessions/start
POST /sessions/:sessionName/save
POST /sessions/check
POST /sessions/diagnose
```

## Verification

```bash
npm test
npm run test:workflow
npm run test:companion
npm run test:extension-content
npm run test:extension-runner
npm run typecheck
```

The tests prove encrypted session round trips, canonical job deduplication, exclusive leases, stale-token rejection, agent readiness, structured metadata extraction, **Apply with Indeed** handling, known-field filling, manual checkpoints, guarded final submission, and confirmation-only `submitted` reporting.

## Multiple Users

To extend the module:

- Authenticate every API and extension agent.
- Replace JSON stores with PostgreSQL and a transactional job queue.
- Key profiles, job records, encrypted sessions, commands, and audit logs by `userId`.
- Encrypt sessions with per-user data keys managed by KMS.
- Run each user in an isolated remote browser context or container.
- Stream manual checkpoints to the web app and expire access URLs quickly.
- Add idempotency keys, rate limits, consent records, and per-user application limits.

This is intentionally a small demonstration module, not a production bulk-application service.
