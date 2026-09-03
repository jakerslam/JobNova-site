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
    return this.readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string) {
    return this.readAll().find((record) => record.id === id);
  }

  getByUrl(jobUrl: string) {
    return this.readAll().find((record) => record.jobUrl === jobUrl);
  }

  listPending(limit?: number) {
    const pending = this.list().filter((record) => record.status === "pending" || record.status === "manual_action_required");
    return typeof limit === "number" ? pending.slice(0, limit) : pending;
  }

  upsertPendingJob(result: JobSearchResult) {
    const existing = this.getByUrl(result.jobUrl);

    if (existing) {
      return this.update(existing.id, {
        title: result.title,
        company: result.company,
        location: result.location,
        relevanceScore: result.relevanceScore,
      });
    }

    return this.create({
      jobUrl: result.jobUrl,
      title: result.title,
      company: result.company,
      location: result.location,
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
