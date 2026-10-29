/* RemoteScope - remote job search
   Sources (public job APIs): Remotive, Jobicy, Arbeitnow */

// ---------- Data ----------
const CONTINENTS = {
  "Africa": ["africa", "emea"],
  "Asia": ["asia", "apac", "asia-pacific", "middle east"],
  "Europe": ["europe", "emea", "european union", "\\beu\\b", "cet", "gmt"],
  "North America": ["north america", "americas", "\\bamericas\\b"],
  "South America": ["south america", "latam", "latin america", "americas"],
  "Oceania": ["oceania", "australia", "new zealand", "apac"],
};

// [name, continent, aliases...]
const COUNTRIES = [
  ["Nigeria", "Africa"], ["Ghana", "Africa"], ["Kenya", "Africa"], ["South Africa", "Africa"],
  ["Egypt", "Africa"], ["Morocco", "Africa"], ["Uganda", "Africa"], ["Rwanda", "Africa"],
  ["Tanzania", "Africa"], ["Ethiopia", "Africa"],
  ["India", "Asia"], ["Pakistan", "Asia"], ["Bangladesh", "Asia"], ["Philippines", "Asia"],
  ["Indonesia", "Asia"], ["Singapore", "Asia"], ["Japan", "Asia"], ["South Korea", "Asia", "korea"],
  ["Vietnam", "Asia"], ["Malaysia", "Asia"], ["Thailand", "Asia"], ["Sri Lanka", "Asia"],
  ["United Arab Emirates", "Asia", "uae", "dubai"], ["Israel", "Asia"], ["Turkey", "Asia"],
  ["United Kingdom", "Europe", "uk", "england", "scotland", "wales", "britain"],
  ["Germany", "Europe"], ["France", "Europe"], ["Spain", "Europe"], ["Portugal", "Europe"],
  ["Italy", "Europe"], ["Netherlands", "Europe"], ["Ireland", "Europe"], ["Poland", "Europe"],
  ["Sweden", "Europe"], ["Norway", "Europe"], ["Denmark", "Europe"], ["Finland", "Europe"],
  ["Switzerland", "Europe"], ["Austria", "Europe"], ["Belgium", "Europe"], ["Romania", "Europe"],
  ["Ukraine", "Europe"], ["Greece", "Europe"], ["Czech Republic", "Europe", "czechia"],
  ["Iceland", "Europe"],
  ["United States", "North America", "usa", "us", "u\\.s\\.", "america"],
  ["Canada", "North America"], ["Mexico", "North America"], ["Costa Rica", "North America"],
  ["Brazil", "South America"], ["Argentina", "South America"], ["Colombia", "South America"],
  ["Chile", "South America"], ["Peru", "South America"],
  ["Australia", "Oceania"], ["New Zealand", "Oceania"],
].map(([name, continent, ...aliases]) => ({ name, continent, aliases }));

const JOB_TYPES = {
  all: { label: "Any job type", kw: [] },
  software: { label: "Software Development", kw: ["developer", "engineer", "software", "frontend", "front-end", "backend", "back-end", "full stack", "fullstack", "programmer", "mobile", "react", "python", "java", "node"] },
  devops: { label: "DevOps / Sysadmin", kw: ["devops", "sysadmin", "sre", "cloud", "infrastructure", "kubernetes", "aws", "platform engineer"] },
  data: { label: "Data & Analytics", kw: ["data", "analyst", "analytics", "machine learning", "ml ", "ai ", "scientist", "bi "] },
  design: { label: "Design", kw: ["design", "ux", "ui ", "graphic", "illustrator", "figma", "creative"] },
  marketing: { label: "Marketing", kw: ["marketing", "seo", "growth", "social media", "content marketing", "brand", "community"] },
  sales: { label: "Sales", kw: ["sales", "account executive", "business development", "sdr", "bdr", "account manager"] },
  support: { label: "Customer Support", kw: ["support", "customer success", "customer service", "help desk", "customer experience"] },
  product: { label: "Product / Project Mgmt", kw: ["product manager", "product owner", "project manager", "program manager", "scrum"] },
  writing: { label: "Writing & Content", kw: ["writer", "copywriter", "editor", "content", "technical writer", "journalist"] },
  finance: { label: "Finance & Legal", kw: ["finance", "accountant", "accounting", "legal", "lawyer", "bookkeeper", "compliance", "paralegal"] },
  hr: { label: "HR & Recruiting", kw: ["recruiter", "recruiting", "hr ", "human resources", "talent", "people operations"] },
  qa: { label: "QA / Testing", kw: ["qa ", "quality assurance", "tester", "test engineer", "sdet"] },
  admin: { label: "Admin & Virtual Assistant", kw: ["assistant", "administrative", "virtual assistant", "operations", "coordinator", "data entry"] },
};

// Remotive category slugs per job type (narrows the API request)
const REMOTIVE_CATEGORY = {
  software: "software-dev", devops: "devops", data: "data", design: "design",
  marketing: "marketing", sales: "sales", support: "customer-support",
  product: "product", writing: "writing", finance: "finance-legal",
  hr: "human-resources", qa: "qa",
};

const PAGE_SIZE = 18;

// ---------- State ----------
let allResults = [];
let shown = 0;

// ---------- Elements ----------
const $ = (id) => document.getElementById(id);
const continentSelect = $("continentSelect");
const countrySelect = $("countrySelect");
const jobTypeSelect = $("jobType");

// ---------- Init UI ----------
Object.keys(CONTINENTS).forEach((c) => continentSelect.add(new Option(c, c)));
continentSelect.insertBefore(new Option("Choose a continent…", ""), continentSelect.firstChild);
continentSelect.value = "";

countrySelect.add(new Option("Choose a country…", ""));
[...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name))
  .forEach((c) => countrySelect.add(new Option(c.name, c.name)));

Object.entries(JOB_TYPES).forEach(([key, v]) => jobTypeSelect.add(new Option(v.label, key)));

document.querySelectorAll('input[name="scope"]').forEach((r) =>
  r.addEventListener("change", onScopeChange));
continentSelect.addEventListener("change", updateScope);
countrySelect.addEventListener("change", updateScope);
$("searchForm").addEventListener("submit", onSearch);
$("loadMore").addEventListener("click", renderMore);

function getScope() {
  const type = document.querySelector('input[name="scope"]:checked')?.value;
  if (!type) return null;
  if (type === "global") return { type, value: "Global" };
  if (type === "continent") return continentSelect.value ? { type, value: continentSelect.value } : null;
  return countrySelect.value ? { type, value: countrySelect.value } : null;
}

function onScopeChange() {
  const type = document.querySelector('input[name="scope"]:checked').value;
  $("continentWrap").classList.toggle("d-none", type !== "continent");
  $("countryWrap").classList.toggle("d-none", type !== "country");
  updateScope();
}

function updateScope() {
  const scope = getScope();
  $("step2").classList.toggle("step-locked", !scope);
  $("scopeSummary").textContent = scope
    ? `Searching: ${scope.type === "global" ? "worldwide jobs" : scope.value}`
    : "Pick one option to continue.";
}

// ---------- Location matching ----------
const WORLDWIDE = /worldwide|anywhere|global|any location|international/i;

function rx(term) {
  // term may already contain regex escapes; wrap in word boundaries when it's a plain word
  return new RegExp(/\\b|\\\./.test(term) ? term : `\\b${term}\\b`, "i");
}

function locationMatch(locText, scope) {
  const loc = (locText || "").trim();
  if (scope.type === "global") return { ok: true, tag: WORLDWIDE.test(loc) ? "Worldwide" : null };
  if (WORLDWIDE.test(loc)) return { ok: true, tag: "Worldwide" };

  if (scope.type === "continent") {
    const terms = CONTINENTS[scope.value];
    const inContinent = COUNTRIES.filter((c) => c.continent === scope.value);
    const hit = terms.some((t) => rx(t).test(loc)) ||
      inContinent.some((c) => [c.name, ...c.aliases].some((a) => rx(a).test(loc)));
    return { ok: hit, tag: hit ? scope.value : null };
  }

  // country
  const c = COUNTRIES.find((x) => x.name === scope.value);
  if (!c) return { ok: false };
  if ([c.name, ...c.aliases].some((a) => rx(a).test(loc))) return { ok: true, tag: c.name };
  if (CONTINENTS[c.continent].some((t) => rx(t).test(loc))) return { ok: true, tag: c.continent };
  return { ok: false };
}

// ---------- Fetchers ----------
async function fetchJSON(url, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fromRemotive(typeKey, keyword) {
  const params = new URLSearchParams({ limit: "150" });
  if (REMOTIVE_CATEGORY[typeKey]) params.set("category", REMOTIVE_CATEGORY[typeKey]);
  if (keyword) params.set("search", keyword);
  const data = await fetchJSON(`https://remotive.com/api/remote-jobs?${params}`);
  return (data.jobs || []).map((j) => ({
    title: j.title, company: j.company_name, location: j.candidate_required_location || "",
    type: (j.job_type || "").replace(/_/g, " "), date: j.publication_date,
    url: j.url, logo: j.company_logo, source: "Remotive", sourceUrl: "https://remotive.com",
    tags: [j.category, ...(j.tags || [])].filter(Boolean), salary: j.salary || "",
  }));
}

async function fromJobicy(keyword) {
  const params = new URLSearchParams({ count: "100" });
  if (keyword) params.set("tag", keyword);
  const data = await fetchJSON(`https://jobicy.com/api/v2/remote-jobs?${params}`);
  return (data.jobs || []).map((j) => ({
    title: decodeEntities(j.jobTitle), company: decodeEntities(j.companyName),
    location: j.jobGeo || "", type: [].concat(j.jobType || []).join(", "),
    date: j.pubDate, url: j.url, logo: j.companyLogo, source: "Jobicy", sourceUrl: "https://jobicy.com",
    tags: [].concat(j.jobIndustry || []).map(decodeEntities), salary: "",
  }));
}

async function fromArbeitnow() {
  const data = await fetchJSON("https://www.arbeitnow.com/api/job-board-api");
  return (data.data || []).filter((j) => j.remote).map((j) => ({
    title: j.title, company: j.company_name, location: j.location ? `${j.location}, Europe` : "Europe",
    type: (j.job_types || []).join(", "), date: j.created_at ? new Date(j.created_at * 1000).toISOString() : "",
    url: j.url, logo: "", source: "Arbeitnow", sourceUrl: "https://www.arbeitnow.com",
    tags: j.tags || [], salary: "",
  }));
}

function decodeEntities(s) {
  const t = document.createElement("textarea");
  t.innerHTML = s || "";
  return t.value;
}

// ---------- Search ----------
async function onSearch(e) {
  e.preventDefault();
  const scope = getScope();
  if (!scope) return;

  const typeKey = jobTypeSelect.value;
  const keyword = $("keyword").value.trim();

  $("resultsSection").classList.remove("d-none");
  $("results").innerHTML = "";
  $("sourceStatus").innerHTML = "";
  $("loadMore").classList.add("d-none");
  $("loading").classList.remove("d-none");
  $("searchBtn").disabled = true;
  $("resultsTitle").textContent = "Searching…";

  const sources = [
    ["Remotive", () => fromRemotive(typeKey, keyword)],
    ["Jobicy", () => fromJobicy(keyword)],
    ["Arbeitnow", () => fromArbeitnow()],
  ];
  const settled = await Promise.allSettled(sources.map(([, fn]) => fn()));

  let jobs = [];
  settled.forEach((r, i) => {
    const name = sources[i][0];
    const ok = r.status === "fulfilled";
    if (ok) jobs = jobs.concat(r.value);
    $("sourceStatus").insertAdjacentHTML("beforeend",
      `<span class="badge ${ok ? "text-bg-success" : "text-bg-secondary"}" title="${ok ? "" : "Could not load this source"}">` +
      `${name}${ok ? ` (${r.value.length})` : " unavailable"}</span>`);
  });

  // Filter by job type, keyword and location
  const kws = JOB_TYPES[typeKey].kw;
  const kwLower = keyword.toLowerCase();
  jobs = jobs.filter((j) => {
    const hay = `${j.title} ${j.tags.join(" ")}`.toLowerCase() + " ";
    if (kws.length && !kws.some((k) => hay.includes(k))) return false;
    if (kwLower && !`${hay} ${j.company}`.toLowerCase().includes(kwLower)) return false;
    const m = locationMatch(j.location, scope);
    j.matchTag = m.tag;
    return m.ok;
  });

  // Remove duplicates (same title + company) and sort newest first
  const seen = new Set();
  jobs = jobs.filter((j) => {
    const k = `${j.title}|${j.company}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return Boolean(j.url);
  });
  jobs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  allResults = jobs;
  shown = 0;
  $("loading").classList.add("d-none");
  $("searchBtn").disabled = false;

  const scopeLabel = scope.type === "global" ? "worldwide" : `in ${scope.value}`;
  $("resultsTitle").textContent = `${jobs.length} remote job${jobs.length === 1 ? "" : "s"} ${scopeLabel} · ${JOB_TYPES[typeKey].label}`;

  if (!jobs.length) {
    $("results").innerHTML = `<div class="col-12"><div class="alert alert-info mb-0">No matching jobs found. Try a broader job type, a different keyword, or widen your location to a continent or global.</div></div>`;
    return;
  }
  renderMore();
}

// ---------- Rendering ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function safeUrl(u) {
  try {
    const url = new URL(u);
    return /^https?:$/.test(url.protocol) ? url.href : "#";
  } catch { return "#"; }
}

function timeAgo(d) {
  const t = new Date(d);
  if (isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return t.toLocaleDateString();
}

function cardHTML(j) {
  const logo = j.logo
    ? `<img class="job-logo" src="${esc(safeUrl(j.logo))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;job-logo-fallback&quot;>${esc((j.company || "?")[0]).toUpperCase()}</div>'">`
    : `<div class="job-logo-fallback">${esc((j.company || "?")[0]).toUpperCase()}</div>`;
  const tags = j.tags.slice(0, 3).map((t) => `<span class="badge text-bg-light border">${esc(t)}</span>`).join(" ");
  return `
  <div class="col-md-6 col-lg-4">
    <div class="card job-card h-100 shadow-sm">
      <div class="card-body d-flex flex-column">
        <div class="d-flex gap-3 mb-2">
          ${logo}
          <div class="min-w-0">
            <h3 class="h6 mb-0">${esc(j.title)}</h3>
            <div class="text-muted small">${esc(j.company)}</div>
          </div>
        </div>
        <div class="small mb-2">
          <i class="bi bi-geo-alt me-1"></i>${esc(j.location || "Remote")}
          ${j.matchTag === "Worldwide" ? '<span class="badge text-bg-success ms-1">Worldwide</span>' : ""}
        </div>
        <div class="small text-muted mb-2">
          ${j.type ? `<i class="bi bi-briefcase me-1"></i>${esc(j.type)} ` : ""}
          ${j.salary ? `<i class="bi bi-cash ms-2 me-1"></i>${esc(j.salary)}` : ""}
        </div>
        <div class="mb-3 d-flex flex-wrap gap-1">${tags}</div>
        <div class="mt-auto d-flex justify-content-between align-items-center">
          <span class="text-muted small">${esc(timeAgo(j.date))}</span>
          <a class="btn btn-sm btn-primary" href="${esc(safeUrl(j.url))}" target="_blank" rel="noopener noreferrer">View on ${esc(j.source)} <i class="bi bi-box-arrow-up-right"></i></a>
        </div>
      </div>
      <div class="card-footer bg-transparent source-badge text-muted">
        <i class="bi bi-patch-check text-success me-1"></i>Source: <a href="${esc(j.sourceUrl)}" target="_blank" rel="noopener" class="text-decoration-none">${esc(j.source)}</a>
      </div>
    </div>
  </div>`;
}

function renderMore() {
  const next = allResults.slice(shown, shown + PAGE_SIZE);
  $("results").insertAdjacentHTML("beforeend", next.map(cardHTML).join(""));
  shown += next.length;
  $("loadMore").classList.toggle("d-none", shown >= allResults.length);
}
