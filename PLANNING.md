# Planning Audit

## Current Status

This project is now a Next.js, React, TypeScript, and Tailwind implementation informed by the provided Figma screenshots. It is still not a connector-verified pixel-perfect implementation because `get_design_context` cannot read the supplied Figma node.

The Figma design could not be read through the connector. The provided URL points to `node-id=0-1`, but calls using both `0:1` and `0-1` returned `INVALID_ARGUMENT`. Because of that, the current UI should be treated as a concept implementation based on Jobnova's product direction, not as a pixel-perfect translation.

The Google brief also could not be read. The connected Drive account first reported it as an Office file rather than a native Google Doc, then returned `File not found` when attempting to fetch the original file.

## Stack Decision

Chosen stack:

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Lucide React icons
- Local static assets in `public/`
- API-ready service modules in `services/`

This is the better stack for the intended project because it supports SEO metadata, future backend routes, typed data models, reusable UI components, and service boundaries.

This stack should be revisited only if the brief explicitly requires:

- Another framework
- A separate backend repository
- A specific deployment host
- A specific component library

## Mobile H5 Plan

The brief says there is no H5 page design, so the mobile view should be adapted from the desktop dashboard using best practices rather than inventing a separate product surface.

Implemented H5 adaptation:

- Sidebar collapses into a menu drawer
- AI mock interview panel opens as a drawer
- Top tabs become horizontally scrollable
- Job cards stack with tighter spacing and smaller headings
- Detail preview stacks vertically and keeps the CTA reachable
- Desktop right rail is hidden until requested on smaller screens

## Interaction Extensions

The brief allows additional JavaScript effects that are useful but not shown in the design.

Implemented interaction extensions:

- Matched / Liked / Applied tabs open routeable page views
- Opening a job card navigates to a full job detail view
- Heart icon toggles temporary liked state in both list and detail views
- Liked jobs persist in browser `localStorage` and appear in the Liked tab
- List and detail pages attempt to fetch backend Liked and Applied jobs on load
- Link button copies the job URL and temporarily changes to a checkmark
- Mobile menu opens and closes with an overlay
- Mobile AI interview drawer opens and closes from the header
- Cards open on full-card click and use a shadow-only hover state

## Page Views

Implemented route structure:

- `/jobs/matched`
- `/jobs/liked`
- `/jobs/applied`
- `/jobs/[status]/[jobId]`

The root route redirects to `/jobs/matched`.

## Design Fidelity Requirements

To claim the implementation follows the Figma design exactly, we still need:

- A readable Figma node through `get_design_context`
- The reference screenshot from Figma
- Design tokens: colors, typography, spacing, radius, shadows
- Exported image and icon assets from the Figma file
- Frame dimensions and responsive behavior
- A side-by-side visual QA pass against desktop and mobile screenshots

Until those are available, the project should not be described as pixel-perfect or Figma-complete.

The current screenshot-derived fidelity targets are:

- Use the supplied Jobnova icon as the brand mark
- Reproduce the left sidebar navigation and upgrade card
- Reproduce the Matched / Liked / Applied top navigation
- Reproduce job cards with circular match score, metadata, pills, and actions
- Reproduce the right AI mock interview panel
- Include a detail-state section similar to the provided UX Designer screen

## Latest Card Dimension Targets

The job list card is now being adjusted toward the Dev Mode screenshots:

- Dashboard shell widened to support the Figma desktop proportions
- Main job list column targets an `870px` desktop width
- Job-card radius targets roughly `13px`
- Top card content area targets about `124px`
- Tags row targets about `59px`
- Footer/action row targets about `59px`
- Match-score component reserves an approximately `108px` square region
- Title text uses the supplied Inter `600`, `24.8px`, `32.35px`, `-2%` letter-spacing spec

## Current Product Assumptions

The current page assumes Jobnova's core product surface includes:

- AI job matching
- Resume optimization
- Auto-apply workflows
- H-1B friendly filtering
- Recruiter discovery
- Application tracking

These assumptions should be replaced or tightened if the inaccessible brief says otherwise.

## Recommended Next Step

Before further visual implementation, get access to one of the following:

- A Figma node-specific URL for the actual target frame
- View access for the connected Figma account
- Exported screenshots and assets from the Figma file
- A downloadable copy of the Google Doc brief

After that, rebuild or adjust the UI from the source design instead of continuing to improvise from product positioning.
