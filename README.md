# Jobnova Career Dashboard

Internship application project for a Figma-informed AI job-search dashboard.

## What is included

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- Lucide icons
- API-ready service layer in `services/jobs.ts`
- Backend-ready route handler at `app/api/jobs/route.ts`
- Supplied Jobnova icon at `public/jobnova-icon.png`
- Figma-informed dashboard layout based on the provided screenshots
- Best-practice H5/mobile responsive adaptation
- Additional React interactions: routeable tabs, save/unsave hearts, copied-link feedback, full-card navigation, mobile menu drawer, and mobile mock-interview drawer
- Routeable page views for each jobs tab and each job detail screen
- Temporary like persistence through browser `localStorage`
- Client-side fetch attempts for Liked and Applied jobs on page load

## Source notes

The implementation now follows the provided screenshots as the source of truth for visible layout:

- Left Jobnova sidebar
- Matched / Liked / Applied top tabs
- Job cards with match rings, metadata, tags, and Apply / Mock Interview actions
- Right AI mock interview panel
- Detail preview section for a selected role
- H5 mobile adaptation because no separate mobile design was supplied

The Figma connector still returns `INVALID_ARGUMENT` for the supplied `node-id=0-1`, so exact token extraction and exported Figma assets are not yet available through the connector.

If a connector-readable Figma node becomes available, compare this implementation against the Figma-generated screenshot and tighten dimensions, tokens, and assets.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Routes

- `/jobs/matched`
- `/jobs/liked`
- `/jobs/applied`
- `/jobs/liked/ux-designer`
- `/jobs/matched/web-application-developer`

## Temporary state

Liked jobs are stored in browser temp memory with `localStorage` under `jobnova:liked-jobs`. The Liked page combines fetched backend data with this temporary state so newly liked jobs appear without a backend write.
