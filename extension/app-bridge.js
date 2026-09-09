const companionBackendUrl = "http://localhost:4100";
const companionPollIntervalMs = 2500;

let pollInFlight = false;

chrome.storage.local.get("jobnovaAgentId").then(async ({ jobnovaAgentId }) => {
  const agentId = jobnovaAgentId || crypto.randomUUID();
  if (!jobnovaAgentId) {
    await chrome.storage.local.set({ jobnovaAgentId: agentId });
  }

  await pollForCompanionCommand(agentId);
  window.setInterval(() => pollForCompanionCommand(agentId), companionPollIntervalMs);
});

async function pollForCompanionCommand(agentId) {
  if (pollInFlight) return;
  pollInFlight = true;

  try {
    await fetch(`${companionBackendUrl}/companion/agents/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        extensionVersion: chrome.runtime.getManifest().version,
      }),
    });

    const response = await fetch(`${companionBackendUrl}/companion/commands/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    if (!response.ok) return;

    const payload = await response.json().catch(() => ({}));
    if (!payload.command) return;

    const result = await chrome.runtime.sendMessage({
      type: "JOBNOVA_EXECUTE_COMPANION_COMMAND",
      command: payload.command,
    });

    if (!result?.ok) {
      await reportFailure(payload.command, result?.message || "The extension background bridge did not acknowledge the command.");
    }
  } catch {
    // The app bridge is opportunistic. A backend that is offline will be retried on the next poll.
  } finally {
    pollInFlight = false;
  }
}

async function reportFailure(command, failureReason) {
  await fetch(`${companionBackendUrl}/companion/commands/${encodeURIComponent(command.id)}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: command.agentId,
      leaseToken: command.leaseToken,
      status: "failed",
      lastStep: "extension_bridge_error",
      failureReason,
    }),
  }).catch(() => undefined);
}
