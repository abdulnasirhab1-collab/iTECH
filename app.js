/* RemoteSure - accounts, dashboard and remote job search
   Job sources (public job APIs): Remotive, Jobicy, Arbeitnow

   NOTE ON ACCOUNTS: this is a front-end-only project (HTML/CSS/JS), so accounts live in
   this browser's localStorage. Passwords are salted and hashed (PBKDF2) rather than stored
   in plain text, but a real production site needs a server-side backend for true security. */

const $ = (id) => document.getElementById(id);
const PAGE_SIZE = 18;

// =====================================================================
//  Accounts
// =====================================================================
const KEY_USERS = "rs_users";
const KEY_SESSION = "rs_session";
const keyHistory = (email) => `rs_history_${email}`;
const keyApps = (email) => `rs_apps_${email}`;

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

const bytesToHex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const hexToBytes = (h) => new Uint8Array(h.match(/.{2}/g).map((x) => parseInt(x, 16)));

function randomSalt() {
  const a = new Uint8Array(16);
  if (window.crypto?.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return bytesToHex(a);
}

async function hashPassword(password, saltHex) {
  if (window.crypto?.subtle) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: 100000, hash: "SHA-256" }, key, 256);
    return bytesToHex(new Uint8Array(bits));
  }
  // Fallback for very old browsers / insecure contexts (weaker)
  let h = 5381;
  const s = saltHex + password;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return "weak" + h;
}

let currentUser = null;
let failedLogins = 0;
let lockedUntil = 0;

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("d-none");
}
function clearError(el) {
  el.classList.add("d-none");
  el.textContent = "";
}

$("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("signupError");
  clearError(err);

  const name = $("signupName").value.trim();
  const email = $("signupEmail").value.trim().toLowerCase();
  const pw = $("signupPassword").value;
  const confirm = $("signupConfirm").value;

  if (name.length < 2) return showError(err, "Please enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError(err, "Please enter a valid email address.");
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw))
    return showError(err, "Password must be at least 8 characters and include a letter and a number.");
  if (pw !== confirm) return showError(err, "Passwords do not match.");

  const users = readJSON(KEY_USERS, {});
  if (users[email]) return showError(err, "An account with this email already exists. Please log in.");

  $("signupBtn").disabled = true;
  try {
    const salt = randomSalt();
    users[email] = { name, salt, hash: await hashPassword(pw, salt), created: Date.now() };
    if (!writeJSON(KEY_USERS, users)) return showError(err, "Could not save your account. Please allow site storage in your browser.");
    writeJSON(KEY_SESSION, email);
    e.target.reset();
    enterApp(email);
  } catch {
    showError(err, "Something went wrong creating your account. Please try again.");
  } finally {
    $("signupBtn").disabled = false;
  }
});

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("loginError");
  clearError(err);

  if (Date.now() < lockedUntil) {
    const s = Math.ceil((lockedUntil - Date.now()) / 1000);
    return showError(err, `Too many attempts. Try again in ${s} seconds.`);
  }

  const email = $("loginEmail").value.trim().toLowerCase();
  const pw = $("loginPassword").value;
  if (!email || !pw) return showError(err, "Enter your email and password.");

  $("loginBtn").disabled = true;
  try {
    const user = readJSON(KEY_USERS, {})[email];
    const ok = user && (await hashPassword(pw, user.salt)) === user.hash;
    if (!ok) {
      failedLogins++;
      if (failedLogins >= 5) { lockedUntil = Date.now() + 30000; failedLogins = 0; }
      return showError(err, "Invalid email or password.");
    }
    failedLogins = 0;
    writeJSON(KEY_SESSION, email);
    e.target.reset();
    enterApp(email);
  } catch {
    showError(err, "Could not log in. Please try again.");
  } finally {
    $("loginBtn").disabled = false;
  }
});

document.querySelectorAll(".pw-toggle").forEach((box) =>
  box.addEventListener("change", () =>
    box.dataset.target.split(",").forEach((id) => { $(id).type = box.checked ? "text" : "password"; })));

function logout() {
  try { localStorage.removeItem(KEY_SESSION); } catch { /* ignore */ }
  currentUser = null;
  resetJobsView();
  $("loginForm").reset();
  $("signupForm").reset();
  clearError($("loginError"));
  clearError($("signupError"));
  showAuth();
  history.replaceState(null, "", location.pathname);
  window.scrollTo(0, 0);
}

$("logoutBtn").addEventListener("click", logout);

function enterApp(email) {
  const user = readJSON(KEY_USERS, {})[email];
  if (!user) return showAuth();
  currentUser = { email, name: user.name, created: user.created };
  $("authView").classList.add("d-none");
  $("appView").classList.remove("d-none");
  $("navUser").textContent = user.name;
  $("dashName").textContent = user.name.split(" ")[0];
  renderDashboard();
  showView(location.hash === "#jobs" ? "jobs" : "dashboard");
}

function showAuth() {
  $("appView").classList.add("d-none");
  $("authView").classList.remove("d-none");
  // A brand-new visitor (no accounts on this device yet) is taken to "Create account".
  const hasAccounts = Object.keys(readJSON(KEY_USERS, {})).length > 0;
  $(hasAccounts ? "loginTab" : "signupTab").click();
}

// =====================================================================
//  Views / navigation
// =====================================================================
function showView(name) {
  if (!currentUser) return;
  $("dashboardView").classList.toggle("d-none", name !== "dashboard");
  $("jobsView").classList.toggle("d-none", name !== "jobs");
  document.querySelectorAll("[data-view]").forEach((a) =>
    a.classList.toggle("active", a.dataset.view === name));
  if (name === "dashboard") renderDashboard();
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  window.scrollTo(0, 0);
  const nav = $("mainNav");
  if (nav.classList.contains("show")) bootstrap.Collapse.getOrCreateInstance(nav).hide();
}

document.querySelectorAll("[data-view], [data-go]").forEach((a) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    showView(a.dataset.view || a.dataset.go);
  }));

window.addEventListener("hashchange", () => {
  if (!currentUser) return;
  if (location.hash === "#jobs") showView("jobs");
  else if (location.hash === "#dashboard") showView("dashboard");
});

// =====================================================================
//  Dashboard
// =====================================================================
function getHistory() { return currentUser ? readJSON(keyHistory(currentUser.email), []) : []; }

function scopeLabel(scope) {
  return scope.type === "global" ? "Worldwide" : scope.value;
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

function renderDashboard() {
  const hist = getHistory();
  $("statSearches").textContent = hist.length;
  renderApplications();
  $("statLast").textContent = hist.length ? timeAgo(hist[0].at) : "-";
  $("statSince").textContent = currentUser?.created
    ? new Date(currentUser.created).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "-";

  const list = $("recentList");
  list.innerHTML = "";
  $("recentEmpty").classList.toggle("d-none", hist.length > 0);
  hist.slice(0, 6).forEach((h, i) => {
    const li = document.createElement("li");
    li.className = "list-group-item px-0 d-flex justify-content-between align-items-center gap-2";
    const text = document.createElement("div");
    text.className = "small";
    const label = `${scopeLabel(h.scope)} · ${h.allTypes ? "All types" : JOB_TYPES[h.typeKey]?.label || "Any"}`;
    text.append(Object.assign(document.createElement("div"), { className: "fw-semibold", textContent: label }));
    text.append(Object.assign(document.createElement("div"), {
      className: "text-muted",
      textContent: `${h.keyword ? `"${h.keyword}" · ` : ""}${h.count} jobs · ${timeAgo(h.at)}`,
    }));
    const btn = document.createElement("button");
    btn.className = "btn btn-sm btn-outline-primary";
    btn.type = "button";
    btn.textContent = "Run again";
    btn.addEventListener("click", () => rerun(hist[i]));
    li.append(text, btn);
    list.append(li);
  });
}

function pushHistory(entry) {
  if (!currentUser) return;
  const same = (a, b) => scopeLabel(a.scope) === scopeLabel(b.scope) && a.typeKey === b.typeKey &&
    a.keyword === b.keyword && a.allTypes === b.allTypes;
  const hist = getHistory().filter((h) => !same(h, entry));
  hist.unshift(entry);
  writeJSON(keyHistory(currentUser.email), hist.slice(0, 15));
}

function rerun(h) {
  showView("jobs");
  scopeSelect.value = h.scope.type;
  onScopeChange();
  if (h.scope.type !== "global") placeSelect.value = h.scope.value;
  updateScope();
  jobTypeSelect.value = h.typeKey;
  $("jobSearch").value = h.keyword || "";
  $("allTypes").checked = !!h.allTypes;
  runSearch({ typeKey: h.typeKey, keyword: h.keyword || "", allTypes: !!h.allTypes });
}

// =====================================================================
//  Step 1: location dropdowns
// =====================================================================
const scopeSelect = $("scopeSelect");
const placeSelect = $("placeSelect");
const jobTypeSelect = $("jobType");

Object.entries(JOB_TYPES).forEach(([key, v]) => jobTypeSelect.add(new Option(v.label, key)));

scopeSelect.addEventListener("change", onScopeChange);
placeSelect.addEventListener("change", updateScope);

function onScopeChange() {
  const type = scopeSelect.value;
  placeSelect.innerHTML = "";
  $("placeWrap").classList.toggle("d-none", type !== "continent" && type !== "country");

  if (type === "continent") {
    $("placeLabel").textContent = "Select a continent";
    placeSelect.add(new Option("Choose a continent…", ""));
    CONTINENTS.forEach((c) => placeSelect.add(new Option(c, c)));
  } else if (type === "country") {
    $("placeLabel").textContent = "Select a country";
    placeSelect.add(new Option("Choose a country…", ""));
    [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name))
      .forEach((c) => placeSelect.add(new Option(c.name, c.name)));
  }
  updateScope();
}

function getScope() {
  const type = scopeSelect.value;
  if (!type) return null;
  if (type === "global") return { type, value: "Global" };
  return placeSelect.value ? { type, value: placeSelect.value } : null;
}

function updateScope() {
  const scope = getScope();
  $("step2").classList.toggle("step-locked", !scope);
  let msg = "Pick a location type to continue.";
  if (scopeSelect.value === "continent" && !scope) msg = "Now choose a continent from the list.";
  if (scopeSelect.value === "country" && !scope) msg = "Now choose a country from the list.";
  if (scope) msg = `Searching: ${scope.type === "global" ? "worldwide jobs" : scope.value}`;
  $("scopeSummary").textContent = msg;
}

// =====================================================================
//  Location matching
// =====================================================================
const WORLDWIDE = /worldwide|anywhere|global|any location|international/i;
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRx = (t) => new RegExp(`(?<![\\p{L}])${escapeRx(t.trim())}(?![\\p{L}])`, "iu");

COUNTRIES.forEach((c) => { c.rxs = [c.name, ...c.aliases].map(wordRx); });
const CONTINENT_RX = Object.fromEntries(CONTINENTS.map((c) => [c, {
  generic: CONTINENT_KEYWORDS[c].map(wordRx),
  countries: COUNTRIES.filter((x) => x.continent === c).flatMap((x) => x.rxs),
}]));

function locationMatch(locText, scope) {
  const loc = (locText || "").trim();
  if (scope.type === "global") return { ok: true, tag: WORLDWIDE.test(loc) ? "Worldwide" : null };
  if (WORLDWIDE.test(loc)) return { ok: true, tag: "Worldwide" };

  if (scope.type === "continent") {
    const r = CONTINENT_RX[scope.value];
    const hit = r.generic.some((x) => x.test(loc)) || r.countries.some((x) => x.test(loc));
    return { ok: hit, tag: hit ? scope.value : null };
  }

  const c = COUNTRIES.find((x) => x.name === scope.value);
  if (!c) return { ok: false };
  if (c.rxs.some((x) => x.test(loc))) return { ok: true, tag: c.name };
  if (CONTINENT_RX[c.continent].generic.some((x) => x.test(loc))) return { ok: true, tag: c.continent };
  return { ok: false };
}

// =====================================================================
//  Job source fetchers (responses cached for 15 minutes to be kind to the APIs)
// =====================================================================
const cache = new Map();
const CACHE_MS = 15 * 60 * 1000;

async function fetchJSON(url, ms = 15000) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.data;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cache.set(url, { t: Date.now(), data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function fromRemotive(typeKey) {
  const params = new URLSearchParams({ limit: "200" });
  const cat = REMOTIVE_CATEGORY[typeKey];
  if (cat) params.set("category", cat);
  const data = await fetchJSON(`https://remotive.com/api/remote-jobs?${params}`);
  return (data.jobs || []).map((j) => ({
    title: j.title, company: j.company_name, location: j.candidate_required_location || "",
    type: (j.job_type || "").replace(/_/g, " "), date: j.publication_date,
    url: j.url, logo: j.company_logo, source: "Remotive", sourceUrl: "https://remotive.com",
    tags: [j.category, ...(j.tags || [])].filter(Boolean), salary: j.salary || "",
    inCategory: Boolean(cat),
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

// =====================================================================
//  Search
// =====================================================================
let allResults = [];
let shown = 0;
let activeTypeKey = "all";

$("typeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!getScope()) return;
  activeTypeKey = jobTypeSelect.value;
  $("jobSearch").value = "";
  $("allTypes").checked = false;
  runSearch({ typeKey: activeTypeKey, keyword: "", allTypes: false });
});

$("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  runSearch({ typeKey: activeTypeKey, keyword: $("jobSearch").value.trim(), allTypes: $("allTypes").checked });
});

$("loadMore").addEventListener("click", renderMore);

async function runSearch({ typeKey, keyword, allTypes }) {
  const scope = getScope();
  if (!scope) return;
  activeTypeKey = typeKey;
  const effType = allTypes ? "all" : typeKey;

  $("resultsSection").classList.remove("d-none");
  $("results").innerHTML = "";
  $("sourceStatus").innerHTML = "";
  $("loadMore").classList.add("d-none");
  $("loading").classList.remove("d-none");
  $("listBtn").disabled = true;
  $("searchBtn").disabled = true;
  $("resultsTitle").textContent = "Searching…";

  const sources = [
    ["Remotive", () => fromRemotive(effType)],
    ["Jobicy", () => fromJobicy(keyword)],
    ["Arbeitnow", () => fromArbeitnow()],
  ];
  const settled = await Promise.allSettled(sources.map(([, fn]) => fn()));

  let jobs = [];
  settled.forEach((r, i) => {
    const name = sources[i][0];
    const ok = r.status === "fulfilled";
    if (ok) jobs = jobs.concat(r.value);
    const badge = document.createElement("span");
    badge.className = `badge ${ok ? "text-bg-success" : "text-bg-secondary"}`;
    badge.textContent = ok ? `${name} (${r.value.length})` : `${name} unavailable`;
    $("sourceStatus").append(badge);
  });

  const kws = JOB_TYPES[effType].kw;
  const terms = keyword.toLowerCase().split(/\s+/).filter(Boolean);

  jobs = jobs.filter((j) => {
    const title = j.title.toLowerCase();
    const hay = `${title} ${j.tags.join(" ").toLowerCase()} ${(j.company || "").toLowerCase()} `;
    if (kws.length && !j.inCategory && !kws.some((k) => hay.includes(k))) return false;
    if (terms.length && !terms.every((t) => hay.includes(t))) return false;
    const m = locationMatch(j.location, scope);
    j.matchTag = m.tag;
    j.titleHits = terms.filter((t) => title.includes(t)).length;
    return m.ok;
  });

  const seen = new Set();
  jobs = jobs.filter((j) => {
    const k = `${j.title}|${j.company}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return Boolean(j.url);
  });
  jobs.sort((a, b) => (b.titleHits - a.titleHits) || (new Date(b.date || 0) - new Date(a.date || 0)));

  allResults = jobs;
  shown = 0;
  $("loading").classList.add("d-none");
  $("listBtn").disabled = false;
  $("searchBtn").disabled = false;

  const where = scope.type === "global" ? "worldwide" : `in ${scope.value}`;
  const what = allTypes ? "All job types" : JOB_TYPES[effType].label;
  $("resultsTitle").textContent =
    `${jobs.length} remote job${jobs.length === 1 ? "" : "s"} ${where} · ${what}${keyword ? ` · "${keyword}"` : ""}`;

  pushHistory({ scope, typeKey, keyword, allTypes, at: Date.now(), count: jobs.length });

  if (!jobs.length) {
    const hint = keyword && !allTypes
      ? "Try ticking “Search all job types”, using fewer words, or widening your location."
      : "Try a different job type, or widen your location to a continent or global.";
    $("results").innerHTML = `<div class="col-12"><div class="alert alert-info mb-0">No matching jobs found. ${esc(hint)}</div></div>`;
    return;
  }
  renderMore();
}

function resetJobsView() {
  allResults = [];
  shown = 0;
  $("results").innerHTML = "";
  $("sourceStatus").innerHTML = "";
  $("resultsSection").classList.add("d-none");
  $("jobSearch").value = "";
  $("allTypes").checked = false;
  scopeSelect.value = "";
  onScopeChange();
  jobTypeSelect.value = "all";
}


// =====================================================================
//  Applying: "Apply now" goes straight to the job's application page,
//  and the click is logged under "My applications" on the dashboard.
// =====================================================================
const getApps = () => (currentUser ? readJSON(keyApps(currentUser.email), []) : []);
const setApps = (apps) => writeJSON(keyApps(currentUser.email), apps);

function slimJob(j) {
  const { title, company, location, type, salary, tags, date, url, source, sourceUrl, logo } = j;
  return { title, company, location, type, salary, tags, date, url, source, sourceUrl, logo };
}

// The link itself opens the page (no preventDefault); we only record it.
$("results").addEventListener("click", (e) => {
  const link = e.target.closest("a[data-apply]");
  const job = link && allResults[link.dataset.apply];
  if (!job || !currentUser) return;
  const apps = getApps();
  const i = apps.findIndex((x) => x.job.url === job.url);
  const prev = i >= 0 ? apps.splice(i, 1)[0] : null;
  apps.unshift({ job: slimJob(job), status: prev?.status || "started", at: Date.now() });
  setApps(apps.slice(0, 50));
  renderApplications();
});

function renderApplications() {
  const apps = getApps();
  $("statApps").textContent = apps.length;
  const list = $("appList");
  list.innerHTML = "";
  $("appEmpty").classList.toggle("d-none", apps.length > 0);
  apps.slice(0, 8).forEach((app) => {
    const done = app.status === "applied";
    const li = document.createElement("li");
    li.className = "list-group-item px-0";

    const top = document.createElement("div");
    top.className = "d-flex justify-content-between align-items-start gap-2";
    const text = document.createElement("div");
    text.className = "small min-w-0";
    text.append(Object.assign(document.createElement("div"), { className: "fw-semibold", textContent: app.job.title }));
    text.append(Object.assign(document.createElement("div"), { className: "text-muted", textContent: `${app.job.company} · ${timeAgo(app.at)}` }));
    const badge = document.createElement("span");
    badge.className = `badge ${done ? "text-bg-success" : "text-bg-warning"} flex-shrink-0`;
    badge.textContent = done ? "Applied" : "In progress";
    top.append(text, badge);

    const actions = document.createElement("div");
    actions.className = "d-flex flex-wrap gap-2 mt-2";
    const open = document.createElement("a");
    open.className = "btn btn-sm btn-success";
    open.href = safeUrl(app.job.url);
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = done ? "Open job" : "Continue applying";
    const mk = (label, cls, fn) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = `btn btn-sm ${cls}`; b.textContent = label;
      b.addEventListener("click", fn);
      return b;
    };
    actions.append(
      open,
      mk(done ? "Undo" : "I have applied", "btn-outline-primary", () => {
        const all = getApps();
        const cur = all.find((x) => x.job.url === app.job.url);
        if (cur) { cur.status = done ? "started" : "applied"; setApps(all); renderApplications(); }
      }),
      mk("Remove", "btn-outline-secondary", () => {
        setApps(getApps().filter((x) => x.job.url !== app.job.url));
        renderApplications();
      }),
    );
    li.append(top, actions);
    list.append(li);
  });
}

// =====================================================================
//  Rendering job cards
// =====================================================================
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function safeUrl(u) {
  try {
    const url = new URL(u);
    return /^https?:$/.test(url.protocol) ? url.href : "#";
  } catch { return "#"; }
}

function cardHTML(j, idx) {
  const initial = esc((j.company || "?")[0] || "?").toUpperCase();
  const logo = j.logo
    ? `<img class="job-logo" src="${esc(safeUrl(j.logo))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;job-logo-fallback&quot;>${initial}</div>'">`
    : `<div class="job-logo-fallback">${initial}</div>`;
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
          <a class="btn btn-sm btn-primary" href="${esc(safeUrl(j.url))}" target="_blank" rel="noopener noreferrer" data-apply="${idx}">Apply now <i class="bi bi-send"></i></a>
        </div>
      </div>
      <div class="card-footer bg-transparent source-badge text-muted">
        <i class="bi bi-patch-check text-success me-1"></i>Listed on <a href="${esc(j.sourceUrl)}" target="_blank" rel="noopener" class="text-decoration-none">${esc(j.source)}</a>
      </div>
    </div>
  </div>`;
}

function renderMore() {
  const start = shown;
  const next = allResults.slice(start, start + PAGE_SIZE);
  $("results").insertAdjacentHTML("beforeend", next.map((j, k) => cardHTML(j, start + k)).join(""));
  shown += next.length;
  $("loadMore").classList.toggle("d-none", shown >= allResults.length);
}

// =====================================================================
//  Start
// =====================================================================
function checkSession() {
  const email = readJSON(KEY_SESSION, null);
  if (email && readJSON(KEY_USERS, {})[email]) { if (!currentUser) enterApp(email); }
  else { currentUser = null; showAuth(); }
}

checkSession();

// Logged out in another tab, or the page was restored from the back/forward cache:
// make sure the site is locked again.
window.addEventListener("storage", (e) => { if (e.key === KEY_SESSION && !e.newValue && currentUser) logout(); });
window.addEventListener("pageshow", (e) => { if (e.persisted) checkSession(); });
