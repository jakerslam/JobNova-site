const statusElement = document.getElementById("status");
const collectButton = document.getElementById("collect");

collectButton?.addEventListener("click", async () => {
  statusElement.textContent = "Collecting from active tab...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("indeed.")) {
    statusElement.textContent = "Open an Indeed tab first.";
    return;
  }

  const response = await collectFromTab(tab.id);

  statusElement.textContent = response?.message || "Request sent.";
});

async function collectFromTab(tabId) {
  const firstAttempt = await sendCollectMessage(tabId);
  if (firstAttempt.ok || !firstAttempt.missingReceiver) {
    return firstAttempt;
  }

  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["styles.css"],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });

  return sendCollectMessage(tabId);
}

async function sendCollectMessage(tabId) {
  return chrome.tabs.sendMessage(tabId, { type: "JOBNOVA_COLLECT_FROM_POPUP" }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);

    return {
      ok: false,
      message,
      missingReceiver: message.includes("Receiving end does not exist"),
    };
  });
}
