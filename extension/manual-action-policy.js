(() => {
  function shouldRevealManualAction(report) {
    if (report?.status !== "manual_action_required" || report.manualQuestion) return false;
    if (["login", "captcha", "sms", "email"].includes(report.manualActionReason)) return true;
    return report.manualActionReason === "unknown_field";
  }

  globalThis.JobNovaManualActionPolicy = Object.freeze({ shouldRevealManualAction });
})();
