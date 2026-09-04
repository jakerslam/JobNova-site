# Indeed Auto-Apply Backend Module

Minimal backend module for a controlled Indeed auto-apply engineering test.

This is a single-user prototype. It uses a visible Playwright browser, local encrypted session storage, private candidate configuration, and durable application status tracking. It does not bypass CAPTCHA, SMS, email verification, login checks, or platform security mechanisms.

## Architecture

```txt
src/
  server.ts                      HTTP API for webapp/manual-session handoff
  cli.ts                         CLI entrypoint
  config/loadConfig.ts           Loads private local candidate/preference JSON
  indeed/
    IndeedSessionCoordinator.ts  Owns active login handoff sessions
    IndeedSessionManager.ts      Opens fresh/restored Playwright sessions
    IndeedManualCheck.ts         Detects login, CAPTCHA, SMS, email checkpoints
    IndeedSearch.ts              Builds low-volume Indeed search URLs
    IndeedApplicationRunner.ts   Application-runner scaffold
  storage/
    SessionStore.ts              Encrypts/decrypts Playwright storageState
    ApplicationStore.ts          Tracks application statuses in local JSON
  workflow/
    statuses.ts                  Status and manual-action enums
    types.ts                     Candidate, preference, application types
```

The reusable workflow code is shared by both the CLI and the HTTP API. The API is the scalable product path: the webapp can start a visible login handoff session, let the user complete manual verification, save encrypted session state, close the browser, and later restore the session for search/apply/resume runs.

## Setup

Install dependencies:

```bash
cd backend
npm install
```

Create local private files:

```bash
cp .env.example .env
cp config/candidate-profile.example.json config/candidate-profile.json
cp config/job-preferences.example.json config/job-preferences.json
```

Set `INDEED_SESSION_ENCRYPTION_KEY` in `.env` to a long random value.

`INDEED_BROWSER_CHANNEL=chrome` tells Playwright to use the installed Google Chrome app instead of Chrome for Testing. `INDEED_USE_PERSISTENT_PROFILE=true` opens the manual login handoff in a dedicated normal Chrome profile under `data/browser-profile/` instead of an ephemeral browser context. This can make manual login behave more like a normal browser session, while still requiring the user to complete verification manually. `INDEED_RESTORE_WITH_PERSISTENT_PROFILE=false` keeps normal workflow runs tied to the encrypted saved session state rather than relying on a long-lived browser profile.

Private files are ignored by git:

- `.env`
- `config/candidate-profile.json`
- `config/job-preferences.json`
- `data/applications.json`
- `data/browser-profile/`
- `data/sessions/`
- `data/resumes/`

## Commands

```bash
npm run indeed:login
npm run indeed:check-session
npm run indeed:import-session
npm run dev
npm run indeed:search
npm run indeed:search -- --collect
npm run indeed:queue-url -- --job-url=<url> --title="Role title" --company="Company"
npm run indeed:apply
npm run indeed:apply -- --run
npm run indeed:resume -- --application-id=<id>
npm run indeed:status
```

All session-aware CLI commands accept `--session-name=<name>`; the HTTP API accepts the same value as `sessionName` in JSON bodies or route params.

## HTTP API

Start the local backend API:

```bash
npm run dev
```

Default base URL: `http://localhost:4100`

Core endpoints:

```txt
GET  /health
GET  /sessions
POST /sessions/start               { "sessionName": "default" }
GET  /sessions/:sessionName/inspect
POST /sessions/:sessionName/save
POST /sessions/:sessionName/cancel
POST /sessions/check               { "sessionName": "default" }
POST /sessions/import              { "sessionName": "default", "cdpUrl": "http://127.0.0.1:9222" }
GET  /jobs/search-urls
POST /jobs/collect                 { "sessionName": "default" }
GET  /applications
POST /applications/queue           { "jobUrl": "...", "title": "...", "company": "..." }
POST /applications/apply           { "sessionName": "default", "limit": 3 }
POST /applications/:id/resume      { "sessionName": "default" }
```

The intended webapp login flow is:

1. `POST /sessions/start` opens a dedicated visible browser session.
2. The user manually logs into Indeed and completes email, SMS, CAPTCHA, or other verification.
3. The webapp can poll `GET /sessions/:sessionName/inspect` to see whether a manual checkpoint is still visible.
4. `POST /sessions/:sessionName/save` encrypts the authenticated session state and closes the browser.
5. Future `POST /jobs/collect`, `POST /applications/apply`, and `POST /applications/:id/resume` calls restore the encrypted browser state into a fresh browser context without keeping the browser open continuously.

This design scales by making `sessionName` a stand-in for a future authenticated user ID. Each user gets an isolated browser profile, encrypted session file, candidate profile, preferences, and application records.

## Demo Path

1. Start the frontend and backend locally.
2. Open JobNova Settings and use the Indeed connection panel.
3. Click **Start Login** to open the managed Indeed login handoff.
4. Complete Indeed login and any email, SMS, or CAPTCHA verification manually.
5. Click **Save Session**, then **Check** to verify encrypted session restore.
6. Click **Collect Jobs** to collect a small set of relevant Austin/Remote jobs.
7. Click **Status** to review saved application records.
8. Click **Run Apply** to run the guarded workflow, which fills known profile fields and pauses for manual review or verification.

## Browser Session Storage And Restore

`npm run indeed:login` or `POST /sessions/start` opens Indeed in a visible browser. The user manually creates or signs into their account and completes any required email, phone, CAPTCHA, or other verification.

After the user confirms login is complete, the module saves Playwright `storageState`, encrypts it with AES-256-GCM using `INDEED_SESSION_ENCRYPTION_KEY`, and writes it to `data/sessions/`.

`npm run indeed:check-session` starts a new browser context, restores the encrypted session state, opens Indeed, and checks whether the session still appears authenticated. The browser does not need to remain running between commands.

### Why This Is Not An Iframe Login

The webapp can provide a polished login handoff panel, but the actual Indeed login page should not be embedded in a JobNova iframe. Job-site and identity-provider login pages commonly block iframe embedding, and a normal frontend tab cannot read Indeed cookies back out of another domain. Relying on the user's everyday Chrome profile would also be hard to scale safely because it ties automation to a personal browser process.

The scalable pattern is a dedicated, isolated browser session owned by the backend workflow. The webapp starts that session, the user completes verification manually, and the backend stores only the encrypted browser session state needed for later restore.

### Optional: Import Indeed Session From User-Launched Chrome

If Cloudflare blocks the Playwright-launched login browser even when the user tries to complete verification manually, the module supports an explicit user-controlled Chrome DevTools import path.

This does not read Chrome's cookie database directly. It connects only to a Chrome instance the user intentionally launches with a debugging port, reads browser cookies through Chrome DevTools Protocol, filters them down to Indeed domains, encrypts that filtered state, and saves it through `SessionStore`.

Quit Chrome, then launch Chrome with remote debugging:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome"
```

In that Chrome window, manually log into Indeed and complete any verification. Then in another terminal:

```bash
npm run indeed:import-session
npm run indeed:check-session
```

Only use this path with your own browser profile and your own Indeed account.

## Manual Verification And Failures

The workflow must pause when it sees:

- login prompts
- CAPTCHA or human verification copy
- SMS or phone verification
- email verification
- unknown required fields
- final review screens when final review is required

Paused applications should be marked `manual_action_required` with a reason such as `captcha`, `sms`, `email`, `login`, `unknown_field`, or `review_required`.

The module does not use CAPTCHA solvers, proxy rotation, stealth plugins, or any anti-detection tooling.

## Application Statuses

Applications can be tracked as:

- `pending`
- `in_progress`
- `manual_action_required`
- `submitted`
- `failed`
- `skipped`

`npm run indeed:status` prints the local application store.

## Search And Apply Flow

After login/session restore is verified:

1. Run `npm run indeed:search -- --collect`.
2. The search runner opens a restored browser session, visits a small number of preference-derived Indeed search URLs, scores visible jobs against the local preference file, and saves suitable roles as `pending`.
3. If result collection is blocked or a role is selected manually, run `npm run indeed:queue-url -- --job-url=<url> --title="Role title" --company="Company"`.
4. Run `npm run indeed:apply -- --run` to process pending records.

The application runner restores the Indeed session, opens each job, checks for manual checkpoints, clicks only recognizable apply controls, fills only known fields from the private candidate profile, uploads the configured resume when a file input is present, and stops for unknown required fields or final review.

## Multi-User Extension

To extend this prototype for multiple users:

- Add user authentication and a `users` table.
- Store one encrypted session per user.
- Store one candidate profile and job preference set per user.
- Move secrets to a managed secret store or KMS.
- Add a queue for per-user application workflows.
- Run each user workflow in isolated browser contexts or containers.
- Add audit logs and explicit consent records for every automated action.
- Build a small web UI for manual checkpoints.

## Current Milestone

Implemented:

- Backend project scaffold
- Private candidate/preference config examples
- Local ignored candidate/preference config files
- Encrypted session store
- Visible Indeed login/session save command
- Session restore/check command
- Optional Indeed-only session import from user-launched Chrome over CDP
- Application status store
- Low-volume Indeed search URL generation
- Optional `search --collect` job discovery and relevance scoring
- Manual `queue-url` fallback for selected job URLs
- Guarded application runner for pending jobs
- Known-field candidate/profile filling
- Resume upload attempt when a file input is present
- Unknown-required-field detection
- Final-review pause guard
- Resume command for paused application records

Next milestone:

- Verify manual Indeed account creation/login with `indeed:login`.
- Restore the session with `indeed:check-session`.
- Test `search --collect` against the authenticated Indeed session.
- Test one queued relevant job through `apply --run`, stopping before final submission.
