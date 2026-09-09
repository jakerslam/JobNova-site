import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ApplicationRecord, JobSearchResult } from "../workflow/types.js";

export class ApplicationStore {
  private readonly storePath: string;

  constructor(storePath = process.env.INDEED_APPLICATION_STORE_PATH ?? "./data/applications.json") {
    this.storePath = path.resolve(storePath);
    mkdirSync(path.dirname(this.storePath), { recursive: true });
  }

  list() {
    return dedupeApplications(this.readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string) {
    return this.readAll().find((record) => record.id === id);
  }

  getByUrl(jobUrl: string) {
    const identity = getIndeedJobIdentity(jobUrl);
    return this.readAll().find((record) => getIndeedJobIdentity(record.jobUrl) === identity);
  }

  listPending(limit?: number) {
    const pending = this.list().filter((record) => record.status === "pending" || record.status === "manual_action_required");
    return typeof limit === "number" ? pending.slice(0, limit) : pending;
  }

  upsertPendingJob(result: JobSearchResult) {
    const jobUrl = canonicalizeIndeedJobUrl(result.jobUrl);
    const existing = this.getByUrl(jobUrl);

    if (existing) {
      return this.update(existing.id, {
        jobUrl,
        title: preferMetadata(result.title, existing.title, "Indeed job"),
        company: preferMetadata(result.company, existing.company, "Unknown company"),
        companyProfileUrl: preferMetadata(result.companyProfileUrl, existing.companyProfileUrl),
        companyLogoUrl: preferMetadata(result.companyLogoUrl, existing.companyLogoUrl),
        location: preferMetadata(result.location, existing.location),
        country: preferMetadata(result.country, existing.country),
        jobType: preferMetadata(result.jobType, existing.jobType),
        workplace: preferMetadata(result.workplace, existing.workplace),
        experience: preferMetadata(result.experience, existing.experience),
        salary: preferMetadata(result.salary, existing.salary),
        seniority: preferMetadata(result.seniority, existing.seniority),
        supportsIndeedApply: result.supportsIndeedApply ?? existing.supportsIndeedApply,
        relevanceScore: result.relevanceScore,
      });
    }

    return this.create({
      jobUrl,
      title: result.title,
      company: result.company,
      companyProfileUrl: result.companyProfileUrl,
      companyLogoUrl: result.companyLogoUrl,
      location: result.location,
      country: result.country,
      jobType: result.jobType,
      workplace: result.workplace,
      experience: result.experience,
      salary: result.salary,
      seniority: result.seniority,
      supportsIndeedApply: result.supportsIndeedApply,
      relevanceScore: result.relevanceScore,
      status: "pending",
      lastStep: "discovered",
    });
  }

  create(record: Omit<ApplicationRecord, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const fullRecord: ApplicationRecord = {
      ...record,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    this.writeAll([...this.readAll(), fullRecord]);

    return fullRecord;
  }

  update(id: string, patch: Partial<Omit<ApplicationRecord, "id" | "createdAt">>) {
    const existing = this.get(id);
    if (!existing) throw new Error(`Application not found: ${id}`);

    const updated = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    this.writeAll(this.readAll().map((record) => (record.id === id ? updated : record)));

    return updated;
  }

  private readAll(): ApplicationRecord[] {
    if (!existsSync(this.storePath)) {
      return [];
    }

    const raw = readFileSync(this.storePath, "utf8").trim();
    if (!raw) return [];

    return JSON.parse(raw) as ApplicationRecord[];
  }

  private writeAll(records: ApplicationRecord[]) {
    writeFileSync(this.storePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }
}

function preferMetadata<T extends string | undefined>(nextValue: T, previousValue: T, placeholder = ""): T {
  if (!nextValue || nextValue === placeholder || isLowQualityMetadata(nextValue)) {
    return previousValue;
  }

  return nextValue;
}

export function canonicalizeIndeedJobUrl(value: string) {
  try {
    const url = new URL(value);
    const jobKey = getIndeedJobKey(url);
    if (!jobKey) return value;
    return `https://www.indeed.com/viewjob?jk=${encodeURIComponent(jobKey)}`;
  } catch {
    return value;
  }
}

export function getIndeedJobIdentity(value: string) {
  try {
    const url = new URL(value);
    const jobKey = getIndeedJobKey(url);
    if (jobKey) return `indeed:${jobKey.toLowerCase()}`;
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

export function isUsableApplicationMetadata(record: Pick<ApplicationRecord, "title" | "company" | "jobUrl">) {
  const title = record.title.trim();
  const company = record.company.trim();
  return (
    /^https:\/\/(?:[^/]+\.)?indeed\.com\//i.test(record.jobUrl) &&
    !isLowQualityMetadata(title) &&
    !isLowQualityMetadata(company) &&
    title.length >= 3 &&
    company.length >= 2 &&
    !company.startsWith("(") &&
    title.toLowerCase() !== company.toLowerCase() &&
    !title.toLowerCase().startsWith(`${company.toLowerCase()} `)
  );
}

function getIndeedJobKey(url: URL) {
  const direct = url.searchParams.get("jk") || url.searchParams.get("vjk") || url.searchParams.get("fromjk");
  if (direct && /^[a-z0-9]+$/i.test(direct)) return direct;

  const pathMatch = url.pathname.match(/\b([a-f0-9]{16})\b/i);
  return pathMatch?.[1];
}

function isLowQualityMetadata(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return (
    !normalized ||
    normalized.length > 180 ||
    /HomeCompany reviewsFind salaries|Start of main content|Unread count|Employers \/ Post Job/i.test(normalized) ||
    /^(?:Indeed Home|Indeed Jobs?|Unknown company|Company name)$/i.test(normalized) ||
    /^(?:if\s*\(window\.|window\.__|function\s*\()/i.test(normalized) ||
    /^(?:about us|what you(?:'|’)ll do|what you will do|responsibilities|qualifications|job details|full job description)$/i.test(normalized)
  );
}

function dedupeApplications(records: ApplicationRecord[]) {
  const grouped = new Map<string, ApplicationRecord>();

  for (const record of records) {
    const identity = getIndeedJobIdentity(record.jobUrl);
    const current = grouped.get(identity);
    if (!current) {
      grouped.set(identity, record);
      continue;
    }

    const preferred = applicationStatusRank(record.status) > applicationStatusRank(current.status) ? record : current;
    const alternate = preferred === record ? current : record;
    grouped.set(identity, {
      ...preferred,
      jobUrl: canonicalizeIndeedJobUrl(preferred.jobUrl),
      title: preferMetadata(preferred.title, alternate.title, "Indeed job"),
      company: preferMetadata(preferred.company, alternate.company, "Unknown company"),
      companyProfileUrl: preferMetadata(preferred.companyProfileUrl, alternate.companyProfileUrl),
      companyLogoUrl: preferMetadata(preferred.companyLogoUrl, alternate.companyLogoUrl),
      location: preferMetadata(preferred.location, alternate.location),
      country: preferMetadata(preferred.country, alternate.country),
      jobType: preferMetadata(preferred.jobType, alternate.jobType),
      workplace: preferMetadata(preferred.workplace, alternate.workplace),
      experience: preferMetadata(preferred.experience, alternate.experience),
      salary: preferMetadata(preferred.salary, alternate.salary),
      seniority: preferMetadata(preferred.seniority, alternate.seniority),
      supportsIndeedApply: preferred.supportsIndeedApply ?? alternate.supportsIndeedApply,
      relevanceScore: preferred.relevanceScore ?? alternate.relevanceScore,
      applicationAnswers: {
        ...alternate.applicationAnswers,
        ...preferred.applicationAnswers,
      },
    });
  }

  return Array.from(grouped.values()).map((record) => ({
    ...record,
    jobUrl: canonicalizeIndeedJobUrl(record.jobUrl),
  }));
}

function applicationStatusRank(status: ApplicationRecord["status"]) {
  return {
    submitted: 6,
    manual_action_required: 5,
    in_progress: 4,
    pending: 3,
    failed: 2,
    skipped: 1,
  }[status];
}
