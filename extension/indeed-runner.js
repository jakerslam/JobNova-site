(() => {
  const runningCommands = new Set();
  const completedCommands = new Set();
  const maxSteps = 16;
  const transitionTimeoutMs = Number(globalThis.__JOBNOVA_TEST_TIMEOUT_MS__) || 20_000;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "JOBNOVA_RUN_INDEED_COMMAND") return false;

    const command = message.command;
    if (!command?.id || completedCommands.has(command.id)) {
      sendResponse({ ok: true, accepted: false, reason: "command_already_complete" });
      return false;
    }

    if (runningCommands.has(command.id)) {
      sendResponse({ ok: true, accepted: false, reason: "command_already_running" });
      return false;
    }

    runningCommands.add(command.id);
    sendResponse({ ok: true, accepted: true });
    runCommand(command)
      .catch((error) => reportFailure(command, error instanceof Error ? error.message : String(error)))
      .finally(() => runningCommands.delete(command.id));
    return false;
  });

  chrome.runtime.sendMessage({
    type: "JOBNOVA_INDEED_RUNNER_READY",
    href: window.location.href,
  }).catch(() => undefined);

  async function runCommand(command) {
    if (!isIndeedOwnedUrl(window.location.href)) {
      await report(command, {
        status: "skipped",
        lastStep: "external_application",
        failureReason: "External employer application links are outside this minimal Indeed workflow.",
      });
      completedCommands.add(command.id);
      return;
    }

    const profileResponse = await chrome.runtime.sendMessage({
      type: "JOBNOVA_FETCH_COMPANION_PROFILE",
      commandId: command.id,
      agentId: command.agentId,
      leaseToken: command.leaseToken,
    });
    if (!profileResponse?.ok || !profileResponse.profile) {
      throw new Error(profileResponse?.message || "The candidate profile could not be loaded for this leased command.");
    }

    const profile = profileResponse.profile;
    for (let step = 1; step <= maxSteps; step += 1) {
      if (hasSubmissionConfirmation()) {
        await report(command, { status: "submitted", lastStep: "submission_confirmed" });
        completedCommands.add(command.id);
        return;
      }

      const checkpoint = await detectStableCheckpoint();
      if (checkpoint) {
        await pause(command, checkpoint.reason, checkpoint.message, `manual_checkpoint_${step}`);
        completedCommands.add(command.id);
        return;
      }

      if (!isApplicationPage()) {
        const applyResolution = await waitForApplyTarget();
        if (applyResolution.checkpoint) {
          await pause(command, applyResolution.checkpoint.reason, applyResolution.checkpoint.message, `manual_checkpoint_${step}`);
          completedCommands.add(command.id);
          return;
        }

        const applyTarget = applyResolution.target;
        if (!applyTarget) {
          await report(command, {
            status: "skipped",
            lastStep: "apply_button_not_found",
            failureReason: "No recognizable Indeed-hosted Apply button was found.",
          });
          completedCommands.add(command.id);
          return;
        }

        if (applyTarget.external) {
          await report(command, {
            status: "skipped",
            lastStep: "external_application",
            failureReason: "This posting sends applications to an external employer site, which is outside this workflow.",
          });
          completedCommands.add(command.id);
          return;
        }

        await report(command, { status: "in_progress", lastStep: "apply_clicked" });
        activateTarget(applyTarget.element);
        const handoff = await waitForApplicationHandoff(command);
        if (handoff === "transferred") return;
        if (handoff === "not_detected") {
          await pause(
            command,
            "review_required",
            "Indeed did not expose a recognizable application form after Apply was clicked.",
            "application_form_not_detected",
          );
          completedCommands.add(command.id);
          return;
        }
      }

      await waitForApplicationSurface();

      if (hasSubmissionConfirmation()) {
        await report(command, { status: "submitted", lastStep: "submission_confirmed" });
        completedCommands.add(command.id);
        return;
      }

      const transitionedCheckpoint = await detectStableCheckpoint();
      if (transitionedCheckpoint) {
        await pause(command, transitionedCheckpoint.reason, transitionedCheckpoint.message, `manual_checkpoint_${step}`);
        completedCommands.add(command.id);
        return;
      }

      const resumeSelection = selectSafeExistingResume();
      if (resumeSelection.blocked) {
        await pause(command, "unknown_field", resumeSelection.blocked, `resume_selection_required_${step}`);
        completedCommands.add(command.id);
        return;
      }
      if (resumeSelection.selected) {
        await report(command, { status: "in_progress", lastStep: `existing_resume_selected_${step}` });
        await delay(200);
      }

      const fileCheckpoint = detectResumeCheckpoint();
      if (fileCheckpoint) {
        await pause(command, "unknown_field", fileCheckpoint, `resume_upload_required_${step}`);
        completedCommands.add(command.id);
        return;
      }

      fillKnownFields(profile);
      await report(command, { status: "in_progress", lastStep: `profile_fields_filled_${step}` });
      await delay(150);

      const unknownQuestion = findUnknownRequiredField();
      if (unknownQuestion) {
        await pause(
          command,
          "unknown_field",
          `Required field needs your input: ${unknownQuestion.label}`,
          `unknown_required_field_${step}`,
          unknownQuestion,
        );
        completedCommands.add(command.id);
        return;
      }

      const finalSubmit = findFinalSubmitTarget();
      if (finalSubmit) {
        if (!command.allowSubmit) {
          await pause(command, "review_required", "Final review is ready. Inspect the application before submitting.", "final_review_guard");
          completedCommands.add(command.id);
          return;
        }

        await report(command, { status: "in_progress", lastStep: "final_submit_clicked" });
        activateTarget(finalSubmit);
        const confirmation = await waitForSubmissionConfirmation(command);

        if (confirmation === "confirmed") {
          await report(command, { status: "submitted", lastStep: "submission_confirmed" });
        } else if (confirmation === "same_tab") {
          await pause(command, "review_required", "The final button was clicked, but no unambiguous Indeed confirmation was observed.", "submission_clicked_without_confirmation");
        } else {
          return;
        }
        completedCommands.add(command.id);
        return;
      }

      const next = findNextTarget();
      if (!next) {
        await pause(command, "review_required", "No safe Continue, Next, Review, or confirmation step was detected.", `review_required_${step}`);
        completedCommands.add(command.id);
        return;
      }

      await report(command, { status: "in_progress", lastStep: `clicked_${next.label}` });
      const previousSurface = applicationSurfaceFingerprint();
      activateTarget(next.element);
      const advanced = await waitForApplicationChange(previousSurface);
      if (!advanced) {
        const blockedQuestion = findUnknownRequiredField();
        if (blockedQuestion) {
          await pause(
            command,
            "unknown_field",
            `Required field needs your input: ${blockedQuestion.label}`,
            `unknown_required_field_${step}`,
            blockedQuestion,
          );
        } else {
          await pause(command, "review_required", `Indeed did not advance after ${next.label.replaceAll("_", " ")} was clicked.`, `step_did_not_advance_${step}`);
        }
        completedCommands.add(command.id);
        return;
      }
    }

    await pause(command, "review_required", "The guarded runner reached its step limit and stopped for review.", "max_steps_reached");
    completedCommands.add(command.id);
  }

  function detectCheckpoint() {
    const url = window.location.href.toLowerCase();
    const checkpointText = Array.from(document.querySelectorAll(
      "h1, h2, h3, [role='alert'], [role='dialog'], [data-testid*='captcha' i], [id*='captcha' i]",
    ))
      .filter(isVisible)
      .map(actionLabel)
      .join(" ");
    const hasCaptchaFrame = Array.from(document.querySelectorAll("iframe[src*='captcha' i], iframe[title*='captcha' i], iframe[src*='challenge' i]"))
      .some(isVisible);

    if (
      /\/cdn-cgi\/challenge-platform|__cf_chl_|challenge-platform/i.test(url) ||
      hasCaptchaFrame ||
      /captcha|verify you are human|checking your browser|just a moment|robot check|human verification/i.test(checkpointText)
    ) {
      return { reason: "captcha", message: "Indeed is requesting CAPTCHA or human verification." };
    }
    const verificationInput = Array.from(document.querySelectorAll(
      "input[autocomplete='one-time-code'], input[name*='verification' i], input[id*='verification' i], input[aria-label*='verification code' i]",
    )).find(isVisible);
    const verificationText = `${checkpointText} ${verificationInput ? getFieldLabel(verificationInput) : ""}`;
    if (verificationInput || /one[- ]time password|one[- ]time code|verification code|security code|sms code|text message code|email code|enter the code/i.test(verificationText)) {
      const reason = /sms|text message|phone|mobile/i.test(verificationText) ? "sms" : "email";
      return { reason, message: `Manual ${reason} verification is required.` };
    }
    const loginHeading = Array.from(document.querySelectorAll("h1, h2"))
      .filter(isVisible)
      .some((heading) => /^(?:sign|log) in(?: to indeed)?$/i.test(actionLabel(heading)));
    const hasVisiblePassword = Array.from(document.querySelectorAll("input[type='password']")).some(isVisible);
    if (/secure\.indeed\.com\/auth|\/account\/login|\/login(?:\/|$|\?)/i.test(url) || (loginHeading && hasVisiblePassword)) {
      return { reason: "login", message: "Indeed login or authentication is required in the normal browser tab." };
    }
    return null;
  }

  async function detectStableCheckpoint() {
    const checkpoint = detectCheckpoint();
    if (checkpoint?.reason !== "captcha") return checkpoint;

    // Indeed can briefly render a Cloudflare/interstitial surface before the
    // normal job page. Waiting is safe; the runner never interacts with it.
    await delay(Math.min(3_000, transitionTimeoutMs));
    return detectCheckpoint();
  }

  function detectResumeCheckpoint() {
    for (const input of document.querySelectorAll("input[type='file']")) {
      const label = getFieldLabel(input);
      if (input.required || /resume|cv|curriculum/i.test(label)) {
        return `A resume upload is required${label ? ` for ${label}` : ""}. Choose the file manually.`;
      }
    }
    return null;
  }

  function selectSafeExistingResume() {
    const heading = Array.from(document.querySelectorAll("h1, h2"))
      .filter(isVisible)
      .map(actionLabel)
      .find((label) => /^(?:add|select|choose) a resume$/i.test(label));
    if (!heading) return { selected: false };

    const options = Array.from(document.querySelectorAll("input[type='radio']"))
      .filter(isVisible)
      .map((input) => ({ input, label: getResumeOptionLabel(input) }));
    if (!options.length) return { selected: false };

    const indeedResume = options.find((option) => /^use your indeed resume\b/i.test(option.label));
    const uploadedResumes = options.filter((option) =>
      option !== indeedResume && !/ai[- ]tailored|create.*resume|no resume/i.test(option.label),
    );
    const safeOption = indeedResume || (uploadedResumes.length === 1 ? uploadedResumes[0] : undefined);

    if (!safeOption) {
      return {
        selected: false,
        blocked: "Choose which of your existing resumes Indeed should use for this application.",
      };
    }
    if (safeOption.input.checked) return { selected: false };

    const target = safeOption.input.closest("[data-testid*='radio-card'], label") || safeOption.input;
    target.click();
    return { selected: true };
  }

  function getResumeOptionLabel(input) {
    const container = input.closest("[data-testid*='radio-card'], label");
    return actionLabel(container || input);
  }

  function isApplicationPage() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes("smartapply.indeed.com")) return true;
    if (/\/(?:apply|application)(?:\/|$)/i.test(window.location.pathname)) return true;

    for (const form of document.querySelectorAll("form")) {
      const formText = form.innerText || "";
      const hasCandidateField = Boolean(form.querySelector(
        "input[type='email'], input[type='tel'], input[type='file'], input[aria-label*='first name' i], input[aria-label*='last name' i]",
      ));
      const hasApplicationAction = /continue|next|review|submit(?: your)? application|send application|apply now/i.test(formText);
      if (hasCandidateField && hasApplicationAction) return true;
    }
    return false;
  }

  function findApplyTarget() {
    for (const element of visibleActionElements()) {
      const label = actionLabel(element);
      if (!isIndeedApplyLabel(label)) continue;
      const href = element.closest("a")?.href || element.getAttribute("href") || "";
      if (/apply on company site|continue to company site|external application/i.test(label)) {
        return { element, external: true };
      }
      if (href && !isIndeedOwnedUrl(href)) return { element, external: true };
      return { element, external: false };
    }
    return null;
  }

  function isIndeedApplyLabel(label) {
    const normalized = label
      .replace(/\s+opens in a new (?:tab|window)\.?$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    return /^(?:apply(?:\s+(?:now|with indeed|on indeed|for this job))?|easily apply|start application|start your application)$/i.test(normalized);
  }

  async function waitForApplyTarget(timeoutMs = Math.min(12_000, transitionTimeoutMs)) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const checkpoint = await detectStableCheckpoint();
      if (checkpoint) return { checkpoint };

      const target = findApplyTarget();
      if (target) return { target };

      if (isApplicationPage()) return {};
      await delay(250);
    }
    return {};
  }

  function findFinalSubmitTarget() {
    for (const element of visibleActionElements()) {
      const label = actionLabel(element);
      if (/^(submit(?: your)? application|submit|send application|apply now)$/i.test(label)) return element;
    }
    return null;
  }

  async function waitForApplicationHandoff(command, timeoutMs = transitionTimeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (isApplicationPage() || detectCheckpoint()) return "same_tab";

      const ownership = await chrome.runtime.sendMessage({
        type: "JOBNOVA_CHECK_COMPANION_OWNER",
        commandId: command.id,
      });
      if (!ownership?.isCurrentTab) return "transferred";
      await delay(250);
    }
    return "not_detected";
  }

  async function waitForSubmissionConfirmation(command, timeoutMs = transitionTimeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (hasSubmissionConfirmation()) return "confirmed";

      const ownership = await chrome.runtime.sendMessage({
        type: "JOBNOVA_CHECK_COMPANION_OWNER",
        commandId: command.id,
      });
      if (!ownership?.isCurrentTab) return "transferred";
      await delay(250);
    }
    return "same_tab";
  }

  function findNextTarget() {
    for (const element of visibleActionElements()) {
      const label = actionLabel(element).toLowerCase();
      if (/^(continue|next|review|review resume|save and continue|continue application|continue applying|continue to application|continue to next step)$/.test(label)) {
        return { element, label: label.replace(/\s+/g, "_") };
      }
    }
    return null;
  }

  function fillKnownFields(profile) {
    for (const field of document.querySelectorAll("input, textarea, select")) {
      if (!isVisible(field) || field.disabled || field.type === "hidden" || field.type === "file") continue;
      const label = getQuestionLabel(field).toLowerCase();
      const value = profile.applicationAnswers?.[getQuestionKey(field)] ?? resolveFieldValue(label, profile);
      if (value === undefined) continue;

      if (field.tagName.toLowerCase() === "select") {
        const option = Array.from(field.options).find((candidate) =>
          candidate.value.toLowerCase() === value.toLowerCase() || candidate.textContent.trim().toLowerCase() === value.toLowerCase(),
        );
        if (option) {
          field.value = option.value;
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
        }
        continue;
      }

      if (field.type === "radio" || field.type === "checkbox") {
        const optionLabels = [getFieldLabel(field), field.value || ""].map(normalizeAnswer).filter(Boolean);
        const shouldCheck = field.type === "radio"
          ? optionLabels.includes(normalizeAnswer(value))
          : /^(yes|true|1)$/i.test(value);
        if (field.checked !== shouldCheck) field.click();
        continue;
      }

      if (!field.value) {
        setFieldValue(field, value);
      }
    }
  }

  function resolveFieldValue(label, profile) {
    if (/first name|given name/.test(label)) return profile.firstName;
    if (/last name|family name|surname/.test(label)) return profile.lastName;
    if (/full name|your name/.test(label)) return `${profile.firstName} ${profile.lastName}`;
    if (/e-?mail/.test(label)) return profile.email;
    if (/phone|mobile|telephone/.test(label)) return profile.phone;
    if (/\b(?:city|current location|location)\b/.test(label)) return profile.location;
    if (/linkedin/.test(label)) return profile.links?.linkedIn;
    if (/portfolio|website/.test(label)) return profile.links?.portfolio;
    if (/github/.test(label)) return profile.links?.github;
    if (/current|most recent/.test(label) && /job title|position|role/.test(label)) return profile.workExperience?.[0]?.title;
    if (/current|most recent/.test(label) && /employer|company/.test(label)) return profile.workExperience?.[0]?.company;
    if (/school|university|college/.test(label)) return profile.education?.[0]?.school;
    if (/degree/.test(label)) return profile.education?.[0]?.degree;
    if (/field of study|major/.test(label)) return profile.education?.[0]?.field;

    const answerAliases = {
      authorized_to_work_us: ["authorized to work", "legally authorized", "work in the united states", "work in the us"],
      requires_sponsorship: ["require sponsorship", "need sponsorship", "visa sponsorship", "sponsorship"],
      security_clearance: ["security clearance", "clearance"],
      willing_to_relocate: ["relocate", "relocation"],
      willing_to_commute: ["commute"],
    };
    for (const [key, value] of Object.entries(profile.answers || {})) {
      const aliases = answerAliases[key] || [key.replace(/[_-]+/g, " ").toLowerCase()];
      if (aliases.some((alias) => label.includes(alias))) return value;
    }
    return undefined;
  }

  function findUnknownRequiredField() {
    for (const field of document.querySelectorAll(
      "input[required], textarea[required], select[required], input[aria-required='true'], textarea[aria-required='true'], select[aria-required='true']",
    )) {
      if (!isVisible(field) || field.disabled || field.type === "file") continue;
      if (field.type === "checkbox" || field.type === "radio") {
        const groupChecked = field.name
          ? Boolean(document.querySelector(`[name='${CSS.escape(field.name)}']:checked`))
          : field.checked;
        if (!groupChecked) return describeManualQuestion(field);
      } else if (!field.value?.trim()) {
        return describeManualQuestion(field);
      }
    }

    // Indeed sometimes marks the radiogroup as required in its rendered copy
    // without adding required/aria-required to the underlying radio inputs.
    for (const group of document.querySelectorAll("[role='radiogroup'], fieldset")) {
      if (!isVisible(group) || !isRequiredChoiceGroup(group)) continue;
      const radios = Array.from(group.querySelectorAll("input[type='radio']")).filter(isVisible);
      if (radios.length && !radios.some((radio) => radio.checked)) {
        return describeManualQuestion(radios[0]);
      }
    }
    return null;
  }

  function isRequiredChoiceGroup(group) {
    if (group.getAttribute("aria-required") === "true") return true;
    const text = group.innerText?.replace(/\s+/g, " ").trim() || "";
    return /(?:^|\s)\*(?:\s|$)|\brequired\b|choose an option to continue/i.test(text);
  }

  function describeManualQuestion(field) {
    const label = getQuestionLabel(field) || getFieldLabel(field) || "Required application question";
    const type = getManualQuestionType(field);
    const options = getManualQuestionOptions(field, type);
    return {
      key: getQuestionKey(field, label),
      label: label.replace(/\brequired\b/gi, "").replace(/\s*\*\s*$/, "").replace(/\s+/g, " ").trim(),
      type,
      ...(options.length ? { options } : {}),
      required: true,
    };
  }

  function getManualQuestionType(field) {
    if (field.tagName.toLowerCase() === "select") return "select";
    if (field.type === "radio") return "single_choice";
    if (field.type === "checkbox") return "boolean";
    return "text";
  }

  function getManualQuestionOptions(field, type) {
    if (type === "select") {
      return Array.from(field.options)
        .filter((option) => option.value && !option.disabled)
        .map((option) => option.textContent?.replace(/\s+/g, " ").trim())
        .filter(Boolean);
    }
    if (type === "boolean") return ["Yes", "No"];
    if (type !== "single_choice") return [];

    const scope = field.closest("fieldset, [role='radiogroup'], [role='group']") || document;
    const selector = field.name ? `input[type='radio'][name='${CSS.escape(field.name)}']` : "input[type='radio']";
    return Array.from(scope.querySelectorAll(selector))
      .filter(isVisible)
      .map(getChoiceOptionLabel)
      .filter(Boolean)
      .filter((option, index, options) => options.indexOf(option) === index);
  }

  function getChoiceOptionLabel(field) {
    return (
      field.labels?.[0]?.innerText ||
      field.getAttribute("aria-label") ||
      field.closest("label")?.innerText ||
      field.value ||
      ""
    ).replace(/\s+/g, " ").trim();
  }

  function getQuestionKey(field, providedLabel) {
    const label = providedLabel || getQuestionLabel(field) || getFieldLabel(field);
    const normalized = label.replace(/\brequired\b/gi, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 180);
    return `indeed:${field.type || field.tagName.toLowerCase()}:${normalized}`;
  }

  function hasSubmissionConfirmation() {
    const confirmationPattern = /^(?:your\s+)?application\s+(?:has been\s+)?(?:submitted|sent|completed)|^thanks for applying[!.]?$|^you(?:'ve| have) applied(?: successfully)?[!.]?$/i;
    return Array.from(document.querySelectorAll("h1, h2, [role='status'], [role='alert'], [data-testid*='confirmation' i], [data-testid*='success' i]"))
      .filter(isVisible)
      .map(actionLabel)
      .some((label) => confirmationPattern.test(label));
  }

  function visibleActionElements() {
    return Array.from(document.querySelectorAll("button, input[type='submit'], a, [role='button']"))
      .filter(isVisible)
      .filter((element) => !element.disabled)
      .filter((element, index, actions) => !actions.some((candidate, candidateIndex) => (
        candidateIndex < index && candidate.contains(element)
      )));
  }

  function activateTarget(element) {
    element.focus?.({ preventScroll: true });
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    element.click();
  }

  function actionLabel(element) {
    return (element.innerText || element.value || element.getAttribute("aria-label") || element.getAttribute("title") || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getFieldLabel(field) {
    const labelled = field.labels?.[0]?.innerText || field.getAttribute("aria-label") || getAriaLabelledText(field) || field.getAttribute("placeholder") || field.getAttribute("name") || "";
    if (labelled) return labelled.replace(/\s+/g, " ").trim();
    return field.parentElement?.innerText?.replace(/\s+/g, " ").trim().slice(0, 160) || "";
  }

  function getQuestionLabel(field) {
    const legend = field.closest("fieldset")?.querySelector("legend")?.innerText;
    const group = field.closest("[role='group'], [role='radiogroup']");
    const groupLabel = group?.getAttribute("aria-label") || getAriaLabelledText(group);
    return legend || groupLabel || getFieldLabel(field);
  }

  function getAriaLabelledText(element) {
    const ids = element?.getAttribute?.("aria-labelledby")?.split(/\s+/).filter(Boolean) || [];
    return ids.map((id) => document.getElementById(id)?.innerText || "").join(" ").replace(/\s+/g, " ").trim();
  }

  function normalizeAnswer(value) {
    return String(value).replace(/\s+/g, " ").trim().toLowerCase();
  }

  function setFieldValue(field, value) {
    const setter = Object.getOwnPropertyDescriptor(field.constructor.prototype, "value")?.set;
    field.focus?.();
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  async function waitForApplicationSurface(timeoutMs = Math.min(8_000, transitionTimeoutMs)) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (
        hasSubmissionConfirmation() ||
        detectCheckpoint() ||
        findFinalSubmitTarget() ||
        findNextTarget() ||
        Array.from(document.querySelectorAll("input, textarea, select")).some(isVisible)
      ) {
        return true;
      }
      await delay(200);
    }
    return false;
  }

  async function waitForApplicationChange(previousSurface, timeoutMs = Math.min(8_000, transitionTimeoutMs)) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (applicationSurfaceFingerprint() !== previousSurface) return true;
      await delay(200);
    }
    return false;
  }

  function applicationSurfaceFingerprint() {
    const heading = Array.from(document.querySelectorAll("main h1, main h2"))
      .filter(isVisible)
      .map(actionLabel)
      .join("|");
    const actions = visibleActionElements().map(actionLabel).filter(Boolean).join("|");
    const progress = Array.from(document.querySelectorAll("[role='progressbar'], progress"))
      .filter(isVisible)
      .map((element) => `${element.getAttribute("aria-valuenow") || ""}:${actionLabel(element)}`)
      .join("|");
    return `${window.location.href}::${heading}::${actions}::${progress}`;
  }

  async function pause(command, reason, message, lastStep, manualQuestion) {
    await report(command, {
      status: "manual_action_required",
      manualActionReason: reason,
      manualActionUrl: isIndeedOwnedUrl(window.location.href) ? window.location.href : undefined,
      manualQuestion,
      lastStep,
      failureReason: message,
    });
  }

  async function reportFailure(command, message) {
    try {
      await report(command, { status: "failed", lastStep: "runner_exception", failureReason: message });
      completedCommands.add(command.id);
    } catch {
      // The backend lease will expire and become reclaimable if the report channel is unavailable.
    }
  }

  function report(command, payload) {
    return chrome.runtime.sendMessage({
      type: "JOBNOVA_REPORT_COMPANION_RESULT",
      commandId: command.id,
      agentId: command.agentId,
      leaseToken: command.leaseToken,
      ...payload,
    }).then((response) => {
      if (!response?.ok) throw new Error(response?.message || "The backend rejected the runner report.");
      return response;
    });
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function isIndeedOwnedUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && (url.hostname === "indeed.com" || url.hostname.endsWith(".indeed.com"));
    } catch {
      return false;
    }
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
})();
