/* Screens used mainly by supervisors, plus screens every role shares (Today, snag, stop work, decision). */
(function () {
  const P = window.P, R = P.R, esc = P.esc;
  const find = (arr, id) => arr.find((x) => x.id === id);
  const visible = (ctx) => new Set(R.visibleContractIds(P.S, ctx.v, P.L()));
  const nav = (hash) => { if (location.hash === hash) P.render(); else location.hash = hash; };
  P.nav = nav;
  P.canSeeMoney = (ctx) => ctx.role === "owner" || (ctx.role === "office" && ctx.v.financial_access);

  const HOLD_TEXT = { active: "Stopped: waiting for a fix", correction_submitted: "Fix sent, not yet checked", awaiting_release: "Waiting for the office to check", released: "Work restarted" };
  const SNAG_TEXT = { open: "New", assigned: "With the gang", rectification_submitted: "Repair sent: needs checking", reinspection: "Needs checking", closed: "Closed" };
  P.HOLD_TEXT = HOLD_TEXT; P.SNAG_TEXT = SNAG_TEXT;
  const teamName = (id) => (id ? (P.L().teams.get(id) || {}).name || "A gang" : "Nobody yet");
  const teamOptions = (sel) => P.S.teams.map((t) => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  const areaOptions = (ids) => P.S.work_areas.filter((a) => ids.has(a.contract_id) && a.path_ids.length > 1).map((a) => `<option value="${a.id}">${esc(P.L().path(a.id))}</option>`).join("");
  P.teamOptions = teamOptions; P.areaOptions = areaOptions;

  // ---------------------------------------------------------------- Today
  P.screens.today = (r, ctx) => {
    const { role, v, actions } = ctx;
    if (role === "subcontractor") return P.screens.subToday(r, ctx);
    // One queue, from the one engine. The top task gets the main button. Everything else stays visible underneath.
    const q = R.buildQueue(actions, { groupExceptions: role === "owner" });
    const nxt = q.next, more = q.then, info = q.info, exceptions = q.exceptions;
    const alerts = q.alerts.filter((a) => a.state !== "ready");
    const waiting = q.waiting.filter((a) => !alerts.includes(a));
    const saved = R.savedToday(P.S, v);
    const first = v.display_name.split(" ")[0];
    const counts = R.queueCounts(q);
    // Alerts already in the banner are not listed or counted again under Risks.
    const listedExceptions = exceptions.filter((a) => !alerts.some((b) => b.id === a.id));
    const activeHolds = P.S.work_holds.filter((h) => ["active", "correction_submitted", "awaiting_release"].includes(h.status) && visible(ctx).has(h.contract_id));
    const jobs = [...visible(ctx)].map((id) => P.L().contracts.get(id)).filter(Boolean);
    const attention = role === "owner" ? alerts.length : 0;
    const infoN = role === "owner" ? counts.informational : 0;
    const bits = [];
    if (counts.actions) bits.push(counts.actions === 1 ? "1 thing needs you" : `${counts.actions} things need you`);
    else if (!attention && !infoN) bits.push("Nothing needs you right now");
    if (attention) bits.push(attention === 1 ? "1 needs attention" : `${attention} need attention`);
    if (infoN) bits.push(infoN === 1 ? "1 informational alert" : `${infoN} informational alerts`);
    P.todayBadge = role === "owner" ? counts.actions + attention : null;
    const head = `<header class="gap-s"><p class="eyebrow">${esc(P.fd(P.S.today))}${role === "supervisor" ? " · " + esc(jobs.map((c) => c.name).join(", ")) : ""}</p><h1 class="title">Hello, ${esc(first)}</h1>
      <p class="sub">${esc(bits.join(". ") + ".")}</p></header>`;
    const idle = R.idleCopy({ activeRestrictions: activeHolds.length > 0, waitingOnOthers: waiting.length + alerts.length > 0 });
    const main = nxt ? P.hero(nxt) : P.empty(idle.title, idle.text);
    const list = (cls, rows) => `<div class="card flat list">${rows.map(P.actionRow).join("")}</div>`;
    const holdBanner = role === "supervisor" && activeHolds.length ? `<section class="gap-s" aria-label="Work that is stopped"><h2 class="section">Work that is stopped</h2>${activeHolds.map((h) => `<section class="banner stop"><strong>${esc(h.hold_type === "safety" ? "Safety stop" : "Quality hold")}: ${esc(P.L().path(h.work_area_id))}</strong><span>${esc(h.reason)}</span><span>Keep the affected work stopped. Only this location and activity is held.${h.hold_type === "safety" ? " Follow the principal contractor's site safety procedures." : ""} Completing your own tasks does not clear a restriction.</span><a href="#/hold/${h.id}">View restriction</a></section>`).join("")}</section>` : "";
    const alertBox = alerts.length ? alerts.map((a) => `<section class="banner alert" role="status" data-hint><div class="chips">${P.kindChip(a)}${a.due ? P.chip("done", P.dueText(a), "clock") : ""}</div><strong>${esc(a.title)}</strong><span>${esc(a.why)}</span><span class="small muted">${esc(R.classNote(a))}</span></section>`).join("") : "";
    const thenList = more.length ? `<section class="gap-s"><h2 class="section">Then (${more.length})</h2>${list("", more)}</section>` : "";
    const infoList = info.length ? `<section class="gap-s"><h2 class="section">For your information</h2>${list("", info)}</section>` : "";
    const riskList = listedExceptions.length ? `<section class="gap-s" aria-label="Risks and exceptions"><h2 class="section">Risks and exceptions (${listedExceptions.length})</h2><p class="small muted">Stopped work, defects, cover and money that are not yours to action today.</p>${list("", listedExceptions)}</section>` : "";
    const waitList = waiting.length ? `<section class="gap-s"><h2 class="section">Waiting on others (${waiting.length})</h2>${list("", waiting)}</section>` : "";
    const savedList = saved.length ? `<section class="gap-s"><h2 class="section">Saved today</h2><div class="card flat list">${saved.map((s) => `<div class="row" role="group"><span class="lead">${P.ic("check")}</span><span class="text"><strong>${esc(s.label)}</strong><span>${esc(s.job)} · ${esc(s.at)}</span></span>${P.chip("saved", "Saved", "check")}</div>`).join("")}</div></section>` : "";
    let extra = "";
    if (role === "supervisor") {
      const unread = P.S.supervisor_office_items.filter((m) => m.recipient_id === v.user_id && !P.S.supervisor_office_acknowledgements.some((a) => a.item_id === m.id) && (m.acknowledgement_required || m.kind === "qa_request")).length;
      extra = `<section class="gap-s"><h2 class="section">More</h2><div class="card flat list">${P.row({ href: "#/messages", icon: "mail", title: "Messages from the office", sub: unread ? `${unread} to read` : "Nothing new", chips: unread ? P.chip("pending", `${unread} new`, "bell") : "" })}${P.row({ href: "#/handover", icon: "send", title: "End of day handover", sub: "Today's records are filled in for you" })}</div></section>`;
    }
    if (role === "owner" && P.canSeeMoney(ctx)) {
      const all = P.S.commercials.map((c) => R.budgetSummary(c));
      const value = all.reduce((t, b) => t + b.value, 0), profit = all.reduce((t, b) => t + b.profit, 0);
      extra = `<section class="gap-s"><h2 class="section">Budget position</h2><a class="card" href="#/money" data-hint><div class="tile-row" style="grid-template-columns:repeat(2,1fr)"><div class="tile"><strong>${P.money(value)}</strong><span>Contract value, ${all.length} jobs</span></div><div class="tile"><strong>${(value ? (profit / value) * 100 : 0).toFixed(1)}%</strong><span>Budgeted margin after reserve</span></div></div><p class="small muted">Original budgets only. Real costs and claims are not recorded yet. ${P.hint("new", "New backend B3, B6")}</p></a></section>`;
    }
    if (role === "office") {
      extra = `<section class="gap-s"><h2 class="section">Jobs</h2><div class="card flat list">${jobs.map((c) => { const n = actions.filter((a) => a.job.id === c.id && a.state === "ready").length; const stop = P.S.work_holds.filter((h) => h.contract_id === c.id && ["active", "correction_submitted", "awaiting_release"].includes(h.status)).length; const chips = (n ? P.chip("pending", `${n} to do`, "bell") : "") + (stop ? P.chip("blocked", `${stop} stopped`, "stop") : n ? "" : P.chip("saved", "Nothing needed", "check")); return P.row({ href: "#/job/" + c.id, icon: "briefcase", title: esc(c.reference + " · " + c.name), sub: n ? `${n} need you` : stop ? "Work is still restricted" : "Nothing needed", chips }); }).join("")}</div></section>`;
    }
    return `${head}<div class="two-col"><div class="gap-s" style="display:grid;gap:16px">${holdBanner}${alertBox}${main}${thenList}${infoList}</div><div style="display:grid;gap:16px">${riskList}${waitList}${savedList}${extra}</div></div>`;
  };

  // ---------------------------------------------------------------- morning checks
  const MORNING = [["People", [["Are the expected lads on site?", "no"], ["Has everyone received the relevant site safety briefing?", "no"], ["Have office instructions been passed on?", "no"]]],
    ["Materials", [["Adhesive available?", "no"], ["Grout available?", "no"], ["Tiles and other required materials available?", "no"], ["Water available?", "no"]]],
    ["Site readiness", [["Safe, suitable access?", "no"], ["Work areas available and clear?", "no"], ["Any other trades obstructing progress?", "yes"], ["Any outstanding issues with the site manager?", "yes"]]]];
  P.screens.morning = (r, ctx) => {
    const a = ctx.actions.find((x) => x.rule === "R01");
    const cid = a ? a.job.id : [...visible(ctx)][0];
    const done = P.S.supervisor_inspections.find((m) => m.contract_id === cid && m.created_at.slice(0, 10) === P.S.today);
    const job = P.L().job(cid);
    if (done) return `${P.back("#/today", "Today")}<h1 class="title">Morning checks</h1><section class="banner ok"><strong>Saved at ${esc(done.created_at.slice(11, 16))}</strong><span>${done.issues_count ? `${done.issues_count} problem${done.issues_count === 1 ? "" : "s"} went to the office.` : "No problems reported."}</span></section><a class="btn" href="#/today">Back to today</a>`;
    let n = 0;
    const groups = MORNING.map(([g, qs]) => `<section class="card"><h2 class="section" style="margin:0">${esc(g)}</h2>${qs.map(([q, bad]) => { const i = n++; return `<div class="q"><strong>${esc(q)}</strong>${P.choice("q" + i, [["yes", "Yes"], ["no", "No"], ["na", "Not needed"]])}<span class="sr">issue answer ${bad}</span></div>`; }).join("")}</section>`).join("");
    return `${P.back("#/today", "Today")}<header class="gap-s"><p class="eyebrow">${esc(job.name)}</p><h1 class="title">Morning checks</h1><p class="sub">Eleven quick questions. Problems go straight to the office. ${P.hint("exists")}</p></header>
      <div data-form style="display:grid;gap:16px" data-job="${cid}">${groups}<button class="btn" data-act="save-morning" data-job="${cid}">Save morning checks</button></div>`;
  };
  P.acts["save-morning"] = (el) => {
    const f = P.form(el), flat = MORNING.flatMap(([, qs]) => qs);
    const left = flat.filter((_, i) => !f["q" + i]).length;
    if (!P.need(!left, `Answer every question. ${left} left.`)) return;
    const issues = flat.filter(([, bad], i) => f["q" + i] === bad).length, cid = el.dataset.job;
    P.save(`Morning checks${issues ? `, ${issues} sent to the office` : ""}`, () => P.S.supervisor_inspections.push({ id: P.uid("mc"), contract_id: cid, actor_id: P.viewer().user_id, created_at: P.nowIso(), issues_count: issues }), el, () => nav("#/today"));
  };

  // ---------------------------------------------------------------- people
  P.screens.people = (r, ctx) => {
    const vis = visible(ctx), L = P.L(), S = P.S;
    const plans = S.planned_allocations.filter((p) => vis.has(p.contract_id) && L.covers(p, S.today));
    const stale = S.actual_allocations.filter((a) => !a.ended_at && !a.voided_at && a.work_date < S.today && vis.has(a.contract_id));
    const staleHtml = stale.length ? `<section class="gap-s"><h2 class="section">Finish yesterday first</h2><div class="card flat list">${stale.map((a) => P.row({ act: "stale", data: { id: a.id }, icon: "clock", tone: "amber", title: esc(teamName(a.team_id) + " has no finish time"), sub: esc(P.fd(a.work_date) + " · " + L.path(a.work_area_id)), chips: P.chip("pending", "Needs a finish time", "clock") })).join("")}</div></section>` : "";
    const cards = plans.map((p) => {
      const act = S.actual_allocations.find((a) => a.planned_allocation_id === p.id && a.work_date === S.today && !a.voided_at);
      const abs = S.allocation_absences.find((a) => a.planned_allocation_id === p.id && a.work_date === S.today);
      const names = S.team_memberships.filter((m) => m.team_id === p.team_id).map((m) => S.operatives.find((o) => o.id === m.operative_id).display_name);
      const state = act ? (act.ended_at ? P.chip("done", "Finished for the day", "check") : P.chip("saved", "On site since " + act.started_at.slice(11, 16), "check")) : abs ? P.chip("blocked", "Not on site: " + abs.reason, "x") : P.chip("pending", "Not confirmed yet", "clock");
      const buttons = act ? (act.ended_at ? "" : `<button class="btn secondary" data-act="finish-person" data-id="${act.id}">Finished for the day</button>`) : abs ? `<button class="btn secondary" data-act="here" data-id="${p.id}">They have arrived</button>` : `<div class="btn-row inline"><button class="btn" data-act="here" data-id="${p.id}">${P.ic("check")}Here</button><button class="btn secondary" data-act="not-here" data-id="${p.id}">Not here</button></div>`;
      return `<section class="card" data-hint><div class="chips">${state}${P.hint("exists", "actual_allocations")}</div><h2 class="section" style="margin:0">${esc(teamName(p.team_id))}</h2><p class="muted">${esc(L.path(p.work_area_id))} · ${esc(R.STAGE[p.stage])}</p><p class="small muted">${esc(names.join(", "))}</p>${buttons}</section>`;
    }).join("");
    return `<header class="gap-s"><p class="eyebrow">${esc(P.fd(S.today))}</p><h1 class="title">Who is on site</h1><p class="sub">The office planned these gangs for today. Tap what really happened.</p></header>${staleHtml}${cards || P.empty("Nobody planned today", "The office has not planned a gang for today.", "users")}<button class="btn quiet" data-act="add-person">Someone turned up who is not on the plan</button>`;
  };
  P.acts.here = (el) => { const p = find(P.S.planned_allocations, el.dataset.id); P.save(`${teamName(p.team_id)} confirmed on site`, () => { P.S.allocation_absences = P.S.allocation_absences.filter((a) => a.planned_allocation_id !== p.id); P.S.actual_allocations.push({ id: P.uid("aa"), contract_id: p.contract_id, planned_allocation_id: p.id, work_area_id: p.work_area_id, team_id: p.team_id, stage: p.stage, work_date: P.S.today, started_at: P.nowIso(), ended_at: null, voided_at: null }); }, el); };
  P.acts["finish-person"] = (el) => { const a = find(P.S.actual_allocations, el.dataset.id); P.save(`${teamName(a.team_id)} finished for the day`, () => { a.ended_at = P.nowIso(); }, el); };
  P.acts["not-here"] = (el) => P.sheet(P.sheetFrame("Why are they not here?", `<div class="field"><label for="why">Reason</label><select id="why" name="reason"><option>Off sick</option><option>Held up elsewhere</option><option>Weather</option><option>Not needed today</option></select></div><button class="btn" data-act="save-absent" data-id="${el.dataset.id}">Save</button>`));
  P.acts["save-absent"] = (el) => { const f = P.form(el), p = find(P.S.planned_allocations, el.dataset.id); P.save(`${teamName(p.team_id)} marked not on site`, () => P.S.allocation_absences.push({ id: P.uid("ab"), planned_allocation_id: p.id, work_date: P.S.today, reason: f.reason }), el); };
  P.acts.stale = (el) => P.sheet(P.sheetFrame("When did they finish?", `<div class="field"><label for="t">Finish time</label><input id="t" type="time" name="time" value="16:30"></div><button class="btn" data-act="save-stale" data-id="${el.dataset.id}">Save finish time</button>`));
  P.acts["save-stale"] = (el) => { const f = P.form(el), a = find(P.S.actual_allocations, el.dataset.id); if (!P.need(f.time, "Add a finish time.")) return; P.save("Earlier work finished", () => { a.ended_at = a.work_date + "T" + f.time + ":00Z"; }, el); };
  P.acts["add-person"] = () => P.sheet(P.sheetFrame("Add someone", `<div class="field"><label for="n">Full name</label><input id="n" type="text" name="name" autocomplete="off"></div><div class="field"><label for="c">Company</label><select id="c" name="company">${P.S.companies.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select><small>The office will confirm who they are.</small></div><button class="btn" data-act="save-person">Add to today</button>`));
  P.acts["save-person"] = (el) => { const f = P.form(el); if (!P.need(f.name, "Add their name.")) return; P.save(`${f.name} added, waiting for the office to confirm`, () => P.S.operatives.push({ id: P.uid("o"), display_name: f.name, engagement: "subcontractor", company_id: f.company, user_id: null, status: "provisional" }), el); };

  // ---------------------------------------------------------------- inspections
  const STAGE_CHECKS = {
    installation: ["Floor is flat and sound under the tile", "Tile fully bedded, no hollow sounds", "Lippage within tolerance", "Joints straight and even", "Falls to drain are correct"],
    waterproofing: ["Membrane is continuous with no gaps", "Upstands reach the height on the drawing", "Corners and pipes are sealed", "Cure time observed"],
    preparation: ["Surface clean, dry and sound", "Moisture reading recorded", "Primer applied"],
  };
  P.screens.inspect = (r, ctx) => {
    const S = P.S, L = P.L(), vis = visible(ctx);
    if (!r.id) {
      const needed = ctx.actions.filter((a) => a.process === "inspection" && (a.state === "ready" || a.state === "waiting"));
      const plans = S.planned_allocations.filter((p) => vis.has(p.contract_id) && p.planned_end >= S.today && p.planned_start <= R.addDays(S.today, 7));
      const done = S.location_inspections.filter((i) => vis.has(i.contract_id)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return `<header class="gap-s"><h1 class="title">Inspect</h1><p class="sub">Check work against the specification. Only you can pass an inspection.</p></header>
        ${needed.length ? `<section class="gap-s"><h2 class="section">Needed now</h2><div class="card flat list">${needed.map(P.actionRow).join("")}</div></section>` : ""}
        <section class="gap-s"><h2 class="section">Start another</h2><div class="card flat list">${plans.map((p) => P.row({ href: `#/inspect/${p.work_area_id}?stage=${p.stage}`, icon: "clipboard", title: esc(L.path(p.work_area_id)), sub: esc(R.STAGE[p.stage]) })).join("") || `<p class="muted" style="padding:16px">Nothing is planned in the next 7 days.</p>`}</div></section>
        ${done.length ? `<section class="gap-s"><h2 class="section">Saved</h2><div class="card flat list">${done.map((i) => `<div class="row" role="group"><span class="lead ${i.blocking_failure ? "stop" : ""}">${P.ic(i.blocking_failure ? "alert" : "check")}</span><span class="text"><strong>${esc(L.path(i.work_area_id))}</strong><span>${esc(R.STAGE[i.stage])} · ${esc(P.fd(i.created_at.slice(0, 10)))}</span></span>${i.blocking_failure ? P.chip("blocked", "Failed", "x") : P.chip("saved", "Passed", "check")}</div>`).join("")}</div></section>` : ""}`;
    }
    const area = L.areas.get(r.id);
    if (!area || !vis.has(area.contract_id)) return `${P.back("#/inspect")}${P.empty("Not available", "This location is not on a job you look after.", "lock")}`;
    const stage = r.q.stage || (S.planned_allocations.find((p) => p.work_area_id === area.id) || {}).stage || "installation";
    const items = STAGE_CHECKS[stage] || STAGE_CHECKS.installation;
    const a = ctx.actions.find((x) => x.route && x.route.screen === "inspect" && x.route.id === area.id);
    return `${P.back("#/inspect", "Inspect")}<header class="gap-s"><p class="eyebrow">${esc(L.job(area.contract_id).name)}</p><h1 class="title">${esc(area.name)}</h1><p class="sub">${esc(L.path(area.id))} · ${esc(R.STAGE[stage])}</p></header>${P.needBox(a)}
      <div data-form style="display:grid;gap:16px"><section class="card" data-hint><h2 class="section" style="margin:0">Checks ${P.hint("exists", "Checklist from the office")}</h2>${items.map((q, i) => `<div class="q"><strong>${esc(q)}</strong>${P.choice("c" + i, [["pass", "Pass"], ["fail", "Fail", true], ["na", "Not needed"]])}</div>`).join("")}</section>
      <section class="card"><div class="field"><label for="n">Note ${"" }<small>Needed if anything fails</small></label><textarea id="n" name="note"></textarea></div>${P.photo("photo", "Add a photo of the work")}</section>
      <button class="btn" data-act="save-inspection" data-area="${area.id}" data-stage="${stage}" data-qa="${esc(r.q.qa || "")}">Save inspection</button>
      <p class="small muted">Saving a pass does not release a stop or approve payment. Those are separate decisions by other people.</p></div>`;
  };
  P.acts["save-inspection"] = (el) => {
    const f = P.form(el), area = P.L().areas.get(el.dataset.area), stage = el.dataset.stage;
    const n = Object.keys(f).filter((k) => /^c\d+$/.test(k)).length;
    const answers = Array.from({ length: n }, (_, i) => f["c" + i]);
    if (!P.need(answers.every(Boolean), `Answer every check. ${answers.filter((x) => !x).length} left.`)) return;
    const fails = answers.filter((x) => x === "fail").length;
    if (!P.need(!fails || f.note, "Say what failed in the note.")) return;
    P.save(fails ? "Inspection saved: failed, release stays held" : "Inspection saved: passed", () => {
      P.S.location_inspections.push({ id: P.uid("li"), contract_id: area.contract_id, work_area_id: area.id, stage, blocking_failure: fails > 0, created_at: P.nowIso(), inspector_id: P.viewer().user_id });
      if (el.dataset.qa) P.S.supervisor_qa_submissions.push({ id: P.uid("qa"), item_id: el.dataset.qa, created_at: P.nowIso() });
    }, el, () => nav("#/today"));
  };

  // ---------------------------------------------------------------- issues, snags, holds
  P.screens.issues = (r, ctx) => {
    const S = P.S, L = P.L(), vis = visible(ctx);
    const holds = S.work_holds.filter((h) => vis.has(h.contract_id) && h.status !== "released");
    const snags = S.supervisor_issues.filter((i) => vis.has(i.contract_id) && i.snag_status !== "closed");
    return `<header class="gap-s"><h1 class="title">Issues</h1><p class="sub">Snags and stopped work on your jobs.</p></header>
      <section class="gap-s"><h2 class="section">Stopped work</h2><div class="card flat list">${holds.map((h) => P.row({ href: "#/hold/" + h.id, icon: "stop", tone: "stop", title: esc(L.path(h.work_area_id)), sub: esc(h.reason), chips: P.chip(h.status === "active" ? "blocked" : "pending", HOLD_TEXT[h.status], "lock") })).join("") || `<p class="muted" style="padding:16px">No work is stopped.</p>`}</div></section>
      <section class="gap-s"><h2 class="section">Snags</h2><div class="card flat list">${snags.map((i) => P.row({ href: "#/snag/" + i.id, icon: "wrench", tone: i.severity === "critical" ? "stop" : "amber", title: esc(i.check_label), sub: esc(L.path(i.work_area_id)), chips: P.chip(i.severity === "critical" ? "blocked" : "pending", (i.severity === "critical" ? "Critical · " : "") + SNAG_TEXT[i.snag_status]) })).join("") || `<p class="muted" style="padding:16px">No open snags.</p>`}</div></section>
      <button class="btn secondary" data-act="report">${P.ic("alert")}Report an issue</button>`;
  };

  const kv = (rows) => `<dl class="kv">${rows.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

  P.screens.snag = (r, ctx) => {
    const S = P.S, L = P.L(), i = find(S.supervisor_issues, r.id);
    const vis = visible(ctx);
    if (!i || (ctx.role !== "subcontractor" && !vis.has(i.contract_id))) return `${P.back("#/today")}${P.empty("Not available", "You cannot see this snag.", "lock")}`;
    const back = ctx.role === "supervisor" ? P.back("#/issues", "Issues") : P.back("#/today", "Today");
    const review = ctx.actions.find((a) => a.id === "snag-reinspect:" + i.id);
    const crit = ctx.actions.find((a) => a.id === "snag-critical:" + i.id);
    const assign = ctx.actions.find((a) => a.id === "snag-assign:" + i.id);
    let panel = "";
    if (i.snag_status === "open" && !i.assigned_team_id) {
      if (crit || assign) panel = `<section class="card" data-form data-hint><h2 class="section" style="margin:0">Who will fix it? ${P.hint("exists")}</h2><div class="field"><label for="g">Gang</label><select id="g" name="team">${teamOptions()}</select></div><div class="field"><label for="d">Target date</label><input id="d" type="date" name="date" value="${R.addDays(S.today, 2)}"></div><button class="btn" data-act="assign-snag" data-id="${i.id}">Save</button>${i.severity === "critical" ? `<p class="small muted">A critical defect does not stop work by itself.</p><button class="btn quiet" data-act="report" data-area="${i.work_area_id}">Does work here need to stop? Report an issue</button>` : ""}</section>`;
      else panel = `<section class="banner"><strong>Waiting for the office</strong><span>A critical defect is reviewed by the office, who choose the gang.</span></section>`;
    } else if (i.snag_status === "assigned") {
      panel = `<section class="banner"><strong>Waiting for ${esc(teamName(i.assigned_team_id))}</strong><span>${i.target_date ? "Due " + esc(P.fd(i.target_date)) : "No date set"}. They will send a photo when it is fixed.</span></section>`;
    } else if (["rectification_submitted", "reinspection"].includes(i.snag_status)) {
      if (review && review.state === "ready") panel = `<section class="card" data-form data-hint><h2 class="section" style="margin:0">Check the repair ${P.hint("exists", "Independent re-inspection")}</h2><p>Look at it in person.</p>${P.photo("photo", "Add a photo of the result")}<div class="field"><label for="n">Note</label><textarea id="n" name="note"></textarea></div><div class="btn-row inline"><button class="btn" data-act="reinspect" data-id="${i.id}" data-v="accept">Repair is good</button><button class="btn secondary" data-act="reinspect" data-id="${i.id}" data-v="reject">Send back</button></div></section>`;
      else if (review && review.state === "blocked") panel = `<section class="banner stop"><strong>Someone else has to check this</strong><span>${esc(review.blockedBy)}</span></section>`;
      else panel = `<section class="banner"><strong>Waiting for ${i.severity === "critical" || i.escalated ? "the office" : "the supervisor"} to check the repair</strong><span>Critical repairs are checked by the office.</span></section>`;
    } else panel = `<section class="banner ok"><strong>Closed</strong></section>`;
    return `${back}<header class="gap-s"><div class="chips">${P.chip(i.severity === "critical" ? "blocked" : "pending", i.severity === "critical" ? "Critical" : i.severity === "major" ? "Major" : "Minor", "alert")}${P.chip("done", SNAG_TEXT[i.snag_status])}</div><h1 class="title">${esc(i.check_label)}</h1><p class="sub">${esc(L.path(i.work_area_id))}</p></header>
      <section class="card">${kv([["What is wrong", esc(i.description)], ["Job", esc(L.job(i.contract_id).name)], ["Fixing it", esc(teamName(i.assigned_team_id))], ["Target date", i.target_date ? esc(P.fd(i.target_date)) : "Not set"]])}</section>${panel}`;
  };
  P.acts["assign-snag"] = (el) => { const f = P.form(el), i = find(P.S.supervisor_issues, el.dataset.id); P.save(`${teamName(f.team)} asked to fix the snag`, () => { i.assigned_team_id = f.team; i.target_date = f.date; i.snag_status = "assigned"; }, el); };
  P.acts.reinspect = (el) => {
    const f = P.form(el), i = find(P.S.supervisor_issues, el.dataset.id), ok = el.dataset.v === "accept";
    if (!P.need(f.note, "Add a note.") || !P.need(!ok || f.photo, "Add a photo of the repair.")) return;
    P.save(ok ? "Repair accepted, snag closed" : "Repair sent back", () => { i.snag_status = ok ? "closed" : "assigned"; if (!ok) i.rectified_by = null; }, el);
  };

  P.screens.hold = (r, ctx) => {
    const S = P.S, L = P.L(), h = find(S.work_holds, r.id);
    if (!h || !visible(ctx).has(h.contract_id)) return `${P.back("#/today")}${P.empty("Not available", "You cannot see this stop.", "lock")}`;
    const safety = h.hold_type === "safety";
    const back = ctx.role === "supervisor" ? P.back("#/issues", "Issues") : P.back("#/today", "Today");
    let panel = "";
    if (h.status === "active" && !h.assigned_team_id) panel = `<section class="card" data-form data-hint><h2 class="section" style="margin:0">Who fixes it? ${P.hint("exists")}</h2><div class="field"><label for="g">Gang</label><select id="g" name="team">${teamOptions()}</select></div><div class="field"><label for="a">What must they do?</label><textarea id="a" name="action">${esc(h.required_action || "")}</textarea></div><div class="field"><label for="d">Target date</label><input id="d" type="date" name="date" value="${R.addDays(S.today, 2)}"></div><button class="btn" data-act="assign-hold" data-id="${h.id}">Save</button></section>`;
    else if (h.status === "active") panel = `<section class="banner"><strong>Waiting for ${esc(teamName(h.assigned_team_id))} to fix it</strong><span>Due ${esc(P.fd(h.target_date))}. Work here stays stopped.</span></section>`;
    else if (h.status === "correction_submitted") panel = `<section class="banner"><strong>The gang has sent their fix</strong><span>They now ask the office to check it.</span></section>`;
    else if (h.status === "awaiting_release") panel = ["owner", "office"].includes(ctx.role) ? `<a class="btn" href="#/decision/${h.id}">Review and decide</a>` : `<section class="banner"><strong>Waiting for the office to check the fix</strong><span>Only the office can restart work here. Someone other than the person who raised it must decide.</span></section>`;
    else panel = `<section class="banner ok"><strong>Work restarted here</strong></section>`;
    return `${back}<header class="gap-s"><div class="chips">${P.chip(safety ? "blocked" : "pending", safety ? "Safety stop" : "Quality hold", "stop")}${P.chip("done", HOLD_TEXT[h.status])}</div><h1 class="title">Work stopped</h1><p class="sub">${esc(L.path(h.work_area_id))}</p></header>
      <section class="card">${kv([["Why", esc(h.reason)], ["What must happen", esc(h.required_action || "Not set yet")], ["Raised by", esc(L.person(h.raised_by))], ["Fixing it", esc(teamName(h.assigned_team_id))]])}<p class="small muted">Only this location is stopped. Other work carries on.</p></section>${panel}`;
  };
  P.acts["assign-hold"] = (el) => { const f = P.form(el), h = find(P.S.work_holds, el.dataset.id); if (!P.need(f.action, "Say what they must do.")) return; P.save(`${teamName(f.team)} asked to fix the stop`, () => { h.assigned_team_id = f.team; h.required_action = f.action; h.target_date = f.date; }, el); };

  P.screens.decision = (r, ctx) => {
    const S = P.S, L = P.L(), h = find(S.work_holds, r.id);
    if (!h || !visible(ctx).has(h.contract_id)) return `${P.back("#/today")}${P.empty("Not available", "You cannot see this stop.", "lock")}`;
    const a = ctx.actions.find((x) => x.id === "hold-release:" + h.id);
    const insp = S.location_inspections.filter((i) => i.contract_id === h.contract_id && L.under(i.work_area_id, h.work_area_id));
    const safety = h.hold_type === "safety";
    const head = `${P.back("#/today", "Today")}<header class="gap-s"><div class="chips">${P.chip(safety ? "blocked" : "pending", safety ? "Safety stop" : "Quality hold", "stop")}</div><h1 class="title">Check the fix</h1><p class="sub">${esc(L.path(h.work_area_id))}</p></header>${a && a.state === "blocked" ? `<section class="banner stop"><strong>You cannot decide this one</strong><span>${esc(a.blockedBy)}</span></section>` : ""}${P.needBox(a)}
      <section class="card">${kv([["Why it was stopped", esc(h.reason)], ["What the gang had to do", esc(h.required_action)], ["Raised by", esc(L.person(h.raised_by))], ["Gang", esc(teamName(h.assigned_team_id))], ["Inspections here", insp.length ? insp.map((i) => `${esc(R.STAGE[i.stage])}: ${i.blocking_failure ? "failed" : "passed"}`).join(", ") : "None saved"]])}</section>`;
    if (!a || a.state === "waiting") return `${head}<section class="banner"><strong>This decision is for the office</strong><span>${h.status === "awaiting_release" ? "They are checking the fix." : "It is not ready to be checked yet."}</span></section>`;
    if (a.state === "blocked") return head;
    return `${head}<div data-form style="display:grid;gap:16px"><section class="card" data-hint><h2 class="section" style="margin:0">Your decision ${P.hint("exists", "Release review")}</h2>
      <label class="check"><input type="checkbox" name="photos"> I looked at the gang's photos</label><label class="check"><input type="checkbox" name="insp"> I checked the inspection results</label>
      ${safety ? `<div class="field"><label for="pc">Principal contractor's name and reference</label><input id="pc" type="text" name="pc"></div>` : ""}
      <div class="field"><label for="why">Reason for your decision</label><textarea id="why" name="why"></textarea></div>
      <div class="btn-row inline"><button class="btn" data-act="decide" data-id="${h.id}" data-v="release">Restart work here</button><button class="btn secondary" data-act="decide" data-id="${h.id}" data-v="back">Send back</button></div>
      <p class="small muted">TileSpec never makes this decision for you. Only this location restarts.</p></section></div>`;
  };
  P.acts.decide = (el) => {
    const f = P.form(el), h = find(P.S.work_holds, el.dataset.id), rel = el.dataset.v === "release";
    if (!P.need(f.why, "Write your reason.")) return;
    if (rel && !P.need(f.photos && f.insp, "Tick that you looked at the photos and the inspection results.")) return;
    if (rel && h.hold_type === "safety" && !P.need(f.pc, "A safety stop needs the principal contractor's name and reference.")) return;
    P.save(rel ? "Work restarted for this location" : "Fix sent back to the gang", () => { h.status = rel ? "released" : "active"; if (!rel) h.required_action = f.why; }, el, () => nav("#/today"));
  };

  // ---------------------------------------------------------------- report an issue
  // One everyday action. It records a snag, or the EXISTING quality hold or safety stop, with the
  // same permissions and audit trail as before. There is no new kind of record.
  P.acts.report = (el) => {
    const ids = visible(P.cur);
    P.sheet(P.sheetFrame("Report an issue", `<div class="field"><label for="a">Where?</label><select id="a" name="area">${areaOptions(ids)}</select></div>
      <div class="field"><label for="w">What is wrong?</label><textarea id="w" name="what"></textarea></div>${P.photo("photo", "Add a photo")}
      <div class="field"><span class="lbl">Does work need to stop here?</span>${P.choice("stop", [["no", "No"], ["quality", "Yes: quality hold"], ["safety", "Yes: safety stop", true]], "no")}</div>
      <div class="field" data-when-no><span class="lbl">How serious?</span>${P.choice("sev", [["minor", "Minor"], ["major", "Major"], ["critical", "Critical", true]], "major")}<small>A critical defect goes to the office. It does not stop work by itself.</small></div>
      <p class="small muted" data-when-stop hidden>Only this location and activity stop. Everything else carries on. They stay stopped until the fix is checked and the office restarts them.</p>
      <p class="small muted" data-when-safety hidden><strong>Make the area safe first</strong> and follow the principal contractor's procedure. This records the stop and tells the office.</p>
      <button class="btn" data-act="save-report">Report it</button>`));
    if (el && el.dataset && el.dataset.area) { const s = document.querySelector('.sheet [name="area"]'); if (s) s.value = el.dataset.area; }
  };
  P.acts["save-report"] = (el) => {
    const f = P.form(el), area = P.L().areas.get(f.area), id = P.uid("r"), stops = f.stop && f.stop !== "no";
    if (!P.need(f.what, "Say what is wrong.")) return;
    if (stops) {
      P.save(`${f.stop === "safety" ? "Safety stop" : "Quality hold"} raised`, () => P.S.work_holds.push({ id, contract_id: area.contract_id, work_area_id: area.id, stage: "installation", hold_type: f.stop, status: "active", reason: f.what, required_action: "", raised_by: P.viewer().user_id, corrected_by: null, assigned_team_id: null, assigned_operative_id: null, target_date: null, critical_snags_open: false }), el, () => nav("#/hold/" + id));
    } else {
      P.save("Snag recorded", () => P.S.supervisor_issues.push({ id, contract_id: area.contract_id, work_area_id: area.id, stage: "installation", check_label: f.what.slice(0, 60), description: f.what, severity: f.sev || "major", snag_status: "open", assigned_team_id: null, target_date: null, raised_by: P.viewer().user_id, rectified_by: null, escalated: false, responsibility_state: "not_assessed", responsibility_team_id: null }), el, () => nav("#/snag/" + id));
    }
  };

  // ---------------------------------------------------------------- messages and handover
  P.screens.messages = (r, ctx) => {
    const S = P.S, items = S.supervisor_office_items.filter((m) => m.recipient_id === ctx.v.user_id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return `${P.back("#/today", "Today")}<header class="gap-s"><h1 class="title">From the office</h1><p class="sub">Instructions and requests. ${P.hint("exists")}</p></header>${items.map((m) => {
      const ack = S.supervisor_office_acknowledgements.some((a) => a.item_id === m.id), sub = S.supervisor_qa_submissions.some((q) => q.item_id === m.id);
      const action = m.kind === "qa_request" ? (sub ? P.chip("saved", "Result sent", "check") : `<a class="btn secondary" href="#/inspect/${m.work_area_id}?stage=${m.stage}&qa=${m.id}">Start inspection</a>`) : (ack ? P.chip("saved", "You read this", "check") : `<button class="btn" data-act="ack" data-id="${m.id}">Got it</button>`);
      return `<section class="card"><p class="eyebrow">${esc(P.L().person(m.created_by))} · ${esc(P.fd(m.created_at.slice(0, 10)))}</p><h2 class="section" style="margin:0">${esc(m.title)}</h2><p>${esc(m.body)}</p>${action}</section>`;
    }).join("") || P.empty("No messages", "Nothing from the office.", "mail")}`;
  };
  P.acts.ack = (el) => P.save("Instruction read", () => P.S.supervisor_office_acknowledgements.push({ id: P.uid("ak"), item_id: el.dataset.id, user_id: P.viewer().user_id }), el);

  P.screens.handover = (r, ctx) => {
    const S = P.S, L = P.L(), cid = [...visible(ctx)][0], job = L.job(cid);
    const done = S.site_handovers.find((h) => h.contract_id === cid && h.work_date === S.today);
    const on = S.actual_allocations.filter((a) => a.contract_id === cid && a.work_date === S.today && !a.voided_at);
    const insp = S.location_inspections.filter((i) => i.contract_id === cid && i.created_at.slice(0, 10) === S.today);
    const openSnags = S.supervisor_issues.filter((i) => i.contract_id === cid && i.snag_status !== "closed").length;
    const holds = S.work_holds.filter((h) => h.contract_id === cid && h.status !== "released").length;
    const summary = `<section class="card" data-hint><h2 class="section" style="margin:0">Filled in for you ${P.hint("query", "Summary of today's saved records")}</h2>${kv([["Gangs on site", on.length ? esc(on.map((a) => teamName(a.team_id)).join(", ")) : "None confirmed"], ["Inspections saved", String(insp.length)], ["Open snags", String(openSnags)], ["Work stopped", holds ? `${holds} location${holds === 1 ? "" : "s"}` : "None"]])}</section>`;
    if (done) return `${P.back("#/today", "Today")}<h1 class="title">Handover</h1><section class="banner ok"><strong>Sent at ${esc(done.created_at.slice(11, 16))}</strong><span>The office can read it.</span></section>${summary}`;
    return `${P.back("#/today", "Today")}<header class="gap-s"><p class="eyebrow">${esc(job.name)}</p><h1 class="title">Handover</h1><p class="sub">Tell the office what is finished, what is stuck and what you need tomorrow. ${P.hint("exists")}</p></header>${summary}
      <div data-form style="display:grid;gap:16px"><section class="card"><div class="field"><label for="s">What is stuck?</label><textarea id="s" name="stuck"></textarea></div><div class="field"><label for="t">What do you need tomorrow?</label><textarea id="t" name="need"></textarea></div></section><button class="btn" data-act="send-handover" data-job="${cid}">Send handover</button></div>`;
  };
  P.acts["send-handover"] = (el) => { const f = P.form(el), cid = el.dataset.job; P.save("Handover sent", () => P.S.site_handovers.push({ id: P.uid("ho"), contract_id: cid, work_date: P.S.today, created_at: P.nowIso(), stuck: f.stuck, need: f.need }), el, () => nav("#/today")); };

  P.acts.who = () => P.sheet(P.sheetFrame(P.viewer().display_name, `<p class="muted">${esc({ owner: "Owner", office: "Office", supervisor: "Site supervisor", subcontractor: "Subcontractor" }[P.role()])}${P.role() === "office" ? (P.viewer().financial_access ? " · can see money" : " · money hidden") : ""}</p><button class="btn secondary" data-act="signout">Sign out</button>`));
  P.acts.signout = () => { P.ui.person = ""; P.ui.sheet = null; document.getElementById("person").value = ""; P.render(); };
})();
