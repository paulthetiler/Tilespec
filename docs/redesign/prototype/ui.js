/*
 * Prototype shell: state, router, shared components, simulated saving.
 * Nothing here talks to a backend. Saving changes the in-memory scenario so that
 * the Next Action engine (engine.js, bundled from lib/operations/next-actions) re-derive what each person should do next.
 */
(function () {
  const R = window.TSRules;
  const P = (window.P = { screens: {}, acts: {}, ui: { device: "mobile", hints: false, flaky: false, scenario: "start", person: "u-dave", sheet: null, failed: false } });
  P.R = R;
  P.S = window.TSData.make("start");

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  P.esc = esc;
  const $ = (sel, el) => (el || document).querySelector(sel);
  P.$ = $;

  P.viewer = () => P.S.members.find((m) => m.user_id === P.ui.person) || null;
  P.role = () => (P.viewer() ? R.roleKey(P.viewer()) : null);
  P.money = (n) => R.money(n);
  P.fd = (iso) => (iso ? new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "");
  P.uid = (p) => p + Math.random().toString(36).slice(2, 8);
  P.nowIso = () => P.S.today + "T" + P.S.now + ":00Z";
  P.L = () => R.lib(P.S);

  const IC = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/>',
    pound: '<circle cx="12" cy="12" r="9"/><path d="M15 8.5a3 3 0 00-5.5 1.5v2.5M8.5 12.5h5M8.5 12.5V15c0 1-.6 2-2 2.5h8.5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14c2.5.7 4 2.5 4 6"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 13l2 2 4-4"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
    send: '<path d="M3 11L21 3l-8 18-2-8z"/>',
    stop: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M8 12h8"/>',
    wrench: '<path d="M14.5 6a4 4 0 005.5 5l-9 9a2.1 2.1 0 01-3-3l9-9a4 4 0 00-2.5-2z"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
    bell: '<path d="M6 17v-6a6 6 0 1112 0v6l2 2H4z"/><path d="M10 21h4"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
    map: '<path d="M12 21s7-6 7-12a7 7 0 10-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  };
  P.ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ""}</svg>`;

  P.chip = (kind, text, icon) => `<span class="chip ${kind}">${icon ? P.ic(icon) : ""}${esc(text)}</span>`;
  // Backend reality check badges. Only visible when the review toggle is on.
  P.hint = (kind, label) => `<span class="hint ${kind}">${esc(label || (kind === "exists" ? "Built" : kind === "query" ? "Query only" : "New backend"))}</span>`;
  P.hb = (backend) => (backend === "exists" ? P.hint("exists", "Built") : String(backend).startsWith("new") ? P.hint("new", "New backend " + String(backend).split(":")[1]) : P.hint("query", "Query only"));

  P.back = (to, label) => `<button class="back" data-act="back" data-to="${esc(to || "#/today")}">${P.ic("back")}${esc(label || "Back")}</button>`;

  P.row = (o) => {
    const inner = `${o.icon ? `<span class="lead ${o.tone || ""}">${P.ic(o.icon)}</span>` : ""}<span class="text"><strong>${o.title}</strong>${o.sub ? `<span>${o.sub}</span>` : ""}${o.chips ? `<span class="chips">${o.chips}</span>` : ""}</span>${o.noChevron ? "" : P.ic("chevron")}`;
    if (o.act) return `<button class="row" data-act="${o.act}" ${Object.entries(o.data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ")}>${inner}</button>`;
    return `<a class="row" href="${o.href || "#/today"}">${inner}</a>`;
  };

  // ---- routing ---------------------------------------------------------------
  P.route = () => {
    const h = location.hash.replace(/^#\/?/, "");
    const [p, q = ""] = h.split("?");
    const [screen, ...rest] = p.split("/");
    return { screen: screen || "today", id: rest.join("/") || null, q: Object.fromEntries(new URLSearchParams(q)) };
  };
  P.href = (route) => {
    if (!route) return "#/today";
    const { screen, id, ...q } = route;
    const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== null)).toString();
    return `#/${screen}${id ? "/" + encodeURIComponent(id) : ""}${qs ? "?" + qs : ""}`;
  };

  // ---- tabs: at most four per role ------------------------------------------
  P.NAV = {
    owner: [["today", "Today", "home"], ["jobs", "Jobs", "briefcase"], ["money", "Money", "pound"]],
    office: [["today", "Today", "home"], ["jobs", "Jobs", "briefcase"], ["tenders", "Tenders", "inbox"], ["labour", "Labour", "users"]],
    supervisor: [["today", "Today", "home"], ["people", "People", "users"], ["inspect", "Inspect", "clipboard"], ["issues", "Issues", "alert"]],
    subcontractor: [["today", "Today", "home"], ["fixes", "Fixes", "wrench"], ["papers", "Paperwork", "file"]],
  };
  P.tabOf = (screen, role) => {
    const map = { jobs: "jobs", job: "jobs", tenders: "tenders", tender: "tenders", labour: "labour", money: "money", people: "people", inspect: "inspect", issues: "issues", fixes: "fixes", papers: "papers" };
    if (map[screen]) return map[screen];
    if (role === "supervisor" && ["snag", "hold"].includes(screen)) return "issues";
    if (role === "subcontractor" && screen === "fix") return "fixes";
    return "today";
  };

  P.actionVisible = (a) => a.state === "ready" || a.state === "info";
  P.CTA = R.ctaLabel;
  const SHEET_RULES = new Set(["G08", "R09", "R10", "R08", "A02", "R11", "R04"]);
  P.ctaAttrs = (a) => (SHEET_RULES.has(a.rule) ? `data-act="task" data-id="${esc(a.id)}"` : `href="${P.href(a.route)}"`);
  P.ctaBtn = (a, cls) => {
    const tag = SHEET_RULES.has(a.rule) ? "button" : "a";
    return `<${tag} class="btn ${cls || ""}" ${P.ctaAttrs(a)}>${esc(P.CTA(a))}${P.ic("chevron")}</${tag}>`;
  };

  P.dueText = (a) => {
    if (!a.due) return "";
    if (a.due < P.S.today) return `Overdue since ${P.fd(a.due)}`;
    if (a.due === P.S.today) return "Due today";
    return `Due ${P.fd(a.due)}`;
  };
  P.kindChip = (a) => { const c = R.classChip(a); return P.chip(c.tone === "reminder" ? "done" : c.tone, c.text, c.tone === "must" ? "lock" : c.tone === "alert" ? "alert" : "bell"); };
  const PROC = { "stop-work": ["stop", "stop"], snag: ["wrench", "amber"], inspection: ["clipboard", ""], "daily-site": ["users", ""], workforce: ["users", ""], "job-setup": ["briefcase", ""], compliance: ["shield", "amber"], tender: ["inbox", ""], money: ["pound", ""] };

  P.actionRow = (a) => {
    const [icon, tone] = PROC[a.process] || ["info", ""];
    const where = [a.job.name, a.location].filter(Boolean).join(" › ");
    const chips = [];
    if (a.state === "waiting") chips.push(P.chip("pending", `Waiting on ${a.responsible.who || a.responsible.label}`, "clock"));
    if (a.state === "blocked") chips.push(P.chip("blocked", "Blocked", "lock"));
    if (a.kind !== "reminder" && a.state !== "waiting") chips.push(P.kindChip(a));
    if (a.overdue) chips.push(P.chip("blocked", P.dueText(a), "alert"));
    const sub = a.state === "blocked" ? esc(a.blockedBy) : esc(where);
    const lead = `<span class="lead ${tone}">${P.ic(icon)}</span>`;
    const body = `<span class="text"><strong>${esc(a.title)}</strong><span>${sub}</span>${chips.length ? `<span class="chips">${chips.join("")}</span>` : ""}</span>${a.state === "ready" ? P.ic("chevron") : ""}`;
    if (a.state === "ready" || a.state === "info") return `<${SHEET_RULES.has(a.rule) ? "button" : "a"} class="row" ${P.ctaAttrs(a)}>${lead}${body}</${SHEET_RULES.has(a.rule) ? "button" : "a"}>`;
    return `<div class="row" role="group" aria-label="${esc(a.title)}">${lead}${body}</div>`;
  };

  P.hero = (a) => `<section class="card hero ${a.kind}" aria-labelledby="hero-title" data-hint>
      <p class="eyebrow">Do this next ${P.hint("query", "Derived from saved records")}</p>
      <div class="chips">${P.kindChip(a)}${a.overdue ? P.chip("blocked", P.dueText(a), "alert") : a.due ? P.chip("done", P.dueText(a), "clock") : ""}</div>
      <h2 id="hero-title" class="title" style="font-size:clamp(30px,8cqw,44px)">${esc(a.title)}</h2>
      <p class="small muted">${esc([a.job.name, a.location].filter(Boolean).join(" › "))}</p>
      <p class="why">${esc(a.why)}</p>
      <p class="small muted">${P.ic("users").replace("<svg", '<svg style="width:15px;height:15px;vertical-align:-2px"')} ${esc(a.responsible.who ? a.responsible.who + " (" + a.responsible.label + ")" : a.responsible.label)}</p>
      ${P.ctaBtn(a)}
      ${a.requires.length ? `<p class="small muted">You will need: ${esc(a.requires.join(", "))}.</p>` : ""}
      ${a.kind !== "reminder" ? `<p class="small muted">${esc(R.classNote(a))}</p>` : ""}
    </section>`;

  P.needBox = (a) => {
    if (!a) return "";
    const rows = [["Who", a.responsible.who ? `${a.responsible.who} (${a.responsible.label})` : a.responsible.label], ["Due", a.due ? P.dueText(a) : "No date"], ...(a.requires.length ? [["You will need", a.requires.join(", ")]] : []), ["Finished when", a.doneWhen], ["Then", a.next || "Nothing further"], ["Saved on", a.source.table]];
    return `<section class="card" aria-label="What is needed"><div class="chips">${P.kindChip(a)}${a.overdue ? P.chip("blocked", P.dueText(a), "alert") : ""}</div>
      <p>${esc(a.why)}</p>
      <details class="more"><summary>What this needs ${a.informationOnly ? P.hint("query", "Read-only") : P.hint("exists")}</summary><dl class="kv">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
      <p class="small muted">${esc(R.classNote(a))}</p></details></section>`;
  };

  P.empty = (title, text, icon) => `<section class="card empty">${P.ic(icon || "check")}<h2 class="section" style="margin:0">${esc(title)}</h2><p class="sub">${esc(text)}</p></section>`;

  // ---- saving, toasts and sheets ---------------------------------------------
  P.toast = (text, err) => {
    P.curToast = { text, err, until: Date.now() + (err ? 6000 : 3200) };
    P.mountToast();
  };
  P.mountToast = () => {
    const t = P.curToast, dev = $("#device");
    const old = $(".toast", dev);
    if (old) old.remove();
    if (!t || Date.now() > t.until) return;
    const el = document.createElement("div");
    el.className = "toast" + (t.err ? " err" : "");
    el.setAttribute("role", t.err ? "alert" : "status");
    el.innerHTML = P.ic(t.err ? "alert" : "check") + `<span>${esc(t.text)}</span>`;
    dev.appendChild(el);
    setTimeout(() => { if (el.isConnected) el.remove(); }, Math.max(0, t.until - Date.now()));
  };
  P.log = (text) => P.S.log.unshift({ at: P.S.now, who: P.viewer() ? P.viewer().display_name : "", text });

  // Simulated save. With "Simulate poor signal" on, the first attempt fails and
  // nothing the person typed is lost: the form is not re-rendered until a save succeeds.
  P.save = (label, fn, btn, after) => {
    const original = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = "Saving…"; }
    setTimeout(() => {
      if (P.ui.flaky && !P.ui.failed) {
        P.ui.failed = true;
        if (btn) { btn.disabled = false; btn.innerHTML = "Try again"; }
        P.toast("Not saved. Nothing you entered was lost. Tap Try again.", true);
        return;
      }
      P.ui.failed = false;
      fn();
      P.log(label);
      P.ui.sheet = null;
      if (after) after(); else P.render();
      P.toast("Saved: " + label);
    }, P.ui.flaky ? 600 : 220);
    void original;
  };

  P.sheet = (html) => { P.ui.sheet = html; P.render(); const s = $(".sheet"); if (s) s.focus(); };
  P.closeSheet = () => { P.ui.sheet = null; P.render(); };

  // Read all named fields inside a container, including pressed choice buttons.
  P.form = (el) => {
    const box = el.closest("[data-form]") || el.closest(".sheet") || document;
    const out = {};
    box.querySelectorAll("[name]").forEach((f) => { out[f.name] = f.type === "checkbox" ? f.checked : f.value.trim(); });
    box.querySelectorAll("[data-choice]").forEach((g) => { const p = g.querySelector('[aria-pressed="true"]'); out[g.dataset.choice] = p ? p.dataset.v : ""; });
    box.querySelectorAll(".photo[data-photo]").forEach((p) => { out[p.dataset.photo] = p.classList.contains("has"); });
    return out;
  };
  P.need = (cond, msg) => { if (!cond) { P.toast(msg, true); return false; } return true; };

  P.choice = (name, options, current) => `<div class="triple" data-choice="${name}" role="group">${options.map(([v, label, bad]) => `<button type="button" class="${bad ? "bad" : ""}" data-act="pick" data-v="${v}" aria-pressed="${v === current}">${esc(label)}</button>`).join("")}</div>`;
  P.photo = (name, label) => `<button type="button" class="photo" data-act="photo" data-photo="${name}" aria-pressed="false">${P.ic("camera")}<span>${esc(label || "Take or add a photo")} ${P.hint("exists", "Private storage")}</span></button>`;

  P.sheetFrame = (title, inner) => `<div class="scrim" data-act="close-bg"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1" data-form><span class="grab"></span><div class="right-actions" style="justify-content:space-between;align-items:center"><h2>${esc(title)}</h2><button class="btn quiet" data-act="close" style="min-height:44px">Close</button></div>${inner}</div></div>`;

  // ---- render ------------------------------------------------------------------
  P.render = () => {
    const dev = $("#device");
    dev.className = "device" + (P.ui.hints ? " hints" : "");
    const stage = $("#stage");
    stage.className = "stage " + P.ui.device;
    const v = P.viewer();
    const keep = $(".main", dev) ? $(".main", dev).scrollTop : 0;
    if (!v) { dev.innerHTML = P.screens.login(); return; }
    const role = P.role(), r = P.route();
    const actions = P.actions = R.compute(P.S, v);
    P.cur = { r, role, v, actions };
    const screen = P.screens[r.screen] || P.screens.today;
    const body = screen(r, P.cur);
    const tab = P.tabOf(r.screen, role);
    const ready = actions.filter((a) => a.state === "ready").length;
    const nav = P.NAV[role];
    const legend = `<div class="legend" role="note"><strong>Backend reality check</strong> ${P.hint("exists", "Built")} already in the app ${P.hint("query", "Query only")} new screen or read-only query, no schema change ${P.hint("new", "New backend")} needs approval before it could exist</div>`;
    dev.innerHTML = `${legend}<div class="app">
      <header class="topbar"><img class="logo" src="tilespec-logo-animated.svg" alt="TileSPEC"><div class="right">${role === "supervisor" ? `<button class="report-pill" data-act="report">${P.ic("alert")}Report an issue</button>` : ""}<button class="avatar" data-act="who" aria-label="Your account">${esc(v.display_name.split(" ").map((x) => x[0]).join(""))}</button></div></header>
      <main class="main" id="main"><div class="page">${body}</div></main>
      <nav class="tabbar" aria-label="Main">${nav.map(([k, label, icon]) => `<a class="tab" href="#/${k}" ${k === tab ? 'aria-current="page"' : ""}>${P.ic(icon)}${esc(label)}${k === "today" && ready ? `<span class="dot" aria-label="${ready} waiting for you">${ready}</span>` : ""}</a>`).join("")}</nav></div>${P.ui.sheet || ""}`;
    const main = $(".main", dev);
    if (main && P.lastHash === location.hash) main.scrollTop = keep; else if (main) main.scrollTop = 0;
    P.lastHash = location.hash;
    P.mountToast();
  };

  // ---- events ------------------------------------------------------------------
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || !el.closest("#device")) return;
    const name = el.dataset.act;
    if (name === "close-bg" && e.target !== el) return;
    const fn = P.acts[name === "close-bg" ? "close" : name];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && P.ui.sheet) P.closeSheet(); });
  P.acts.back = (el) => { const to = el.dataset.to; if (to) location.hash = to; else history.back(); };
  P.acts.close = () => P.closeSheet();
  P.acts.pick = (el) => {
    el.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false")); el.setAttribute("aria-pressed", "true");
    if (el.parentElement.dataset.choice === "stop") {
      const sheet = el.closest(".sheet");
      sheet.querySelectorAll("[data-when-no]").forEach((n) => { n.hidden = el.dataset.v !== "no"; });
      sheet.querySelectorAll("[data-when-stop]").forEach((n) => { n.hidden = el.dataset.v === "no"; });
      sheet.querySelectorAll("[data-when-safety]").forEach((n) => { n.hidden = el.dataset.v !== "safety"; });
    }
  };
  P.acts.photo = (el) => { const on = !el.classList.contains("has"); el.classList.toggle("has", on); el.setAttribute("aria-pressed", String(on)); el.innerHTML = on ? `${P.ic("check")}<span>Photo added</span>` : `${P.ic("camera")}<span>Take or add a photo</span>`; };
  window.addEventListener("hashchange", () => { P.ui.sheet = null; P.render(); });

  P.setScenario = (name) => { P.ui.scenario = name; P.S = window.TSData.make(name); P.ui.failed = false; P.ui.sheet = null; P.render(); };
})();
