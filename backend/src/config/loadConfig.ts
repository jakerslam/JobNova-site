import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { CandidateProfile, JobPreferences } from "../workflow/types.js";

const configDir = path.resolve("config");

async function readJson<T>(fileName: string): Promise<T> {
  const filePath = path.join(configDir, fileName);
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function assertReadable(filePath: string, label: string) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`${label} is missing or unreadable: ${filePath}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function loadCandidateProfile(): Promise<CandidateProfile> {
  const candidate = await readJson<unknown>("candidate-profile.json");
  if (!isRecord(candidate)) throw new Error("Candidate profile must be a JSON object.");

  const requiredFields: Array<keyof CandidateProfile> = ["firstName", "lastName", "email", "phone", "location", "resumePath"];

  for (const field of requiredFields) {
    if (typeof candidate[field] !== "string" || !candidate[field].trim()) {
      throw new Error(`Candidate profile is missing required field: ${field}`);
    }
  }

  if (!Array.isArray(candidate.workExperience) || candidate.workExperience.length === 0) {
    throw new Error("Candidate profile must include at least one work experience entry.");
  }
  if (!Array.isArray(candidate.education) || candidate.education.length === 0) {
    throw new Error("Candidate profile must include at least one education entry.");
  }
  if (!isRecord(candidate.links) || !isRecord(candidate.answers)) {
    throw new Error("Candidate profile must include links and answers objects.");
  }

  const profile = candidate as CandidateProfile;
  await assertReadable(profile.resumePath, "Resume file");
  return profile;
}

export async function loadJobPreferences(): Promise<JobPreferences> {
  const candidate = await readJson<unknown>("job-preferences.json");
  if (!isRecord(candidate)) throw new Error("Job preferences must be a JSON object.");

  const preferences = candidate as JobPreferences;

  if (!Array.isArray(preferences.titles) || !preferences.titles.length) {
    throw new Error("Job preferences must include at least one title.");
  }
  if (!Array.isArray(preferences.locations) || !preferences.locations.length) {
    throw new Error("Job preferences must include at least one location.");
  }
  if (!Array.isArray(preferences.remoteOptions)) {
    throw new Error("Job preferences must include remoteOptions.");
  }
  if (!preferences.maxApplicationsPerRun || preferences.maxApplicationsPerRun < 1) {
    throw new Error("Job preferences must set maxApplicationsPerRun to at least 1.");
  }
  if (preferences.maxApplicationsPerRun > 5) {
    throw new Error("Job preferences must keep maxApplicationsPerRun at 5 or fewer for this low-volume prototype.");
  }

  return preferences;
}
