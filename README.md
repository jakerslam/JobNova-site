# JobNova Career Dashboard

Internship application project for a Figma-informed AI job-search dashboard.

The project implements a JobNova-style career dashboard with matched jobs, liked jobs, applied jobs, job detail pages, temporary saved-state persistence, a local Indeed automation backend, and responsive H5/mobile behavior.

## Live Demo

[https://jakerslam.github.io/JobNova-site/](https://jakerslam.github.io/JobNova-site/)

The hosted URL demonstrates the responsive frontend with sample data. The Indeed workflow runs locally because it depends on a private candidate profile, encrypted session material, a local backend, and the candidate's authenticated Chrome extension.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Lucide React icons plus custom SVG icons from the supplied design assets
- Local API route handlers for backend-ready data access
- Local Node/TypeScript backend for the Indeed workflow
- Playwright for encrypted managed-session storage and restore verification
- Chrome extension companion for authenticated job collection and guarded Indeed Apply execution
- Browser `localStorage` for temporary prototype state

This stack was chosen because it supports SEO metadata, routeable product pages, typed data models, server/API integration, reusable components, and straightforward deployment to modern frontend hosting platforms.

## Getting Started

```bash
npm ci
npm --prefix backend ci
npm run dev:all
```

Open `http://localhost:3000`. This starts both the Next.js frontend and the local Indeed automation backend.

For frontend-only work:

```bash
npm run dev
```

Useful checks:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm --prefix backend run typecheck
```

The same checks run in GitHub Actions through `.github/workflows/ci.yml`.

## Routes

- `/`
- `/jobs/matched`
- `/jobs/liked`
- `/jobs/applied`
- `/jobs/[status]/[jobId]`
- `/mock-interview`
- `/resume`
- `/profile`
- `/settings`
- `/subscription`
- `/credits`

Example detail routes:

- `/jobs/matched/web-application-developer`
- `/jobs/liked/ux-designer`

## Implemented Features

- Routeable Matched, Liked, and Applied job tabs
- Full job-card click navigation into job detail pages
- Like/unlike support in both the job feed and job detail view
- Temporary liked-job persistence through `localStorage`
- Liked page reflects temporary likes immediately
- Page-load fetch attempts for Liked and Applied jobs through `/api/jobs`
- Copy-link button that switches to a checkmark after copying
- Company name links to LinkedIn when a LinkedIn URL exists
- Job title links to an Indeed search URL for the role
- Resilient company logo rendering with external logo URL support and fallback placeholder
- Live Indeed application records merge into the main job feed when the local backend is running
- Collected Indeed jobs can be opened, tracked, and run through the guarded apply workflow
- Chrome extension companion can send visible jobs from a logged-in Indeed tab to the local backend
- Premium/non-premium job-fit panel on the job detail page
- Fixed dashboard rails: sidebar and right panel stay visible while the center content scrolls
- Clickable sidebar navigation with routed page views for mock interview, resume, profile, settings, subscription, and credits

## Design Implementation

The UI was built from the supplied Figma screenshots and user-provided SVG assets. Implemented design surfaces include:

- JobNova sidebar with custom icon set
- Sidebar navigation grouping and separators
- Upgrade/subscription prompt card
- Matched, Liked, Applied top navigation
- Job feed card layout with match ring, metadata, tags, and actions
- Job detail page with top action row, company/logo block, metadata grid, and interview prompt
- Right rail for mock interview content on the feed
- Right rail for job-fit analysis on detail pages
- Shared dashboard shell across all sidebar pages

The match ring is shared between the feed and detail pages through `components/MatchRing.tsx`, so styling and rendering behavior stay consistent.

## Responsive Behavior

The brief requested an H5/mobile adaptation without a supplied mobile design. The mobile implementation follows dashboard best practices:

- Sidebar collapses into a drawer
- Right-side assistant/fit panel opens as a drawer
- Top tabs remain accessible on small screens
- Job cards stack and preserve primary actions
- Job detail content remains readable in a single-column layout

## Frontend Data Boundary

The dashboard keeps the UI contract behind typed service and hook boundaries:

- `types/job.ts` defines the job data model
- `services/jobs.ts` contains the current job service boundary
- `services/indeedBackend.ts` maps backend application records into feed-ready jobs
- `app/api/jobs/route.ts` exposes a local API endpoint
- Frontend clients already fetch Liked and Applied job data on load

Static design-sample jobs remain available for GitHub Pages. When the local backend is running, collected Indeed jobs are merged into the feed as live cards with real Indeed URLs, application status, and optional company logos.

## Indeed Auto-Apply Backend

The backend engineering test is scoped in [BACKEND_SRS.md](./BACKEND_SRS.md), with implementation under [backend/](./backend/).

The backend module has both CLI and HTTP API entrypoints. It handles private candidate configuration, encrypted Indeed session storage, manual verification checkpoints, job collection, application status tracking, and a guarded application runner without committing personal data or session artifacts.

The application runner has two modes:

- Review mode: fill known fields, upload the configured resume when possible, and pause before final submission.
- Submit mode: enabled only with `allowSubmit`; clicks final submit buttons for suitable queued jobs when no manual checkpoint or unknown required field is detected.

A final button click is not considered success by itself. Both executors require an unambiguous Indeed confirmation before recording `submitted`.

## Indeed Chrome Companion

The extension in [extension/](./extension/) is the live product executor when Indeed trusts the user's normal Chrome tab but rejects backend-restored browser sessions.

Load it locally:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repo's `extension` folder.
5. Start the local backend with `npm run dev:all`.
6. Open a logged-in Indeed search page.
7. Click **Send visible jobs** in the JobNova toolbar or extension popup.

The extension does not read cookies or bypass verification. Its service worker advertises readiness and claims leased commands, while the JobNova page bridge shortens polling latency whenever the app is open. It extracts supported jobs, sends them to the backend, recognizes Indeed-hosted Apply controls, fills known profile fields, advances safe steps, and submits only when the JobNova Apply action explicitly enables submission. Ordinary employer questions are relayed into a JobNova modal and resumed in the background. The Indeed tab comes forward only for login, CAPTCHA, email/SMS verification, ambiguous resume selection, or a screen that cannot be represented safely in JobNova.

Commands and leases are persisted in `backend/data/companion-commands.json` by default. The backend rejects new dispatches when no current extension heartbeat is present and accepts `submitted` only after an unambiguous Indeed confirmation.

## Logo Enrichment Plan

Jobs support:

- `companyDomain`
- `companyLogoUrl`
- `companyLinkedInUrl`

The frontend attempts to render `companyLogoUrl`. If the image fails to load, it falls back to a default company placeholder icon.

Recommended backend logo resolution order:

1. Existing `companyLogoUrl` stored in the database
2. Logo supplied by an official job/ATS/Indeed payload
3. Logo provider lookup by `companyDomain`
4. LinkedIn organization lookup, if approved API access is available
5. Placeholder fallback

## Temporary Prototype State

Temporary state is stored in browser `localStorage`:

- `jobnova:liked-jobs` stores liked job IDs
- `jobnova:has-premium` controls the premium/non-premium job-fit panel state

For testing the premium panel:

```js
localStorage.setItem("jobnova:has-premium", "true")
```

Refresh the job detail page afterward.

## Assignment Coverage

[SUBMISSION_CHECKLIST.md](./SUBMISSION_CHECKLIST.md) maps every take-home requirement to its implementation and verification evidence. It also separates automated proof from the three candidate-owned completion steps: confirming the Indeed account, approving one relevant real submission, and recording the requested walkthrough video.

## Notes

The Figma file was implemented through the supplied screenshots, dimensions, and extracted SVG assets. The shared desktop shell and mobile adaptations were checked for viewport overflow, fixed-rail behavior, readable wrapping, and route consistency.
