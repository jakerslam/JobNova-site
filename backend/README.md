# Indeed Auto-Apply Backend Module

Minimal backend module for a controlled Indeed auto-apply engineering test.

This is a single-user prototype. It uses a visible Playwright browser, local encrypted session storage, private candidate configuration, and durable application status tracking. It does not bypass CAPTCHA, SMS, email verification, login checks, or platform security mechanisms.

## Architecture

```txt
src/
  cli.ts                         CLI entrypoint
  config/loadConfig.ts           Loads private local candidate/preference JSON
  indeed/
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

The module is intentionally CLI-first so it can be tested independently from the JobNova front end.

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

Private files are ignored by git:

- `.env`
- `config/candidate-profile.json`
- `config/job-preferences.json`
- `data/applications.json`
- `data/sessions/`
- `data/resumes/`

## Commands

```bash
npm run indeed:login
npm run indeed:check-session
npm run indeed:search
npm run indeed:search -- --collect
npm run indeed:queue-url -- --job-url=<url> --title="Role title" --company="Company"
npm run indeed:apply
npm run indeed:apply -- --run
npm run indeed:resume -- --application-id=<id>
npm run indeed:status
```

## Browser Session Storage And Restore

`npm run indeed:login` opens Indeed in a visible browser. The user manually creates or signs into their account and completes any required email, phone, CAPTCHA, or other verification.

After the user confirms login is complete, the module saves Playwright `storageState`, encrypts it with AES-256-GCM using `INDEED_SESSION_ENCRYPTION_KEY`, and writes it to `data/sessions/`.

`npm run indeed:check-session` starts a new browser context, restores the encrypted session state, opens Indeed, and checks whether the session still appears authenticated. The browser does not need to remain running between commands.

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
