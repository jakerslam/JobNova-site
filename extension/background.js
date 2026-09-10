importScripts("manual-action-policy.js");

const backendUrl = "http://localhost:4100";
const appFeedUrl = "http://localhost:3000/jobs/matched";
const activeCommandsKey = "jobnovaActiveCompanionCommands";
const companionAlarmName = "jobnovaCompanionPoll";
const runningCompanionCommands = new Map();
let activeCommandsHydration;
let companionPollInFlight = false;

void restoreActiveCommands();
void initializeCompanionAgent();

chrome.runtime.onInstalled.addListener(() => {
  void initializeCompanionAgent();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeCompanionAgent();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === companionAlarmName) void pollBackendForCompanionCommand();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return false;

  if (message.type === "JOBNOVA_QUEUE_JOBS") {
    queueJobs(message.jobs ?? [])
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message.type === "JOBNOVA_EXECUTE_COMPANION_COMMAND") {
    executeCompanionCommand(message.command)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message.type === "JOBNOVA_INDEED_RUNNER_READY") {
    handleRunnerReady(message, _sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message.type === "JOBNOVA_FETCH_COMPANION_PROFILE") {
    fetchCompanionProfile(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message.type === "JOBNOVA_CHECK_COMPANION_OWNER") {
    checkCompanionOwner(message, _sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message.type === "JOBNOVA_TRUSTED_CLICK") {
    dispatchTrustedClick(message, _sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message.type === "JOBNOVA_INVOKE_INDEED_CONTROL") {
    invokeIndeedControl(message, _sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message.type === "JOBNOVA_REPORT_COMPANION_RESULT" || message.type === "JOBNOVA_REPORT_COMPANION_STEP") {
    const report = message.type === "JOBNOVA_REPORT_COMPANION_STEP"
      ? { status: "in_progress", lastStep: "companion_tab_ready" }
      : {
          status: message.status,
          lastStep: message.lastStep,
          manualActionReason: message.manualActionReason,
          manualActionUrl: message.manualActionUrl,
          manualQuestion: message.manualQuestion,
          failureReason: message.failureReason,
        };
    reportCompanionResult(message, report)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  return false;
});

async function executeCompanionCommand(command) {
  if (!command?.id || !command.jobUrl || !command.agentId || !command.leaseToken) {
    throw new Error("The companion command is missing its lease or job URL.");
  }

  await hydrateActiveCommands();
  const existing = runningCompanionCommands.get(command.id);
  if (existing) return { ok: true, commandId: command.id, tabId: existing.tabId, duplicate: true };

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const state = {
    command,
    tabId: null,
    returnTabId: activeTab?.id && isJobNovaUrl(activeTab.url || "") ? activeTab.id : null,
    previousTabIds: [],
    lastSentByTab: {},
    initialApplyInFlight: false,
    heartbeatTimer: null,
  };
  runningCompanionCommands.set(command.id, state);
  await saveActiveCommands();

  try {
    if (!isIndeedOwnedUrl(command.jobUrl)) {
      const result = await reportCompanionResult(command, {
        status: "skipped",
        lastStep: "apply_button_not_found",
        failureReason: "External employer application links are outside this minimal Indeed workflow.",
      });
      await clearCompanionCommand(command.id);
      return { ok: true, skipped: true, result };
    }

    const tab = await openOrReuseIndeedTab(command.jobUrl);
    state.tabId = tab.id;
    await saveActiveCommands();
    // Claim the command as running before the first-page wait. The initial
    // Indeed surface can take long enough that a timer-only heartbeat risks
    // losing the lease before the trusted click is dispatched.
    await startCompanionHeartbeat(state, true);
    state.initialApplyInFlight = true;
    await saveActiveCommands();
    const started = await startIndeedApplication(state, tab.id).finally(async () => {
      state.initialApplyInFlight = false;
      await saveActiveCommands();
    });
    if (!started) {
      await sendRunnerCommand(state, tab.id, tab.url || command.jobUrl);
    }
    return { ok: true, commandId: command.id, tabId: tab.id };
  } catch (error) {
    await stopCompanionCommand(command.id, "extension_execution_error", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function startIndeedApplication(state, tabId) {
  const target = await waitForIndeedApplyTarget(tabId);
  if (!target) return false;

  if (target.external) {
    await reportCompanionResult(state.command, {
      status: "skipped",
      lastStep: "external_application",
      failureReason: "This posting directs applications to an external employer site.",
    });
    return true;
  }

  let applicationNavigationStarted = false;
  if (target.href && isIndeedApplicationContinuationUrl(target.href)) {
    await chrome.tabs.update(tabId, { url: target.href });
    applicationNavigationStarted = true;
  } else {
    await invokeIndeedApplyHandler(tabId);
    applicationNavigationStarted = await waitForApplicationNavigation(tabId, state.command.jobUrl);

    // The handler is the most direct representation of the user action. Keep
    // a trusted pointer fallback for widgets that reject programmatic clicks.
    if (!applicationNavigationStarted) {
      const retryTarget = await readIndeedApplyTarget(tabId);
      if (retryTarget && !retryTarget.external) {
        await dispatchDebuggerClick(tabId, retryTarget.x, retryTarget.y);
        applicationNavigationStarted = await waitForApplicationNavigation(tabId, state.command.jobUrl);
      }
    }
  }
  const payload = await reportCompanionResult(state.command, {
    status: "in_progress",
    lastStep: applicationNavigationStarted ? "apply_navigation_started" : "apply_clicked",
  });
  if (payload.command) {
    state.command = payload.command;
    await saveActiveCommands();
  }

  // Some Indeed flows replace the job content in-place. A continuation tab is
  // handled by webNavigation; this resumes either surface after the trusted
  // initial click has had a moment to take effect.
  setTimeout(() => {
    chrome.tabs.get(state.tabId).then((currentTab) => sendRunnerCommand(
      state,
      currentTab.id,
      currentTab.url || state.command.jobUrl,
      true,
    )).catch((error) => stopCompanionCommand(
      state.command.id,
      "extension_receiver_error",
      error instanceof Error ? error.message : String(error),
    ));
  }, 1_000);
  return true;
}

async function invokeIndeedApplyHandler(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      const label = (element) => (element.innerText || element.value || element.getAttribute("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim();
      const button = Array.from(document.querySelectorAll("#indeedApplyButton, button, a, input[type='submit'], [role='button']"))
        .find((element) => /^(?:apply(?:\s+(?:now|with indeed|on indeed|for this job))?|easily apply|start application|start your application)$/i.test(label(element)));
      if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return false;
      button.click();
      return true;
    },
  });
  return Boolean(result?.result);
}

async function waitForIndeedApplyTarget(tabId, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const target = await readIndeedApplyTarget(tabId);
    if (target) return target;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return undefined;
}

async function waitForApplicationNavigation(tabId, jobUrl, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    const currentUrl = tab?.url || "";
    if (currentUrl && currentUrl !== jobUrl && isIndeedApplicationContinuationUrl(currentUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

async function readIndeedApplyTarget(tabId) {
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    const result = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const visible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const label = (element) => (element.innerText || element.value || element.getAttribute("aria-label") || element.getAttribute("title") || "").replace(/\\s+/g, " ").trim();
        const controls = Array.from(document.querySelectorAll("#indeedApplyButton, button[data-testid*='apply' i], a[data-testid*='apply' i], input[type='submit'][data-testid*='apply' i], [role='button'][data-testid*='apply' i], button, a, input[type='submit'], [role='button']"));
        const control = controls.find((element) => {
          if (!element.matches("button, a, input[type='submit'], [role='button']") || !visible(element) || element.disabled || element.getAttribute("aria-disabled") === "true") return false;
          const value = label(element);
          return /^(?:apply(?:\\s+(?:now|with indeed|on indeed|for this job))?|easily apply|start application|start your application)$/i.test(value);
        });
        if (!control) return null;
        control.scrollIntoView({ block: "center", inline: "center" });
        const rect = control.getBoundingClientRect();
        const rawHref = control.closest("a")?.href || control.getAttribute("href") || control.getAttribute("data-indeed-apply-link") || control.getAttribute("data-apply-url") || "";
        const href = rawHref ? new URL(rawHref, location.href).href : "";
        return {
          x: rect.left + (rect.width / 2),
          y: rect.top + (rect.height / 2),
          href,
          external: Boolean(href && !/^https:\\/\\/(?:[^/]+\\.)?indeed\\.com(?:\\/|$)/i.test(href)),
        };
      })()`,
    });
    return result?.result?.value || undefined;
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function dispatchDebuggerClick(tabId, x, y) {
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
      buttons: 0,
      pointerType: "mouse",
    });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: 1,
      pointerType: "mouse",
    });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      buttons: 0,
      clickCount: 1,
      pointerType: "mouse",
    });
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function initializeCompanionAgent() {
  await chrome.alarms.create(companionAlarmName, { periodInMinutes: 0.5 });
  await pollBackendForCompanionCommand();
}

async function pollBackendForCompanionCommand() {
  if (companionPollInFlight) return;
  companionPollInFlight = true;

  try {
    const agentId = await getCompanionAgentId();
    await postBackendJson("/companion/agents/heartbeat", {
      agentId,
      extensionVersion: chrome.runtime.getManifest().version,
    });
    const payload = await postBackendJson("/companion/commands/claim", { agentId });
    if (payload.command) await executeCompanionCommand(payload.command);
  } catch {
    // The local backend is optional while Chrome is open; the next alarm retries.
  } finally {
    companionPollInFlight = false;
  }
}

async function getCompanionAgentId() {
  const { jobnovaAgentId } = await chrome.storage.local.get("jobnovaAgentId");
  if (jobnovaAgentId) return jobnovaAgentId;

  const agentId = crypto.randomUUID();
  await chrome.storage.local.set({ jobnovaAgentId: agentId });
  return agentId;
}

async function handleRunnerReady(message, sender) {
  const tab = sender?.tab;
  if (!tab?.id || !isIndeedOwnedUrl(message.href || tab.url || "")) {
    return { ok: false, message: "The runner ready message did not come from an Indeed-owned tab." };
  }

  await hydrateActiveCommands();
  const state = findStateForTab(tab);
  if (!state) return { ok: false, message: "No active companion command is assigned to this Indeed tab." };

  if (state.tabId !== tab.id) {
    if (state.tabId !== null && !state.previousTabIds.includes(state.tabId)) state.previousTabIds.push(state.tabId);
    state.tabId = tab.id;
    await saveActiveCommands();
  }

  if (state.initialApplyInFlight) {
    return { ok: true, commandId: state.command.id, waitingForInitialApply: true };
  }

  await startCompanionHeartbeat(state, false);
  await sendRunnerCommand(state, tab.id, message.href || tab.url);
  return { ok: true, commandId: state.command.id };
}

function findStateForTab(tab) {
  for (const state of runningCompanionCommands.values()) {
    if (state.tabId === tab.id) return state;
    if (tab.openerTabId && (tab.openerTabId === state.tabId || state.previousTabIds.includes(tab.openerTabId))) return state;
    if (tab.url && tab.url === state.command.jobUrl) return state;
  }
  return findLikelyApplicationContinuation(tab.url || "");
}

async function fetchCompanionProfile(message) {
  const state = await getActiveState(message.commandId);
  assertLeaseMessageMatches(state, message);
  const payload = await postBackendJson(`/companion/commands/${encodeURIComponent(message.commandId)}/profile`, {
    agentId: message.agentId,
    leaseToken: message.leaseToken,
  });
  return { ok: true, profile: payload };
}

async function checkCompanionOwner(message, sender) {
  const state = await getActiveState(message.commandId);
  return {
    ok: true,
    isCurrentTab: Boolean(state && sender?.tab?.id && state.tabId === sender.tab.id),
  };
}

async function dispatchTrustedClick(message, sender) {
  const state = await getActiveState(message.commandId);
  assertLeaseMessageMatches(state, message);
  const tabId = sender?.tab?.id;
  if (!tabId || state.tabId !== tabId) {
    throw new Error("The requested Indeed click did not come from the active application tab.");
  }

  const x = Number(message.x);
  const y = Number(message.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    throw new Error("The requested Indeed click has invalid coordinates.");
  }

  await dispatchDebuggerClick(tabId, x, y);
  return { ok: true, clicked: true };
}

async function invokeIndeedControl(message, sender) {
  const state = await getActiveState(message.commandId);
  assertLeaseMessageMatches(state, message);
  const tabId = sender?.tab?.id;
  if (!tabId || state.tabId !== tabId) {
    throw new Error("The requested Indeed control did not come from the active application tab.");
  }

  const descriptor = {
    id: String(message.control?.id || ""),
    testId: String(message.control?.testId || ""),
    ariaLabel: String(message.control?.ariaLabel || ""),
    label: String(message.control?.label || ""),
  };
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [descriptor],
    func: (expected) => {
      const label = (element) => (element.innerText || element.value || element.getAttribute("aria-label") || element.getAttribute("title") || "")
        .replace(/\s+/g, " ")
        .trim();
      const controls = Array.from(document.querySelectorAll("button, a, input[type='submit'], [role='button']"));
      const control = controls.find((element) => expected.id && element.id === expected.id)
        || controls.find((element) => expected.testId && element.getAttribute("data-testid") === expected.testId)
        || controls.find((element) => expected.ariaLabel && element.getAttribute("aria-label") === expected.ariaLabel)
        || controls.find((element) => expected.label && label(element) === expected.label);
      if (!control || control.disabled || control.getAttribute("aria-disabled") === "true") return false;
      control.click();
      return true;
    },
  });
  return { ok: true, clicked: Boolean(result?.result) };
}

async function reportCompanionResult(message, report) {
  const command = message.command || (message.id ? message : {
    id: message.commandId,
    agentId: message.agentId,
    leaseToken: message.leaseToken,
  });
  const state = await getActiveState(command.id);
  assertLeaseMessageMatches(state, command);
  const payload = await postBackendJson(`/companion/commands/${encodeURIComponent(command.id)}/report`, {
    agentId: command.agentId,
    leaseToken: command.leaseToken,
    ...report,
  });

  if (isTerminalStatus(report.status)) {
    if (JobNovaManualActionPolicy.shouldRevealManualAction(report)) {
      await revealManualActionTab(state).catch(() => undefined);
    } else {
      await restoreJobNovaTab(state).catch(() => undefined);
    }
    await clearCompanionCommand(command.id);
  } else if (payload.command) {
    state.command = payload.command;
    await saveActiveCommands();
    await startCompanionHeartbeat(state, false);
  }

  return { ok: true, ...payload };
}

async function revealManualActionTab(state) {
  if (!state?.tabId) return;
  const tab = await chrome.tabs.update(state.tabId, { active: true });
  if (tab?.windowId) await chrome.windows.update(tab.windowId, { focused: true });
}

async function restoreJobNovaTab(state) {
  if (!state?.returnTabId) return;
  const returnTab = await chrome.tabs.get(state.returnTabId).catch(() => undefined);
  if (!returnTab?.id || !isJobNovaUrl(returnTab.url || "")) return;
  const tab = await chrome.tabs.update(returnTab.id, { active: true });
  if (tab?.windowId) await chrome.windows.update(tab.windowId, { focused: true });
}

function assertLeaseMessageMatches(state, message) {
  if (!state || state.command.agentId !== message.agentId || state.command.leaseToken !== message.leaseToken) {
    throw new Error("The active companion lease does not match this runner message.");
  }
}

async function startCompanionHeartbeat(state, sendImmediately) {
  if (state.heartbeatTimer) return;
  if (sendImmediately) await heartbeatCompanionCommand(state);

  state.heartbeatTimer = setInterval(() => {
    heartbeatCompanionCommand(state).catch((error) => {
      stopCompanionCommand(
        state.command.id,
        "companion_heartbeat_error",
        error instanceof Error ? error.message : String(error),
      );
    });
  }, 10_000);
}

async function heartbeatCompanionCommand(state) {
  const payload = await postBackendJson(`/companion/commands/${encodeURIComponent(state.command.id)}/heartbeat`, {
    agentId: state.command.agentId,
    leaseToken: state.command.leaseToken,
    lastStep: state.command.lastStep || "companion_heartbeat",
  });
  if (payload.command) {
    state.command = payload.command;
    await saveActiveCommands();
  }
  return payload;
}

async function stopCompanionCommand(commandId, lastStep, failureReason) {
  const state = await getActiveState(commandId);
  if (!state) return;
  if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);

  await postBackendJson(`/companion/commands/${encodeURIComponent(commandId)}/report`, {
    agentId: state.command.agentId,
    leaseToken: state.command.leaseToken,
    status: "failed",
    lastStep,
    failureReason,
  }).catch(() => undefined);
  await clearCompanionCommand(commandId);
}

async function clearCompanionCommand(commandId) {
  const state = runningCompanionCommands.get(commandId);
  if (state?.heartbeatTimer) clearInterval(state.heartbeatTimer);
  runningCompanionCommands.delete(commandId);
  await saveActiveCommands();
}

async function getActiveState(commandId) {
  await hydrateActiveCommands();
  return runningCompanionCommands.get(commandId);
}

async function hydrateActiveCommands() {
  if (!activeCommandsHydration) activeCommandsHydration = loadActiveCommands();
  return activeCommandsHydration;
}

async function loadActiveCommands() {
  const stored = await chrome.storage.session.get(activeCommandsKey);
  const active = stored[activeCommandsKey] || {};
  for (const [commandId, storedState] of Object.entries(active)) {
    runningCompanionCommands.set(commandId, { ...storedState, heartbeatTimer: null });
  }
}

async function restoreActiveCommands() {
  await hydrateActiveCommands();
  for (const state of runningCompanionCommands.values()) {
    try {
      await startCompanionHeartbeat(state, true);
      const tab = state.tabId === null
        ? await openOrReuseIndeedTab(state.command.jobUrl)
        : await chrome.tabs.get(state.tabId);
      if (!tab?.id || !isIndeedOwnedUrl(tab.url || "")) {
        await reportCompanionResult(state.command, {
          status: "skipped",
          lastStep: "apply_button_not_found",
          failureReason: "The active application tab left Indeed for an unsupported external employer flow.",
        });
        continue;
      }
      state.tabId = tab.id;
      await saveActiveCommands();
      await sendRunnerCommand(state, tab.id, tab.url, true);
    } catch (error) {
      await stopCompanionCommand(
        state.command.id,
        "companion_restore_error",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

async function saveActiveCommands() {
  const active = {};
  for (const [commandId, state] of runningCompanionCommands) {
    active[commandId] = {
      command: state.command,
      tabId: state.tabId,
      returnTabId: state.returnTabId,
      previousTabIds: state.previousTabIds,
      lastSentByTab: state.lastSentByTab,
      initialApplyInFlight: Boolean(state.initialApplyInFlight),
    };
  }
  await chrome.storage.session.set({ [activeCommandsKey]: active });
}

async function sendRunnerCommand(state, tabId, pageUrl, force = false) {
  const key = String(tabId);
  if (!force && state.lastSentByTab[key] === pageUrl) return { ok: true, duplicate: true };

  const acknowledgement = await sendToTab(tabId, {
    type: "JOBNOVA_RUN_INDEED_COMMAND",
    command: state.command,
  });
  if (!acknowledgement?.ok) {
    throw new Error(acknowledgement?.message || "The Indeed runner did not acknowledge the command.");
  }

  state.lastSentByTab[key] = pageUrl;
  await saveActiveCommands();
  return acknowledgement;
}

async function openOrReuseIndeedTab(jobUrl) {
  const tabs = await chrome.tabs.query({});
  let tab = tabs.find((candidate) => candidate.url === jobUrl);

  if (tab?.id) {
    tab = await chrome.tabs.get(tab.id);
  } else {
    tab = await chrome.tabs.create({ active: false, url: jobUrl });
  }

  if (!tab?.id) throw new Error("Chrome did not provide an Indeed tab id.");
  await waitForTabComplete(tab.id);
  return chrome.tabs.get(tab.id);
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("Timed out waiting for the Indeed tab to load.")), 30_000);

    const finish = (error, tab) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (error) reject(error);
      else resolve(tab);
    };

    const onUpdated = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish(undefined, tab);
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((currentTab) => {
      if (currentTab.status === "complete") finish(undefined, currentTab);
    }).catch((error) => finish(error));
  });
}

async function sendToTab(tabId, message) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
      if (attempt === 0 && isMissingReceiverError(error)) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["indeed-runner.js"],
        }).catch(() => undefined);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : "The Indeed content script could not be reached.");
}

function isMissingReceiverError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /Receiving end does not exist|Could not establish connection/i.test(message);
}

async function postBackendJson(path, body) {
  const response = await fetch(`${backendUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || "The JobNova backend rejected the request.");
  return payload;
}

function isTerminalStatus(status) {
  return status === "submitted" || status === "manual_action_required" || status === "failed" || status === "skipped";
}

function isIndeedOwnedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "indeed.com" || url.hostname.endsWith(".indeed.com"));
  } catch {
    return false;
  }
}

function isJobNovaUrl(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" && url.hostname === "localhost" && url.port === "3000") ||
      (url.protocol === "https:" && url.hostname === "jakerslam.github.io" && url.pathname.startsWith("/JobNova-site"))
    );
  } catch {
    return false;
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const state of runningCompanionCommands.values()) {
    if (state.tabId === tabId) {
      void stopCompanionCommand(state.command.id, "indeed_tab_closed", "The Indeed tab was closed before the guarded workflow completed.");
    }
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (!tab.id) return;
  void adoptCompanionChildTab(tab);
});

// Indeed often launches its resume/application flow in a new tab without a
// reliable tab opener. webNavigation retains the browser's actual source-tab
// relationship, so the active command can follow that handoff deterministically.
chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
  void adoptCompanionNavigationTarget(details);
});

async function adoptCompanionChildTab(tab) {
  await hydrateActiveCommands();
  const state = findStateForTab(tab);
  if (!state || !tab.id) return;

  await assignCompanionTab(state, tab.id, Boolean(tab.active));
}

async function adoptCompanionNavigationTarget(details) {
  if (!isIndeedApplicationContinuationUrl(details.url)) return;
  await hydrateActiveCommands();
  const state = Array.from(runningCompanionCommands.values()).find(
    (candidate) => candidate.tabId === details.sourceTabId || candidate.previousTabIds.includes(details.sourceTabId),
  );
  if (!state) return;

  const tab = await chrome.tabs.get(details.tabId).catch(() => undefined);
  await assignCompanionTab(state, details.tabId, Boolean(tab?.active));
}

async function assignCompanionTab(state, tabId, wasActive) {
  if (state.tabId === tabId) return;

  if (state.tabId !== null && !state.previousTabIds.includes(state.tabId)) {
    state.previousTabIds.push(state.tabId);
  }
  state.tabId = tabId;
  await chrome.tabs.update(tabId, { active: false }).catch(() => undefined);
  await saveActiveCommands();
  if (wasActive) await restoreJobNovaTab(state).catch(() => undefined);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  void handleActiveTabUpdate(tabId, changeInfo.url || tab.url || "", changeInfo.status);
});

async function handleActiveTabUpdate(tabId, url, status) {
  await hydrateActiveCommands();
  let state = Array.from(runningCompanionCommands.values()).find((candidate) => candidate.tabId === tabId);
  if (!state) {
    state = findLikelyApplicationContinuation(url);
    if (state) {
      const tab = await chrome.tabs.get(tabId).catch(() => undefined);
      await assignCompanionTab(state, tabId, Boolean(tab?.active));
    }
  }
  if (!state || !url) return;

  if (!isIndeedOwnedUrl(url)) {
      await reportCompanionResult(state.command, {
        status: "skipped",
        lastStep: "external_application",
        failureReason: "Indeed redirected this application to an unsupported external employer site.",
    }).catch(() => clearCompanionCommand(state.command.id));
    return;
  }

  if (status === "complete") {
    await sendRunnerCommand(state, tabId, url).catch((error) => stopCompanionCommand(
      state.command.id,
      "extension_receiver_error",
      error instanceof Error ? error.message : String(error),
    ));
  }
}

function findLikelyApplicationContinuation(url) {
  if (!isIndeedApplicationContinuationUrl(url)) return undefined;
  // A service-worker restart can leave the command's lastStep as queued even
  // after Indeed opens its resume/application continuation. The URL is an
  // Indeed-owned continuation surface, so it is safe to adopt when there is
  // exactly one active command.
  const candidates = Array.from(runningCompanionCommands.values());
  return candidates.length === 1 ? candidates[0] : undefined;
}

function isIndeedApplicationContinuationUrl(value) {
  try {
    const url = new URL(value);
    if (!isIndeedOwnedUrl(value)) return false;
    if (url.hostname === "smartapply.indeed.com") return true;
    return url.hostname === "profile.indeed.com" && url.pathname.startsWith("/tailored-resume/") && Boolean(url.searchParams.get("continue"));
  } catch {
    return false;
  }
}

async function queueJobs(jobs) {
  let response;

  try {
    response = await fetch(`${backendUrl}/applications/queue-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobs }),
    });
  } catch {
    throw new Error('Cannot reach the JobNova backend. Run: cd "/Users/jay/Document (Lcl)/Coding/Career dashboard" && npm run dev:all');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || "Unable to queue Indeed jobs.");

  const appTab = await openOrRefreshJobNovaFeed();
  return {
    ok: true,
    ...payload,
    message: `${payload.message || `Queued ${jobs.length} Indeed job${jobs.length === 1 ? "" : "s"} from the browser companion.`} Opened JobNova feed.`,
    appTabId: appTab?.id,
  };
}

async function openOrRefreshJobNovaFeed() {
  const tabs = await chrome.tabs.query({});
  const appTab = tabs.find((tab) => tab.url?.startsWith("http://localhost:3000/"));
  const refreshUrl = `${appFeedUrl}?refresh=${Date.now()}`;

  if (appTab?.id) {
    const updatedTab = await chrome.tabs.update(appTab.id, { active: true, url: refreshUrl });
    if (updatedTab.windowId) await chrome.windows.update(updatedTab.windowId, { focused: true }).catch(() => undefined);
    return updatedTab;
  }

  return chrome.tabs.create({ active: true, url: refreshUrl });
}
