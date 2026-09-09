export const manualVerificationSelectors = [
  "iframe[src*='captcha']",
  "[id*='captcha' i]",
  "[class*='captcha' i]",
  "input[name*='verification' i]",
  "input[autocomplete='one-time-code']",
];

export const applyButtonSelectors = [
  "button:has-text('Apply now')",
  "button:has-text('Apply Now')",
  "a:has-text('Apply now')",
  "a:has-text('Apply Now')",
  "[data-testid*='apply' i]",
];

export const nextButtonSelectors = [
  "button:has-text('Continue')",
  "button:has-text('Next')",
  "button:has-text('Review')",
];

export const finalSubmitText = /submit your application|submit application|send application|apply now/i;

export const finalSubmitButtonSelectors = [
  "button:has-text('Submit your application')",
  "button:has-text('Submit application')",
  "button:has-text('Send application')",
  "button:has-text('Apply now')",
  "button:has-text('Apply Now')",
];
