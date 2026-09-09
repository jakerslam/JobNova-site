const toolbarId = "jobnova-indeed-companion";

function absoluteUrl(href) {
  try {
    return new URL(href, window.location.href).toString();
  } catch {
    return undefined;
  }
}

function cleanText(value) {
  return value?.replace(/â€“|â€”|–|—/g, "-").replace(/\s+/g, " ").trim() || "";
}

function textLines(element) {
  const lines = new Set();
  const ownerDocument = element.ownerDocument || document;
  const clone = element.cloneNode(true);

  clone.querySelectorAll?.("script, style, noscript, svg").forEach((node) => node.remove());
  const rawText = clone.innerText || clone.textContent || "";

  rawText
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean)
    .forEach((line) => lines.add(line));

  const walker = ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent?.closest("script, style, noscript, svg")) {
      node = walker.nextNode();
      continue;
    }

    node.textContent
      ?.split(/\n+/)
      .map(cleanText)
      .filter(Boolean)
      .forEach((line) => lines.add(line));
    node = walker.nextNode();
  }

  return Array.from(lines);
}

function isUtilityLine(line) {
  return /^(easily apply|new|sponsored|urgently hiring|active|posted|save|saved|not interested|report job|more)$/i.test(line);
}

function isBadMetadataText(line) {
  return (
    !line ||
    line.length > 180 ||
    /^indeed home$/i.test(line) ||
    /^view similar jobs/i.test(line) ||
    /HomeCompany reviewsFind salaries|Start of main content|Unread count|Employers \/ Post Job/i.test(line) ||
    /window\.performance|function\s*\(|var\s+|const\s+|let\s+|__INITIAL_STATE__|mosaic/i.test(line)
  );
}

function isBadCompanyText(line) {
  return (
    isBadMetadataText(line) ||
    /^(?:about us|what you(?:'|’)ll do|what you will do|responsibilities|qualifications|job details|full job description)$/i.test(line)
  );
}

function isCompensationOrBenefitLine(line) {
  return /^\$|a year|an hour|401\(k\)|health insurance|paid time off|vision insurance|dental insurance|full-time|part-time|contract|weekends/i.test(
    line,
  );
}

function isLocationLine(line) {
  return Boolean(extractLocationFromLine(line));
}

function extractLocationFromLine(line) {
  const remoteMatch = line.match(/\b(?:remote|hybrid|on-site)\b(?:\s+in\s+[A-Z][A-Za-z .'-]+)?/i);
  if (remoteMatch) return remoteMatch[0];

  return line.match(/[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}(?:\s*\d{5})?(?:\s*\([^)]*\))?/)?.[0];
}

function findCompany(card, title) {
  const selectors = [
    "[data-testid='company-name']",
    "[data-testid='company-name'] a",
    "[data-testid='company-name'] span",
    "[data-testid='inlineHeader-companyName']",
    "[data-company-name]",
    "a[href*='/cmp/']",
    ".companyName",
  ];

  for (const selector of selectors) {
    const text = cleanCompanyText(card.querySelector(selector)?.textContent);
    if (!isBadCompanyText(text) && text !== title && text.length < 90) return text;
  }

  const lines = textLines(card).filter((line) => {
      if (isBadCompanyText(line) || line === title || title.includes(line)) return false;
      if (isUtilityLine(line)) return false;
      if (isCompensationOrBenefitLine(line)) return false;
      if (isLocationLine(line)) return false;
      return line.length < 90;
    });

  return lines.find((line) => line !== title && line.length < 80) || "Unknown company";
}

function cleanCompanyText(value) {
  return cleanText(value)
    .replace(/\s*\(opens in a new tab\)\s*$/i, "")
    .replace(/\s*[·|]\s*\d(?:\.\d)?(?:\s+out of 5 stars)?\s*$/i, "")
    .trim();
}

function findLocation(card) {
  const selectors = [
    "[data-testid='text-location']",
    "[data-testid*='location']",
    ".companyLocation",
    "[class*='location']",
  ];

  for (const selector of selectors) {
    const text = cleanText(card.querySelector(selector)?.textContent);
    if (text) return text;
  }

  const locationLine = textLines(card)
    .filter(isLocationLine)
    .sort((a, b) => a.length - b.length)[0];
  return locationLine ? extractLocationFromLine(locationLine) : undefined;
}

function inferCountry(location) {
  if (!location) return undefined;
  if (/\b[A-Z]{2}\b/.test(location) || /\bUnited States\b/i.test(location) || /\bRemote in\b/i.test(location)) {
    return "United States";
  }
  return undefined;
}

function findWorkplace(card, location) {
  const haystack = `${textLines(card).join(" ")} ${location ?? ""}`.toLowerCase();
  if (haystack.includes("remote")) return "Remote";
  if (haystack.includes("hybrid")) return "Hybrid";
  return "On-site";
}

function findJobType(card, title) {
  const haystack = textLines(card).join(" ");
  const matches = [
    ["Internship", /\bintern(ship)?\b/i],
    ["Full time", /\bfull[-\s]?time\b/i],
    ["Part time", /\bpart[-\s]?time\b/i],
    ["Contract", /\bcontract\b/i],
    ["Temporary", /\btemporary\b/i],
  ];

  for (const [label, pattern] of matches) {
    if (pattern.test(`${title} ${haystack}`)) return label;
  }

  return undefined;
}

function findExperience(card) {
  const text = textLines(card).join(" ");
  return (
    text.match(/\b\d+\+?\s*(?:-\s*\d+\s*)?years?\s+(?:of\s+)?(?:relevant\s+)?(?:experience|exp)\b/i)?.[0] ||
    text.match(/\b\d+\+?\s*years?\b/i)?.[0]
  );
}

function findSalary(card) {
  const text = textLines(card).join(" ");
  const salary =
    text.match(/\$[\d,]+(?:\.\d+)?\s*(?:-|to)\s*\$[\d,]+(?:\.\d+)?(?:\+)?\s*(?:a|per)?\s*(?:year|yr|hour|hr|month)?/i)?.[0] ||
    text.match(/\$[\d,]+(?:\.\d+)?(?:\+)?\s*(?:a|per)?\s*(?:year|yr|hour|hr|month)/i)?.[0] ||
    text.match(/\$[\d,]+(?:k|K)?(?:\+)?\s*-\s*\$[\d,]+(?:k|K)?(?:\+)?(?:\s*OTE)?/i)?.[0];

  return salary ? salary.replace(/\s+/g, " ") : undefined;
}

function inferSeniority(title, experience) {
  const normalized = `${title} ${experience ?? ""}`.toLowerCase();
  if (/\b(intern|internship|student|junior|jr\.?|entry|associate)\b/.test(normalized)) return "Entry Level";
  if (/\b(senior|sr\.?|staff|principal|lead|director|head|vp|vice president|7\+|8\+|10\+)\b/.test(normalized)) {
    return "Senior Level";
  }
  return "Mid Level";
}

function findCompanyProfileUrl(card) {
  const anchor = card.querySelector("a[href*='/cmp/'], a[href*='indeed.com/cmp/'], a[data-testid*='company']");
  return anchor ? absoluteUrl(anchor.getAttribute("href")) : undefined;
}

function findLogoUrl(card) {
  return findLogoUrlInRoot(card);
}

function findLogoUrlInRoot(root) {
  const structuredLogo = findStructuredLogoUrl(root);
  if (isUsableLogoUrl(structuredLogo)) return absoluteUrl(structuredLogo);

  const metaImage =
    root.querySelector?.("meta[property='og:image'], meta[name='twitter:image']")?.getAttribute("content") ||
    root.querySelector?.("meta[property='og:image:secure_url']")?.getAttribute("content");
  if (isUsableLogoUrl(metaImage)) return absoluteUrl(metaImage);

  const image = root.querySelector?.(
    [
      "[data-testid*='company'] img",
      "[data-testid*='logo'] img",
      ".jobsearch-CompanyAvatar img",
      "img[src*='socialmediaimages.indeed.com/job']",
      "img[src*='_squarelogo']",
    ].join(", "),
  );
  const src = image?.currentSrc || image?.src || image?.getAttribute("data-src") || image?.getAttribute("src");
  if (!isUsableLogoUrl(src)) return undefined;
  return absoluteUrl(src);
}

function findStructuredLogoUrl(root) {
  const scripts = Array.from(root.querySelectorAll?.("script[type='application/ld+json']") || []);
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent || "null");
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const candidate = queue.shift();
        if (!candidate || typeof candidate !== "object") continue;
        if (Array.isArray(candidate["@graph"])) queue.push(...candidate["@graph"]);

        const organization = candidate["@type"] === "JobPosting" ? candidate.hiringOrganization : candidate;
        const logo = typeof organization?.logo === "string" ? organization.logo : organization?.logo?.url;
        if (isUsableLogoUrl(logo)) return logo;
        if (isUsableLogoUrl(organization?.companyLogoUrl)) return organization.companyLogoUrl;
      }
    } catch {
      // Ignore malformed structured data.
    }
  }

  return undefined;
}

function isUsableLogoUrl(src) {
  if (!src || src.startsWith("data:")) return false;
  if (/favicon|sprite|transparent|pixel|placeholder/i.test(src)) return false;
  return true;
}

function findTitleAnchor(card) {
  return card.querySelector(
    "h2.jobTitle a, [data-testid='job-title'] a, a[data-testid='job-title'], h2 a[href*='jk='], a[id^='job_']",
  );
}

function findTitle(card, titleAnchor) {
  const title = cleanText(titleAnchor?.textContent || titleAnchor?.getAttribute("aria-label"));
  if (!isBadMetadataText(title)) return title;

  return (
    textLines(card).find(
      (line) => !isBadMetadataText(line) && !isUtilityLine(line) && !isCompensationOrBenefitLine(line) && !isLocationLine(line),
    ) ||
    ""
  );
}

function findJobUrl(card, titleAnchor) {
  const anchor =
    titleAnchor ||
    card.querySelector("a[href*='viewjob'], a[href*='jk='], a[data-jk], a[id^='job_'], a[data-testid*='job-title']");
  const jobKey =
    card.getAttribute("data-jk") ||
    card.querySelector("[data-jk]")?.getAttribute("data-jk") ||
    anchor?.getAttribute("data-jk") ||
    extractJobKey(anchor?.href || anchor?.getAttribute("href"));
  if (jobKey) return `https://www.indeed.com/viewjob?jk=${encodeURIComponent(jobKey)}`;

  const href = anchor?.href || anchor?.getAttribute("href");
  const jobUrl = href ? absoluteUrl(href) : undefined;
  if (jobUrl && !jobUrl.endsWith("#") && isApplicationJobUrl(jobUrl)) return jobUrl;
  return jobUrl;
}

function extractJobKey(value) {
  try {
    const url = new URL(value, window.location.href);
    const key = url.searchParams.get("jk") || url.searchParams.get("vjk") || url.searchParams.get("fromjk");
    return key && /^[a-z0-9]+$/i.test(key) ? key : undefined;
  } catch {
    return undefined;
  }
}

function isApplicationJobUrl(jobUrl) {
  return /indeed\.com\/(?:viewjob|rc\/clk|pagead\/clk)\b/i.test(jobUrl) && !jobUrl.includes("/addlLoc/redirect");
}

function findJobCards() {
  const candidates = new Set(document.querySelectorAll("[data-jk], .job_seen_beacon, .tapItem, [data-testid='slider_item']"));
  document.querySelectorAll("a[href*='viewjob'], a[href*='jk='], a[data-jk], a[id^='job_'], a[data-testid*='job-title']").forEach((anchor) => {
    const card =
      anchor.closest("[data-jk]") ||
      anchor.closest(".job_seen_beacon, .tapItem, [data-testid='slider_item'], li");
    if (card) candidates.add(card);
  });

  return Array.from(candidates).filter((card) => findJobUrl(card, findTitleAnchor(card)));
}

function scoreJob({ title, location }) {
  const haystack = `${title} ${location ?? ""}`.toLowerCase();
  let score = 0.72;
  if (/software|developer|engineer|frontend|full.stack|react|sales/.test(haystack)) score += 0.17;
  if (/austin|remote|salt lake/.test(haystack)) score += 0.08;
  return Math.min(0.99, score);
}

async function enrichJobFromDetailPage(job) {
  try {
    const response = await fetch(job.jobUrl, { credentials: "include" });
    const html = await response.text();
    if (!response.ok || !html || !/<html|<!doctype/i.test(html)) return job;

    const detailDocument = new DOMParser().parseFromString(html, "text/html");
    const detailRoot = detailDocument.body || detailDocument;
    const structured = findStructuredJobPosting(detailDocument);
    const title = findDetailTitle(detailDocument, structured) || job.title;
    const company = findDetailCompany(detailDocument, structured, title) || job.company;
    const location = findDetailLocation(structured) || findLocation(detailRoot);
    const experience = findExperience(detailRoot);
    const safeTitle = isBadMetadataText(title) ? job.title : title;
    const safeCompany = company === "Unknown company" || isBadCompanyText(company) ? job.company : company;

    const enrichedJob = {
      ...job,
      title: safeTitle,
      company: safeCompany,
      companyProfileUrl: findCompanyProfileUrl(detailRoot) || job.companyProfileUrl,
      companyLogoUrl: findLogoUrlInRoot(detailDocument) || job.companyLogoUrl,
      location: location || job.location,
      country: inferCountry(location || job.location),
      jobType: findJobType(detailRoot, safeTitle) || job.jobType,
      workplace: findWorkplace(detailRoot, location || job.location),
      experience: experience || job.experience,
      salary: findSalary(detailRoot) || job.salary,
      seniority: inferSeniority(safeTitle, experience || job.experience),
      supportsIndeedApply: detectIndeedApplySupport(detailRoot) ?? job.supportsIndeedApply,
    };

    return enrichJobFromCompanyPage(enrichedJob);
  } catch {
    return job;
  }
}

function findStructuredJobPosting(root) {
  for (const script of root.querySelectorAll("script[type='application/ld+json']")) {
    try {
      const value = JSON.parse(script.textContent || "null");
      const queue = Array.isArray(value) ? [...value] : [value];
      while (queue.length) {
        const candidate = queue.shift();
        if (!candidate || typeof candidate !== "object") continue;
        if (candidate["@type"] === "JobPosting" || candidate["@type"]?.includes?.("JobPosting")) return candidate;
        if (Array.isArray(candidate["@graph"])) queue.push(...candidate["@graph"]);
      }
    } catch {
      // Ignore malformed structured data and continue with stable DOM selectors.
    }
  }
  return undefined;
}

function findDetailTitle(root, structured) {
  const structuredTitle = cleanText(structured?.title);
  if (!isBadMetadataText(structuredTitle)) return structuredTitle;

  const title = cleanText(
    root.querySelector("[data-testid='jobsearch-JobInfoHeader-title'], .jobsearch-JobInfoHeader-title, main h1")?.textContent ||
      root.querySelector("meta[property='og:title']")?.getAttribute("content"),
  ).replace(/\s+-\s+Indeed(?:\.com)?\s*$/i, "");
  return isBadMetadataText(title) ? undefined : title;
}

function findDetailCompany(root, structured, title) {
  const structuredCompany = cleanCompanyText(structured?.hiringOrganization?.name);
  if (!isBadCompanyText(structuredCompany)) return structuredCompany;
  const company = findCompany(root, title);
  return isBadCompanyText(company) ? undefined : company;
}

function findDetailLocation(structured) {
  const location = Array.isArray(structured?.jobLocation) ? structured.jobLocation[0] : structured?.jobLocation;
  const address = location?.address || structured?.applicantLocationRequirements?.name;
  if (typeof address === "string") return cleanText(address);
  if (!address || typeof address !== "object") return undefined;

  return cleanText([address.addressLocality, address.addressRegion, address.postalCode].filter(Boolean).join(", "));
}

function detectIndeedApplySupport(root) {
  const actions = Array.from(root.querySelectorAll("button, a, input[type='submit']"))
    .map((element) => cleanText(element.textContent || element.getAttribute("aria-label") || element.value))
    .filter(Boolean);
  if (actions.some((label) => /^apply with indeed$/i.test(label))) return true;
  if (textLines(root).some((line) => /^easily apply$/i.test(line))) return true;
  if (actions.some((label) => /^apply on company site|continue to company site$/i.test(label))) return false;
  return undefined;
}

async function enrichJobFromCompanyPage(job) {
  if (job.companyLogoUrl || !job.companyProfileUrl) return job;

  try {
    const response = await fetch(job.companyProfileUrl, { credentials: "include" });
    const html = await response.text();
    if (!response.ok || !html || !/<html|<!doctype/i.test(html)) return job;

    const companyDocument = new DOMParser().parseFromString(html, "text/html");
    const companyRoot = companyDocument.body || companyDocument;
    const profileCompany = cleanText(
      companyRoot.querySelector("[data-testid*='company-name'], h1, meta[property='og:title']")?.textContent ||
        companyDocument.querySelector("meta[property='og:title']")?.getAttribute("content"),
    ).replace(/\s+\|\s+.*$/, "");

    return {
      ...job,
      company: (job.company === "Unknown company" || isBadMetadataText(job.company)) && !isBadMetadataText(profileCompany) ? profileCompany : job.company,
      companyLogoUrl: findLogoUrlInRoot(companyDocument) || findLogoUrlInRoot(companyRoot) || job.companyLogoUrl,
    };
  } catch {
    return job;
  }
}

async function extractVisibleJobs() {
  const seen = new Set();
  const jobs = [];

  for (const card of findJobCards()) {
    const titleAnchor = findTitleAnchor(card);
    const jobUrl = findJobUrl(card, titleAnchor);
    if (!jobUrl || seen.has(jobUrl)) continue;

    const title = findTitle(card, titleAnchor);
    if (!title || title.length < 3) continue;

    const company = findCompany(card, title);
    const location = findLocation(card);
    const experience = findExperience(card);
    const job = {
      jobUrl,
      title,
      company,
      companyProfileUrl: findCompanyProfileUrl(card),
      companyLogoUrl: findLogoUrl(card),
      location,
      country: inferCountry(location),
      jobType: findJobType(card, title),
      workplace: findWorkplace(card, location),
      experience,
      salary: findSalary(card),
      seniority: inferSeniority(title, experience),
      supportsIndeedApply: detectIndeedApplySupport(card),
      relevanceScore: scoreJob({ title, location }),
    };

    seen.add(jobUrl);
    jobs.push(await enrichJobFromDetailPage(job));
    if (jobs.length >= 10) break;
  }

  return jobs;
}

async function queueVisibleJobs() {
  const jobs = await extractVisibleJobs();
  if (jobs.length === 0) {
    const message = "No visible job cards found on this Indeed page.";
    setStatus(message, true);
    return { ok: false, message };
  }

  setStatus(`Sending ${jobs.length} job${jobs.length === 1 ? "" : "s"} to JobNova...`);
  const response = await chrome.runtime.sendMessage({
    type: "JOBNOVA_QUEUE_JOBS",
    jobs,
  });

  if (!response?.ok) {
    const message = response?.message || "Unable to send jobs to JobNova.";
    setStatus(message, true);
    return { ok: false, message };
  }

  const message = response.message || `Queued ${jobs.length} job${jobs.length === 1 ? "" : "s"}.`;
  setStatus(message);
  return { ok: true, message, jobsQueued: response.queued ?? jobs.length };
}

function setStatus(message, isError = false) {
  const status = document.querySelector(`#${toolbarId} [data-jobnova-status]`);
  if (!status) return;
  status.textContent = message;
  status.dataset.error = String(isError);
}

function mountToolbar() {
  if (document.getElementById(toolbarId)) return;

  const toolbar = document.createElement("div");
  toolbar.id = toolbarId;
  toolbar.innerHTML = `
    <div class="jobnova-panel">
      <strong>JobNova</strong>
      <button type="button" data-jobnova-collect>Send visible jobs</button>
      <span data-jobnova-status>Ready</span>
    </div>
  `;

  toolbar.querySelector("[data-jobnova-collect]")?.addEventListener("click", () => {
    queueVisibleJobs().catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error), true);
    });
  });

  document.documentElement.appendChild(toolbar);
}

mountToolbar();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "JOBNOVA_COLLECT_FROM_POPUP") {
    return false;
  }

  queueVisibleJobs()
    .then(sendResponse)
    .catch((error) =>
      sendResponse({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }),
    );

  return true;
});
