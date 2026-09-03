export const applicationStatuses = [
  "pending",
  "in_progress",
  "manual_action_required",
  "submitted",
  "failed",
  "skipped",
] as const;

export type ApplicationStatus = (typeof applicationStatuses)[number];

export const manualActionReasons = [
  "captcha",
  "sms",
  "email",
  "login",
  "unknown_field",
  "review_required",
] as const;

export type ManualActionReason = (typeof manualActionReasons)[number];
