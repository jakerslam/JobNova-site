import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ApplicationStore } from "./storage/ApplicationStore.js";
import { loadCandidateProfile, loadJobPreferences } from "./config/loadConfig.js";
import { IndeedApplicationRunner } from "./indeed/IndeedApplicationRunner.js";
import { importIndeedSessionFromChrome } from "./indeed/IndeedBrowserImport.js";
import { IndeedSessionManager } from "./indeed/IndeedSessionManager.js";
import { buildIndeedSearchUrls, collectIndeedJobs } from "./indeed/IndeedSearch.js";

const command = process.argv[2];
const args = process.argv.slice(3);

function getArg(name: string) {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function getSessionName() {
  return getArg("session-name") ?? process.env.INDEED_SESSION_NAME ?? "default";
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

async function waitForEnter(message: string) {
  const rl = createInterface({ input, output });
  try {
    await rl.question(message);
  } finally {
    rl.close();
  }
}

async function login() {
  const manager = new IndeedSessionManager(undefined, getSessionName());
  const session = await manager.openFreshSession();

  try {
    await session.page.goto("https://secure.indeed.com/auth", { waitUntil: "domcontentloaded" });
    await waitForEnter(
      "Complete Indeed account creation/login and any verification in the browser, then press Enter here to save the session.",
    );
    await manager.save(session.context);
    console.log("Indeed session saved.");
  } finally {
    await session.close();
  }
}

async function checkSession() {
  const manager = new IndeedSessionManager(undefined, getSessionName());
  const result = await manager.checkSession();

  if (result.ok) {
    console.log("Indeed session restored successfully.");
    return;
  }

  printJson(result);
  process.exitCode = 1;
}

async function importSession() {
  const cdpUrl = getArg("cdp-url") ?? process.env.CHROME_CDP_URL;
  const result = await importIndeedSessionFromChrome(cdpUrl, getSessionName());
  printJson({
    ...result,
    message: "Encrypted Indeed-only session state imported from connected Chrome.",
  });
}

async function status() {
  const store = new ApplicationStore();
  printJson(store.list());
}

async function search() {
  const preferences = await loadJobPreferences();
  const urls = buildIndeedSearchUrls(preferences);

  if (args.includes("--collect")) {
    const sessionName = getSessionName();
    const manager = new IndeedSessionManager(undefined, sessionName);
    const store = new ApplicationStore();
    const session = await manager.openRestoredSession();

    try {
      const jobs = await collectIndeedJobs(session.page, preferences);
      const records = jobs.map((job) => store.upsertPendingJob(job));
      printJson({
        saved: records.length,
        records,
      });
      return;
    } finally {
      await session.close();
    }
  }

  printJson({
    maxApplicationsPerRun: preferences.maxApplicationsPerRun,
    searchUrls: urls,
    note: "Run with --collect after login to collect and save suitable jobs as pending.",
  });
}

async function apply() {
  const profile = await loadCandidateProfile();
  const runner = new IndeedApplicationRunner(profile, undefined, new IndeedSessionManager(undefined, getSessionName()));
  const preferences = await loadJobPreferences();

  if (args.includes("--run")) {
    const results = await runner.applyPending(preferences.maxApplicationsPerRun);
    printJson({ processed: results.length, results });
    return;
  }

  printJson({
    plannedFields: runner.summarizePlannedFields(),
    note: "Run with --run after login and search --collect to process pending jobs with manual safeguards.",
  });
}

async function resume() {
  const applicationId = getArg("application-id");

  if (!applicationId) {
    throw new Error("Missing --application-id=<id>.");
  }

  const store = new ApplicationStore();
  const record = store.get(applicationId);

  if (!record) {
    throw new Error(`Application not found: ${applicationId}`);
  }

  const profile = await loadCandidateProfile();
  const runner = new IndeedApplicationRunner(profile, undefined, new IndeedSessionManager(undefined, getSessionName()));
  const result = await runner.applyToRecord(record);

  printJson({ result });
}

async function queueUrl() {
  const jobUrl = getArg("job-url");
  const title = getArg("title") ?? "Manually queued job";
  const company = getArg("company") ?? "Unknown company";
  const location = getArg("location");

  if (!jobUrl) {
    throw new Error("Missing --job-url=<indeed job url>.");
  }

  const store = new ApplicationStore();
  const record = store.upsertPendingJob({
    jobUrl,
    title,
    company,
    location,
    relevanceScore: 1,
  });

  printJson(record);
}

async function main() {
  switch (command) {
    case "login":
      await login();
      break;
    case "check-session":
      await checkSession();
      break;
    case "import-session":
      await importSession();
      break;
    case "status":
      await status();
      break;
    case "search":
      await search();
      break;
    case "apply":
      await apply();
      break;
    case "resume":
      await resume();
      break;
    case "queue-url":
      await queueUrl();
      break;
    default:
      console.log(
        "Usage: tsx src/cli.ts <login|check-session|import-session|status|search|apply|resume|queue-url> [--session-name=default]",
      );
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
