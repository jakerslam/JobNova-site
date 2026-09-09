import { chromium } from "playwright";
import path from "node:path";

const contentPath = path.resolve(process.cwd(), "../extension/content.js");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript({ content: buildChromeStub() });
  await page.route("https://www.indeed.com/jobs?q=software&l=Austin%2C+TX", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <div class="job_seen_beacon" data-jk="abc123">
          <h2 class="jobTitle"><a href="/pagead/clk?tracking=1">Software Engineer</a></h2>
          <span data-testid="company-name">Example Company</span>
          <div data-testid="text-location">Austin, TX</div>
          <span>Easily apply</span>
          <span>$90,000 - $110,000 a year</span>
        </div>
      </body></html>`,
    });
  });
  await page.route("https://www.indeed.com/viewjob?jk=abc123", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head>
        <script type="application/ld+json">${JSON.stringify({
          "@type": "JobPosting",
          title: "Software Engineer",
          hiringOrganization: { name: "Example Company" },
          jobLocation: { address: { addressLocality: "Austin", addressRegion: "TX" } },
        })}</script>
      </head><body><main><h1>Software Engineer</h1><button>Apply with Indeed</button></main></body></html>`,
    });
  });

  try {
    await page.goto("https://www.indeed.com/jobs?q=software&l=Austin%2C+TX", { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ path: contentPath });
    const response = await page.evaluate(() => window.__jobnovaCollect());
    assertEqual(response.ok, true, "collection response");
    assertEqual(response.jobsQueued, 1, "queued count");

    const jobs = await page.evaluate(() => window.__jobnovaQueuedJobs);
    assertEqual(jobs.length, 1, "captured job count");
    assertEqual(jobs[0].jobUrl, "https://www.indeed.com/viewjob?jk=abc123", "canonical URL");
    assertEqual(jobs[0].title, "Software Engineer", "job title");
    assertEqual(jobs[0].company, "Example Company", "company name");
    assertEqual(jobs[0].location, "Austin, TX", "location");
    assertEqual(jobs[0].supportsIndeedApply, true, "Indeed Apply support");
    assertEqual(jobs[0].salary, "$90,000 - $110,000 a year", "salary");
  } finally {
    await browser.close();
  }

  console.log("Indeed content extraction test passed: canonical URL, structured metadata, salary, and Apply support are preserved.");
}

function buildChromeStub() {
  return `
    window.__jobnovaListeners = [];
    window.__jobnovaQueuedJobs = [];
    window.chrome = {
      runtime: {
        onMessage: { addListener(listener) { window.__jobnovaListeners.push(listener); } },
        sendMessage(message) {
          if (message.type === 'JOBNOVA_QUEUE_JOBS') {
            window.__jobnovaQueuedJobs = message.jobs;
            return Promise.resolve({ ok: true, queued: message.jobs.length, message: 'Queued test jobs.' });
          }
          return Promise.resolve({ ok: true });
        }
      }
    };
    window.__jobnovaCollect = () => new Promise((resolve) => {
      for (const listener of window.__jobnovaListeners) {
        const handled = listener({ type: 'JOBNOVA_COLLECT_FROM_POPUP' }, {}, resolve);
        if (handled) return;
      }
      resolve({ ok: false, message: 'No content listener.' });
    });
  `;
}

declare global {
  interface Window {
    __jobnovaCollect: () => Promise<{ ok: boolean; jobsQueued?: number }>;
    __jobnovaQueuedJobs: Array<Record<string, unknown>>;
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
