import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ApplicationStore,
  canonicalizeIndeedJobUrl,
  isUsableApplicationMetadata,
} from "../storage/ApplicationStore.js";
import {
  CompanionAgentRegistry,
  CompanionCommandError,
  CompanionCommandService,
  CompanionCommandStore,
} from "../workflow/companion.js";

function testCanonicalIndeedJobUpsert() {
  const fixture = createFixture();
  try {
    const first = fixture.applications.upsertPendingJob({
      jobUrl: "https://www.indeed.com/addlLoc/redirect?jk=abc123&from=search",
      title: "Software Engineer",
      company: "Example Company",
      supportsIndeedApply: true,
      relevanceScore: 0.9,
    });
    const second = fixture.applications.upsertPendingJob({
      jobUrl: "https://www.indeed.com/viewjob?jk=abc123&utm_source=test",
      title: "HomeCompany reviewsFind salariesMessages Unread count 1",
      company: "About us",
      relevanceScore: 0.8,
    });

    assertEqual(first.id, second.id, "canonical URLs update one application");
    assertEqual(second.jobUrl, "https://www.indeed.com/viewjob?jk=abc123", "canonical job URL");
    assertEqual(second.title, "Software Engineer", "bad title does not overwrite good metadata");
    assertEqual(second.company, "Example Company", "bad company does not overwrite good metadata");
    assertEqual(fixture.applications.list().filter((record) => record.jobUrl.includes("abc123")).length, 1, "canonical record count");
    assertEqual(canonicalizeIndeedJobUrl("https://www.indeed.com/jobs?vjk=DEF456"), "https://www.indeed.com/viewjob?jk=DEF456", "vjk canonicalization");
  } finally {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  }
}

function testLegacyRecordsAreCanonicalizedAndBadMetadataIsRejected() {
  const fixture = createFixture();
  try {
    fixture.applications.create({
      jobUrl: "https://www.indeed.com/addlLoc/redirect?jk=legacy123&from=search",
      title: "Sales Engineer",
      company: "Example Company",
      status: "manual_action_required",
      manualActionReason: "review_required",
    });
    fixture.applications.create({
      jobUrl: "https://www.indeed.com/viewjob?jk=legacy123&utm_source=duplicate",
      title: "Sales Engineer",
      company: "Example Company",
      status: "pending",
    });

    const records = fixture.applications.list().filter((record) => record.jobUrl.includes("legacy123"));
    assertEqual(records.length, 1, "legacy duplicate count");
    assertEqual(records[0].jobUrl, "https://www.indeed.com/viewjob?jk=legacy123", "legacy canonical URL");
    assertEqual(records[0].status, "manual_action_required", "strongest legacy status");
    assertEqual(
      isUsableApplicationMetadata({
        jobUrl: "https://www.indeed.com/viewjob?jk=bad123",
        title: "Indeed Home",
        company: "if (window.performance !== undefined) {",
      }),
      false,
      "page chrome metadata is rejected",
    );
  } finally {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  }
}

function testCompanionAgentReadiness() {
  let now = Date.parse("2026-09-09T00:00:00.000Z");
  const registry = new CompanionAgentRegistry(10_000, () => now);
  assertEqual(registry.status().ready, false, "registry starts disconnected");
  const connected = registry.heartbeat("agent-ready", "0.2.0");
  assertEqual(connected.ready, true, "heartbeat marks companion ready");
  assertEqual(connected.extensionVersion, "0.2.0", "heartbeat reports extension version");
  now += 10_001;
  assertEqual(registry.status().ready, false, "stale heartbeat expires");
}

function createFixture() {
  const tempDir = mkdtempSync(path.join(tmpdir(), "jobnova-companion-test-"));
  const applications = new ApplicationStore(path.join(tempDir, "applications.json"));
  const commands = new CompanionCommandStore(path.join(tempDir, "companion-commands.json"));
  const service = new CompanionCommandService(commands, applications);

  const application = applications.create({
    jobUrl: "https://www.indeed.com/viewjob?jk=companion-test",
    title: "Software Engineer",
    company: "Companion Test Company",
    status: "pending",
  });

  return { tempDir, applications, commands, service, application };
}

function testDispatchIsIdempotent() {
  const fixture = createFixture();
  try {
    const first = fixture.service.dispatch(fixture.application.id, false);
    const second = fixture.service.dispatch(fixture.application.id, true);

    assertEqual(first.command.id, second.command.id, "dispatch reuses the active command");
    assertEqual(second.command.allowSubmit, true, "dispatch updates allowSubmit on the active command");
    assertEqual(fixture.applications.get(fixture.application.id)?.status, "in_progress", "dispatch status");
    assertEqual(
      fixture.applications.get(fixture.application.id)?.lastStep,
      "queued_for_companion",
      "dispatch last step",
    );
    assertEqual(fixture.commands.list().length, 1, "dispatch creates one command");
  } finally {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  }
}

function testSubmittedApplicationCannotBeDispatchedAgain() {
  const fixture = createFixture();
  try {
    fixture.applications.update(fixture.application.id, {
      status: "submitted",
      lastStep: "submission_confirmed",
      submittedAt: new Date().toISOString(),
    });
    assertThrows(
      () => fixture.service.dispatch(fixture.application.id, true),
      "submitted application is not dispatched twice",
    );
  } finally {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  }
}

function testExclusiveClaim() {
  const fixture = createFixture();
  try {
    const dispatched = fixture.service.dispatch(fixture.application.id, false);
    const first = fixture.service.claim("agent-one");
    const second = fixture.service.claim("agent-two");

    assertTruthy(first, "first agent claims a command");
    assertEqual(first?.command.id, dispatched.command.id, "first claim id");
    assertEqual(second, undefined, "second agent sees no leased command");
    assertEqual(first?.command.state, "leased", "claim state");
  } finally {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  }
}

function testExpiredLeaseRecoveryAndStaleTokenRejection() {
  const fixture = createFixture();
  try {
    fixture.service.dispatch(fixture.application.id, false);
    const first = fixture.service.claim("agent-one");
    assertTruthy(first, "initial claim exists");

    fixture.commands.update(first!.command.id, { leaseExpiresAt: new Date(0).toISOString() });
    const recovered = fixture.service.claim("agent-two");
    assertTruthy(recovered, "expired lease is recoverable");
    assertEqual(recovered?.command.id, first?.command.id, "recovered command id");
    assertEqual(recovered?.command.agentId, "agent-two", "recovered owner");

    assertThrows(
      () => fixture.service.heartbeat(first!.command.id, "agent-one", first!.command.leaseToken!, "stale"),
      "stale lease token is rejected",
    );
  } finally {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  }
}

function testApplicationStatusPropagation() {
  const fixture = createFixture();
  try {
    fixture.service.dispatch(fixture.application.id, false);
    const claim = fixture.service.claim("agent-ready");
    assertTruthy(claim, "ready claim exists");

    const ready = fixture.service.report(claim!.command.id, "agent-ready", claim!.command.leaseToken!, {
      status: "in_progress",
      lastStep: "companion_tab_ready",
    });
    assertEqual(ready.command.state, "running", "running report command state");
    assertEqual(ready.application.status, "in_progress", "running report application status");
    assertEqual(ready.application.lastStep, "companion_tab_ready", "running report last step");

    assertThrows(
      () => fixture.service.report(claim!.command.id, "agent-ready", ready.command.leaseToken!, { status: "submitted", lastStep: "submit_clicked" }),
      "submission without confirmation is rejected",
    );
    assertThrows(
      () => fixture.service.report(claim!.command.id, "agent-ready", ready.command.leaseToken!, {
        status: "manual_action_required",
        lastStep: "manual_checkpoint",
      }),
      "manual status without a reason is rejected",
    );

    const manual = fixture.service.report(claim!.command.id, "agent-ready", ready.command.leaseToken!, {
      status: "manual_action_required",
      lastStep: "manual_checkpoint",
      manualActionReason: "captcha",
      manualActionUrl: "https://www.indeed.com/viewjob?jk=companion-test",
    });
    assertEqual(manual.command.state, "completed", "manual report command state");
    assertEqual(manual.application.status, "manual_action_required", "manual report application status");
    assertEqual(manual.application.manualActionReason, "captcha", "manual report reason");
    assertEqual(manual.application.manualActionUrl, "https://www.indeed.com/viewjob?jk=companion-test", "manual report URL");

    assertThrows(
      () => fixture.service.report(claim!.command.id, "agent-ready", ready.command.leaseToken!, { status: "submitted" }),
      "completed command rejects stale reports",
    );
  } finally {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  }
}

function testProfileProjectionAndManualResumeUrl() {
  const fixture = createFixture();
  try {
    fixture.service.dispatch(fixture.application.id, false);
    const claim = fixture.service.claim("profile-agent");
    assertTruthy(claim, "profile claim exists");

    const profile = fixture.service.profile(claim!.command.id, "profile-agent", claim!.command.leaseToken!, {
      firstName: "Test",
      lastName: "Candidate",
      email: "test@example.com",
      phone: "555-0100",
      location: "Austin, TX",
      resumePath: "/private/resume.pdf",
      links: { linkedIn: "https://linkedin.com/in/test" },
      workExperience: [],
      education: [],
      answers: { authorized_to_work_us: "Yes" },
    });

    assertEqual("resumePath" in profile, false, "profile projection excludes resume path");
    assertEqual(profile.firstName, "Test", "profile first name");
    assertEqual(profile.workExperience.length, 0, "profile projection includes work experience");
    assertEqual(profile.education.length, 0, "profile projection includes education");
    assertEqual(profile.answers.authorized_to_work_us, "Yes", "profile answers");

    const reported = fixture.service.report(claim!.command.id, "profile-agent", claim!.command.leaseToken!, {
      status: "manual_action_required",
      lastStep: "manual_checkpoint",
      manualActionReason: "captcha",
      manualActionUrl: "https://secure.indeed.com/auth",
    });
    const resumed = fixture.service.dispatch(fixture.application.id, false);
    assertEqual(reported.application.status, "manual_action_required", "manual resume source status");
    assertEqual(resumed.command.jobUrl, "https://secure.indeed.com/auth", "manual resume uses safe Indeed URL");
  } finally {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  }
}

function testUnsafeManualResumeUrlFallsBackToPosting() {
  const fixture = createFixture();
  try {
    fixture.applications.update(fixture.application.id, {
      status: "manual_action_required",
      manualActionReason: "review_required",
      manualActionUrl: "https://employer.example/apply",
    });

    const dispatched = fixture.service.dispatch(fixture.application.id, false);
    assertEqual(dispatched.command.jobUrl, fixture.application.jobUrl, "unsafe manual URL falls back to Indeed posting");
  } finally {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  }
}

function testInAppQuestionAnswerResumesTheSameApplication() {
  const fixture = createFixture();
  try {
    fixture.service.dispatch(fixture.application.id, true);
    const claim = fixture.service.claim("question-agent");
    assertTruthy(claim, "question command claim");

    fixture.service.report(claim!.command.id, "question-agent", claim!.command.leaseToken!, {
      status: "manual_action_required",
      lastStep: "unknown_required_field_2",
      manualActionReason: "unknown_field",
      manualActionUrl: "https://smartapply.indeed.com/apply/question-test",
      manualQuestion: {
        key: "indeed:radio:willing to relocate",
        label: "Willing to relocate?",
        type: "single_choice",
        options: ["Yes", "No"],
        required: true,
      },
    });

    assertThrows(
      () => fixture.service.answerAndDispatch(
        fixture.application.id,
        "indeed:radio:willing to relocate",
        "Maybe",
        true,
      ),
      "invalid in-app choice is rejected",
    );

    const resumed = fixture.service.answerAndDispatch(
      fixture.application.id,
      "indeed:radio:willing to relocate",
      "Yes",
      true,
    );
    assertEqual(resumed.command.jobUrl, "https://smartapply.indeed.com/apply/question-test", "answer resumes exact SmartApply URL");
    assertEqual(resumed.application.status, "in_progress", "answer resumes application status");
    assertEqual(
      fixture.applications.get(fixture.application.id)?.applicationAnswers?.["indeed:radio:willing to relocate"],
      "Yes",
      "answer is stored on the application",
    );

    const resumedClaim = fixture.service.claim("question-agent");
    const projected = fixture.service.profile(
      resumedClaim!.command.id,
      "question-agent",
      resumedClaim!.command.leaseToken!,
      {
        firstName: "Test",
        lastName: "Candidate",
        email: "test@example.com",
        phone: "555-0100",
        location: "Austin, TX",
        resumePath: "/private/resume.pdf",
        links: {},
        workExperience: [],
        education: [],
        answers: {},
      },
    );
    assertEqual(
      projected.applicationAnswers["indeed:radio:willing to relocate"],
      "Yes",
      "application answer is projected only to its resumed command",
    );
  } finally {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

function assertTruthy(actual: unknown, label: string) {
  if (!actual) throw new Error(`${label}: expected a truthy value`);
}

function assertThrows(action: () => unknown, label: string) {
  try {
    action();
  } catch (error) {
    if (error instanceof CompanionCommandError) return;
    throw new Error(`${label}: unexpected error ${error instanceof Error ? error.message : String(error)}`);
  }
  throw new Error(`${label}: expected an error`);
}

testCanonicalIndeedJobUpsert();
testLegacyRecordsAreCanonicalizedAndBadMetadataIsRejected();
testCompanionAgentReadiness();
testDispatchIsIdempotent();
testSubmittedApplicationCannotBeDispatchedAgain();
testExclusiveClaim();
testExpiredLeaseRecoveryAndStaleTokenRejection();
testApplicationStatusPropagation();
testProfileProjectionAndManualResumeUrl();
testUnsafeManualResumeUrlFallsBackToPosting();
testInAppQuestionAnswerResumesTheSameApplication();
console.log("Companion command protocol test passed: idempotent dispatch, exclusive claim, lease recovery, stale-token rejection, strict report validation, profile projection, and manual resume URL safety.");
