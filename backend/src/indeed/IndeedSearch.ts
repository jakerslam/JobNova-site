import type { Page } from "playwright";
import type { JobPreferences, JobSearchResult } from "../workflow/types.js";

export function buildIndeedSearchUrls(preferences: JobPreferences) {
  const urls: string[] = [];

  for (const title of preferences.titles) {
    for (const location of preferences.locations) {
      const params = new URLSearchParams({
        q: title,
        l: location,
      });

      urls.push(`https://www.indeed.com/jobs?${params.toString()}`);
    }
  }

  return urls.slice(0, 8);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function absoluteIndeedUrl(href: string) {
  if (href.startsWith("http")) return href;
  return new URL(href, "https://www.indeed.com").toString();
}

export function scoreJob(job: Omit<JobSearchResult, "relevanceScore">, preferences: JobPreferences) {
  const haystack = normalize(`${job.title} ${job.company} ${job.location ?? ""} ${job.snippet ?? ""}`);
  const excluded = [...preferences.excludedCompanies, ...preferences.excludedKeywords].some((keyword) =>
    haystack.includes(normalize(keyword)),
  );

  if (excluded) return 0;

  const requiredMatches = preferences.requiredKeywords.filter((keyword) => haystack.includes(normalize(keyword))).length;
  const titleMatches = preferences.titles.filter((title) => haystack.includes(normalize(title))).length;
  const locationMatches = preferences.locations.filter((location) => haystack.includes(normalize(location))).length;
  const remoteMatch = preferences.remoteOptions.some((option) => haystack.includes(option));

  return requiredMatches * 10 + titleMatches * 20 + locationMatches * 8 + (remoteMatch ? 6 : 0);
}

export async function collectIndeedJobs(page: Page, preferences: JobPreferences): Promise<JobSearchResult[]> {
  const searchUrls = buildIndeedSearchUrls(preferences);
  const byUrl = new Map<string, JobSearchResult>();

  for (const searchUrl of searchUrls) {
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    const results = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href*='/rc/clk'], a[href*='/viewjob'], a[data-jk]"));

      return anchors.slice(0, 8).map((anchor) => {
        const card = anchor.closest("[class*='job'], [data-testid*='job'], li, td, div");
        const title = anchor.textContent?.trim() || anchor.getAttribute("aria-label") || "Untitled role";
        const text = card?.textContent?.replace(/\s+/g, " ").trim() ?? title;
        const lines = text.split(/(?=[A-Z][a-z]+(?:\s|$))/).map((line) => line.trim()).filter(Boolean);

        return {
          href: anchor.href || anchor.getAttribute("href") || "",
          title,
          company: lines.find((line) => line !== title && line.length < 80) ?? "Unknown company",
          location: text.match(/(?:Remote|Salt Lake City[^,$]*|[A-Z][a-z]+,\s[A-Z]{2})/)?.[0],
          snippet: text.slice(0, 500),
        };
      });
    });

    for (const result of results) {
      if (!result.href) continue;

      const candidate = {
        jobUrl: absoluteIndeedUrl(result.href),
        title: result.title,
        company: result.company,
        location: result.location,
        snippet: result.snippet,
      };
      const relevanceScore = scoreJob(candidate, preferences);

      if (relevanceScore <= 0) continue;

      byUrl.set(candidate.jobUrl, {
        ...candidate,
        relevanceScore,
      });
    }

    if (byUrl.size >= preferences.maxApplicationsPerRun) break;
  }

  return Array.from(byUrl.values())
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, preferences.maxApplicationsPerRun);
}
