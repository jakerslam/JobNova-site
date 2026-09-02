# JobNova Career Dashboard

Internship application project for a Figma-informed AI job-search dashboard.

The project implements a JobNova-style career dashboard with matched jobs, liked jobs, applied jobs, job detail pages, temporary saved-state persistence, backend-ready service boundaries, and responsive H5/mobile behavior.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Lucide React icons plus custom SVG icons from the supplied design assets
- Local API route handlers for backend-ready data access
- Browser `localStorage` for temporary prototype state

This stack was chosen because it supports SEO metadata, routeable product pages, typed data models, server/API integration, reusable components, and straightforward deployment to modern frontend hosting platforms.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Useful checks:

```bash
npm run typecheck
npm run lint
npm run build
```

## Routes

- `/` redirects to `/jobs/matched`
- `/jobs/matched`
- `/jobs/liked`
- `/jobs/applied`
- `/jobs/[status]/[jobId]`

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
- Premium/non-premium job-fit panel on the job detail page
- Fixed dashboard rails: sidebar and right panel stay visible while the center content scrolls

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

The match ring is shared between the feed and detail pages through `components/MatchRing.tsx`, so styling and rendering behavior stay consistent.

## Responsive Behavior

The brief requested an H5/mobile adaptation without a supplied mobile design. The mobile implementation follows dashboard best practices:

- Sidebar collapses into a drawer
- Right-side assistant/fit panel opens as a drawer
- Top tabs remain accessible on small screens
- Job cards stack and preserve primary actions
- Job detail content remains readable in a single-column layout

## Backend-Ready Structure

The project is currently using mock data, but it is organized for backend integration:

- `types/job.ts` defines the job data model
- `services/jobs.ts` contains the current job service boundary
- `app/api/jobs/route.ts` exposes a local API endpoint
- Frontend clients already fetch Liked and Applied job data on load

Future backend integrations can replace the mock service with database/API calls without changing the main UI contract.

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

## Notes

The Figma file was used through provided screenshots and extracted SVG snippets. If direct Figma Dev Mode or connector access becomes available, the next step would be a final side-by-side visual QA pass against the original frame dimensions, spacing, typography, colors, shadows, and exported assets.
