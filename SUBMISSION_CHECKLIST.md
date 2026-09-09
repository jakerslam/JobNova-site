# JobNova Take-Home Submission Checklist

Source brief: [Software Engineer Intern (AI Application) take-home challenge](https://docs.google.com/document/d/1hxgbn3yY_iqIIpAqgxkDW8BuzRgIlEfM/edit?usp=sharing)

## Frontend Requirement Evidence

| Requirement | Status | Evidence |
| --- | --- | --- |
| Implement the supplied recommendation job board | Complete | Shared dashboard shell, job feed, matched/liked/applied tabs, detail route, design SVGs, and Figma-informed dimensions under `app/` and `components/`. |
| Responsive H5/mobile adaptation | Complete | Mobile navigation/right-panel drawers, wrapping card rows, responsive detail header/metadata, and horizontal-overflow guards in the shared shell and job views. |
| Reasonable interaction extensions | Complete | Persistent likes, copy-link confirmation, whole-card detail navigation, external title/company links, live status refresh, routed sidebar pages, and in-app application questions. |
| Public frontend demo | Complete | <https://jakerslam.github.io/JobNova-site/> |

## Backend Requirement Evidence

| Requirement | Status | Evidence |
| --- | --- | --- |
| Minimal end-to-end Indeed auto-apply module | Implemented; live final proof pending approval | Next.js Apply -> backend command -> leased Chrome companion -> guarded Indeed runner -> durable status. Fixture tests cover confirmed submission; a real application has been advanced to an employer question without submitting. |
| Candidate-owned Indeed account and manual verification | Candidate confirmation required | Account creation/login and any CAPTCHA, SMS, or email verification are intentionally manual. The app never stores a password. |
| Own profile, resume, contact, work, education, preferences | Complete locally | Ignored `backend/config/*.json`, ignored resume path, and `loadConfig.ts` validation. No personal profile or resume is committed. |
| Secure save/restore without a continuously running browser | Complete, with live expiry handled | `SessionStore` encrypts Playwright storage state using AES-256-GCM and an environment key. The workflow test proves encrypted round-trip; session checks use a fresh context and close it. Expired/challenged sessions return a manual checkpoint. |
| Pause/resume for CAPTCHA, SMS, email, login, and unknown input | Complete | Typed checkpoint reasons, persisted resume URLs, command leases, in-app question relay, and live proof for an Indeed relocation question. Security checkpoints bring Indeed forward and are never bypassed. |
| Select a small number of suitable jobs | Complete | Preference scoring/filtering, excluded keywords, canonical Indeed IDs, supported-apply checks, and enforced `maxApplicationsPerRun` range of 1-5. |
| Automatically complete recognized application steps | Complete in fixtures and live through manual checkpoint | Known profile/education/work fields, configured answers, existing Indeed resume selection, safe Continue/Review transitions, and confirmation-gated final submit. |
| Record pending, in progress, submitted, failed, manual action required | Complete | Durable application JSON store, timestamps, last step, failure/manual reason, frontend status labels, status CLI, and API. `skipped` is an additional explicit unsupported-result state. |
| Short backend README | Complete | `backend/README.md` documents architecture, session storage/restore, manual handling, failures, setup, APIs, and multi-user extension. |

## Automated Verification

Run from the repository root:

```bash
npm ci
npm --prefix backend ci
npm test
npm run lint
npm run typecheck
npm --prefix backend run typecheck
npm run build
```

GitHub Actions runs the same quality gate on pushes and pull requests.

## Candidate-Owned Final Steps

- [ ] Confirm the Indeed account was created/verified with the candidate's own email and phone.
- [ ] Answer any employer questions truthfully and explicitly approve final submission for one reasonably relevant role.
- [ ] Verify that the resulting record changes to `submitted` only after Indeed shows confirmation.
- [ ] Record the requested walkthrough video, keeping `.env`, personal profile data, session files, and private contact details out of the recording where possible.
- [ ] Email the repository, live frontend URL, and walkthrough video to `kevin@libaspace.com`.

## Known Prototype Boundaries

- The public GitHub Pages build is frontend-only; personal automation remains local.
- The normal-Chrome companion is the reliable live executor when Indeed challenges automation-launched contexts.
- The encrypted Playwright session adapter remains the reusable remote-session boundary and reports expired/challenged authentication honestly.
- External employer ATS sites are outside this minimal Indeed-hosted workflow and are recorded as unsupported/skipped.
- No CAPTCHA, verification, anti-bot, or platform security mechanism is bypassed.
