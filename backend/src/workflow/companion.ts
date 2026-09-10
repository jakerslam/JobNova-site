import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applicationStatuses, manualActionReasons, type ApplicationStatus, type ManualActionReason } from "./statuses.js";
import { ApplicationStore } from "../storage/ApplicationStore.js";
import type { CandidateProfile, ManualApplicationQuestion } from "./types.js";

export const companionCommandStates = ["queued", "leased", "running", "completed", "failed"] as const;
export type CompanionCommandState = (typeof companionCommandStates)[number];

export type CompanionCommand = {
  id: string;
  applicationId: string;
  jobUrl: string;
  state: CompanionCommandState;
  allowSubmit: boolean;
  agentId: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  lastStep: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompanionReport = {
  status: ApplicationStatus;
  lastStep?: string;
  manualActionReason?: ManualActionReason;
  manualActionUrl?: string;
  manualQuestion?: ManualApplicationQuestion;
  failureReason?: string;
};

export type CompanionAgent = {
  agentId: string;
  extensionVersion?: string;
  lastSeenAt: string;
};

export class CompanionCommandError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "CompanionCommandError";
  }
}

export class CompanionCommandStore {
  private readonly storePath: string;

  constructor(storePath = process.env.INDEED_COMPANION_COMMAND_STORE_PATH ?? "./data/companion-commands.json") {
    this.storePath = path.resolve(storePath);
    mkdirSync(path.dirname(this.storePath), { recursive: true });
  }

  list() {
    return this.readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string) {
    return this.readAll().find((command) => command.id === id);
  }

  findActiveForApplication(applicationId: string) {
    return this.readAll().find(
      (command) => command.applicationId === applicationId && isActiveCommand(command),
    );
  }

  create(input: Pick<CompanionCommand, "applicationId" | "jobUrl" | "allowSubmit">) {
    const now = new Date().toISOString();
    const command: CompanionCommand = {
      id: randomUUID(),
      applicationId: input.applicationId,
      jobUrl: input.jobUrl,
      state: "queued",
      allowSubmit: input.allowSubmit,
      agentId: null,
      leaseToken: null,
      leaseExpiresAt: null,
      lastStep: "queued_for_companion",
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };

    this.writeAll([...this.readAll(), command]);
    return command;
  }

  update(id: string, patch: Partial<Omit<CompanionCommand, "id" | "createdAt">>) {
    const commands = this.readAll();
    const existing = commands.find((command) => command.id === id);
    if (!existing) throw new CompanionCommandError(`Companion command not found: ${id}`, 404);

    const updated: CompanionCommand = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.writeAll(commands.map((command) => (command.id === id ? updated : command)));
    return updated;
  }

  claimOldest(agentId: string, leaseMs = getLeaseMs()) {
    const now = Date.now();
    const candidate = this.readAll()
      .filter((command) => command.state === "queued" || isExpiredLease(command, now))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

    if (!candidate) return undefined;

    return this.update(candidate.id, {
      state: "leased",
      agentId,
      leaseToken: randomUUID(),
      leaseExpiresAt: new Date(now + leaseMs).toISOString(),
    });
  }

  private readAll(): CompanionCommand[] {
    if (!existsSync(this.storePath)) return [];

    const raw = readFileSync(this.storePath, "utf8").trim();
    if (!raw) return [];

    return JSON.parse(raw) as CompanionCommand[];
  }

  private writeAll(commands: CompanionCommand[]) {
    const temporaryPath = `${this.storePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(commands, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, this.storePath);
  }
}

export class CompanionAgentRegistry {
  private readonly agents = new Map<string, CompanionAgent>();

  constructor(
    private readonly ttlMs = 70_000,
    private readonly now = () => Date.now(),
  ) {}

  heartbeat(agentId: string, extensionVersion?: string) {
    const normalizedAgentId = requireNonEmpty(agentId, "agentId");
    const agent: CompanionAgent = {
      agentId: normalizedAgentId,
      extensionVersion: extensionVersion?.trim() || undefined,
      lastSeenAt: new Date(this.now()).toISOString(),
    };
    this.agents.set(normalizedAgentId, agent);
    return this.status();
  }

  status() {
    const cutoff = this.now() - this.ttlMs;
    const agents = Array.from(this.agents.values()).filter((agent) => Date.parse(agent.lastSeenAt) >= cutoff);
    for (const [agentId, agent] of Array.from(this.agents.entries())) {
      if (Date.parse(agent.lastSeenAt) < cutoff) this.agents.delete(agentId);
    }

    return {
      ready: agents.length > 0,
      connectedAgents: agents.length,
      extensionVersion: agents[0]?.extensionVersion,
      lastSeenAt: agents[0]?.lastSeenAt,
    };
  }
}

export class CompanionCommandService {
  constructor(
    private readonly commands = new CompanionCommandStore(),
    private readonly applications = new ApplicationStore(),
  ) {}

  dispatch(applicationId: string, allowSubmit: boolean) {
    const application = this.requireApplication(applicationId);
    if (application.status === "submitted") {
      throw new CompanionCommandError("This Indeed application is already submitted.", 409);
    }
    if (application.supportsIndeedApply === false) {
      throw new CompanionCommandError("This job uses an external employer application and cannot be submitted by the Indeed companion.", 422);
    }
    const commandUrl = getSafeCommandUrl(application);
    const active = this.commands.findActiveForApplication(applicationId);
    const command = active
      ? this.commands.update(active.id, { allowSubmit, lastStep: "queued_for_companion", failureReason: null })
      : this.commands.create({ applicationId, jobUrl: commandUrl, allowSubmit });

    const updatedApplication = this.applications.update(application.id, {
      status: "in_progress",
      lastStep: "queued_for_companion",
      manualActionReason: undefined,
      manualActionUrl: undefined,
      manualQuestion: undefined,
      failureReason: undefined,
    });

    return { command, application: updatedApplication };
  }

  claim(agentId: string) {
    const normalizedAgentId = requireNonEmpty(agentId, "agentId");
    const command = this.commands.claimOldest(normalizedAgentId);
    if (!command) return undefined;

    const application = this.requireApplication(command.applicationId);
    const updatedApplication = this.applications.update(application.id, {
      status: "in_progress",
      lastStep: "leased_by_companion",
    });

    return { command, application: updatedApplication };
  }

  profile(commandId: string, agentId: string, leaseToken: string, candidate: CandidateProfile) {
    const command = this.requireLease(commandId, agentId, leaseToken);
    const application = this.requireApplication(command.applicationId);

    return {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
      location: candidate.location,
      links: { ...candidate.links },
      workExperience: candidate.workExperience.map((experience) => ({ ...experience })),
      education: candidate.education.map((education) => ({ ...education })),
      answers: { ...candidate.answers },
      applicationAnswers: { ...application.applicationAnswers },
    };
  }

  answerAndDispatch(applicationId: string, questionKey: string, value: string, allowSubmit: boolean) {
    const application = this.requireApplication(applicationId);
    const question = application.manualQuestion;
    if (
      application.status !== "manual_action_required" ||
      application.manualActionReason !== "unknown_field" ||
      !question
    ) {
      throw new CompanionCommandError("This application is not waiting for an in-app question response.", 409);
    }

    const normalizedKey = requireNonEmpty(questionKey, "questionKey");
    const normalizedValue = requireNonEmpty(value, "value");
    if (normalizedKey !== question.key) {
      throw new CompanionCommandError("The submitted answer does not match the current application question.", 409);
    }
    if (normalizedValue.length > 2_000) {
      throw new CompanionCommandError("Application answers must be 2,000 characters or fewer.");
    }
    if (question.options?.length && !question.options.includes(normalizedValue)) {
      throw new CompanionCommandError("The submitted answer is not one of the available choices.");
    }

    this.applications.update(application.id, {
      applicationAnswers: {
        ...application.applicationAnswers,
        [question.key]: normalizedValue,
      },
    });
    return this.dispatch(application.id, allowSubmit);
  }

  heartbeat(commandId: string, agentId: string, leaseToken: string, lastStep?: string) {
    const command = this.requireLease(commandId, agentId, leaseToken);
    const nextStep = lastStep?.trim() || command.lastStep || "companion_heartbeat";
    const updatedCommand = this.commands.update(command.id, {
      state: "running",
      lastStep: nextStep,
      leaseExpiresAt: new Date(Date.now() + getLeaseMs()).toISOString(),
    });
    const application = this.applications.update(command.applicationId, {
      status: "in_progress",
      lastStep: nextStep,
    });

    return { command: updatedCommand, application };
  }

  report(commandId: string, agentId: string, leaseToken: string, report: CompanionReport) {
    const command = this.requireLease(commandId, agentId, leaseToken);
    validateReport(report);

    const commandState: CompanionCommandState = report.status === "failed"
      ? "failed"
      : report.status === "submitted" || report.status === "manual_action_required" || report.status === "skipped"
        ? "completed"
        : "running";
    const updatedCommand = this.commands.update(command.id, {
      state: commandState,
      lastStep: report.lastStep?.trim() || command.lastStep,
      failureReason: report.failureReason?.trim() || null,
      leaseExpiresAt: commandState === "running" ? new Date(Date.now() + getLeaseMs()).toISOString() : null,
    });
    const applicationPatch = {
      status: report.status,
      lastStep: report.lastStep ?? updatedCommand.lastStep ?? undefined,
      manualActionReason: report.manualActionReason,
      manualActionUrl: report.manualActionUrl,
      manualQuestion: report.manualQuestion,
      failureReason: report.failureReason,
      ...(report.status === "submitted" ? { submittedAt: new Date().toISOString() } : {}),
    };
    const application = this.applications.update(command.applicationId, applicationPatch);

    return { command: updatedCommand, application };
  }

  private requireApplication(applicationId: string) {
    const application = this.applications.get(applicationId);
    if (!application) throw new CompanionCommandError(`Application not found: ${applicationId}`, 404);
    return application;
  }

  private requireLease(commandId: string, agentId: string, leaseToken: string) {
    const command = this.commands.get(commandId);
    if (!command) throw new CompanionCommandError(`Companion command not found: ${commandId}`, 404);
    if (!agentId || command.agentId !== agentId || !leaseToken || command.leaseToken !== leaseToken) {
      throw new CompanionCommandError("Companion command lease ownership is invalid or stale.", 409);
    }
    if (!command.leaseExpiresAt || new Date(command.leaseExpiresAt).getTime() <= Date.now()) {
      throw new CompanionCommandError("Companion command lease has expired.", 409);
    }
    if (command.state !== "leased" && command.state !== "running") {
      throw new CompanionCommandError("Companion command is no longer active.", 409);
    }
    return command;
  }
}

function isActiveCommand(command: CompanionCommand) {
  return command.state === "queued" || command.state === "leased" || command.state === "running";
}

function isExpiredLease(command: CompanionCommand, now: number) {
  return (command.state === "leased" || command.state === "running") &&
    Boolean(command.leaseExpiresAt) &&
    new Date(command.leaseExpiresAt as string).getTime() <= now;
}

function getLeaseMs() {
  const configured = Number(process.env.INDEED_COMPANION_LEASE_MS ?? 30_000);
  return Number.isFinite(configured) && configured >= 1_000 ? configured : 30_000;
}

function requireNonEmpty(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new CompanionCommandError(`Missing required field: ${label}.`);
  return normalized;
}

function validateReport(report: CompanionReport) {
  if (!applicationStatuses.includes(report.status)) {
    throw new CompanionCommandError(`Unsupported application status: ${String(report.status)}.`);
  }
  if (report.manualActionReason && !manualActionReasons.includes(report.manualActionReason)) {
    throw new CompanionCommandError(`Unsupported manual action reason: ${report.manualActionReason}.`);
  }
  if (report.status === "manual_action_required" && !report.manualActionReason) {
    throw new CompanionCommandError("manual_action_required reports must include a valid manualActionReason.");
  }
  if (report.status === "submitted" && report.lastStep !== "submission_confirmed") {
    throw new CompanionCommandError("submitted reports require lastStep=submission_confirmed.");
  }
  if (report.manualActionUrl && !isIndeedOwnedUrl(report.manualActionUrl)) {
    throw new CompanionCommandError("manualActionUrl must be an Indeed-owned URL.");
  }
  if (report.manualQuestion) validateManualQuestion(report.manualQuestion, report);
}

function validateManualQuestion(question: ManualApplicationQuestion, report: CompanionReport) {
  if (report.status !== "manual_action_required" || report.manualActionReason !== "unknown_field") {
    throw new CompanionCommandError("manualQuestion is only valid for an unknown_field checkpoint.");
  }
  const key = question.key?.trim();
  const label = question.label?.trim();
  if (!key || key.length > 240 || !label || label.length > 500) {
    throw new CompanionCommandError("manualQuestion requires a bounded key and label.");
  }
  if (!["text", "single_choice", "boolean", "select"].includes(question.type)) {
    throw new CompanionCommandError("manualQuestion has an unsupported type.");
  }
  if (question.options && (
    question.options.length > 30 ||
    question.options.some((option) => !option.trim() || option.length > 240)
  )) {
    throw new CompanionCommandError("manualQuestion options are invalid.");
  }
  if ((question.type === "single_choice" || question.type === "select") && !question.options?.length) {
    throw new CompanionCommandError("Choice questions must include options.");
  }
}

function getSafeCommandUrl(application: { jobUrl: string; status: ApplicationStatus; manualActionUrl?: string }) {
  if (!isIndeedOwnedUrl(application.jobUrl)) {
    throw new CompanionCommandError("Companion commands can only open Indeed-owned job URLs.", 422);
  }

  if (
    application.status === "manual_action_required" &&
    application.manualActionUrl &&
    application.manualActionUrl !== application.jobUrl &&
    isIndeedContinuationUrl(application.manualActionUrl)
  ) {
    return application.manualActionUrl;
  }

  return application.jobUrl;
}

function isIndeedContinuationUrl(value: string) {
  try {
    const url = new URL(value);
    if (!isIndeedOwnedUrl(value)) return false;
    if (url.hostname === "smartapply.indeed.com") {
      // The bare review route is not a resumable application. Indeed relies on
      // transient context from the preceding application route, so reopening it
      // produces an empty page. Stateful SmartApply routes remain resumable.
      return !(url.pathname.endsWith("/form/review-module") && !url.search);
    }
    if (url.hostname === "secure.indeed.com") return true;
    return url.hostname === "profile.indeed.com" && url.pathname.startsWith("/tailored-resume/") && Boolean(url.searchParams.get("continue"));
  } catch {
    return false;
  }
}

export function isIndeedOwnedUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "indeed.com" || url.hostname.endsWith(".indeed.com"));
  } catch {
    return false;
  }
}
