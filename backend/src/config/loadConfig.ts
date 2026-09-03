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

export async function loadCandidateProfile(): Promise<CandidateProfile> {
  const profile = await readJson<CandidateProfile>("candidate-profile.json");
  const requiredFields: Array<keyof CandidateProfile> = ["firstName", "lastName", "email", "phone", "location", "resumePath"];

  for (const field of requiredFields) {
    if (!profile[field]) {
      throw new Error(`Candidate profile is missing required field: ${field}`);
    }
  }

  await assertReadable(profile.resumePath, "Resume file");
  return profile;
}

export async function loadJobPreferences(): Promise<JobPreferences> {
  const preferences = await readJson<JobPreferences>("job-preferences.json");

  if (!preferences.titles.length) throw new Error("Job preferences must include at least one title.");
  if (!preferences.locations.length) throw new Error("Job preferences must include at least one location.");
  if (!preferences.maxApplicationsPerRun || preferences.maxApplicationsPerRun < 1) {
    throw new Error("Job preferences must set maxApplicationsPerRun to at least 1.");
  }

  return preferences;
}
