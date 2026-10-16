/* Office, owner and subcontractor screens, plus the small forms the office uses to set work up. */
(function () {
  const P = window.P, R = P.R, esc = P.esc;
  const find = (arr, id) => arr.find((x) => x.id === id);
  const visible = (ctx) => new Set(R.visibleContractIds(P.S, ctx.v, P.L()));
  const nav = (h) => P.nav(h);
  const kv = (rows) => `<dl class="kv">${rows.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  const insuranceState = (co) => {
    const latest = new Map();
    P.S.company_insurances.filter((i) => i.company_id === co.id).forEach((i) => { const c = latest.get(i.insurance_type); if (!c || i.expires_on > c.expires_on) latest.set(i.insurance_type, i); });
    const covers = [...latest.values()];
    if (!covers.length) return P.chip("blocked", "No cover on file", "alert");
    const expired = covers.filter((i) => i.expires_on < P.S.today);
    if (expired.length) return P.chip("blocked", `${expired[0].insurance_type.replaceAll("_", " ")} expired`, "alert");
    const soon = covers.filter((i) => R.dayDiff(i.expires_on, P.S.today) <= R.config.insuranceWarningDays);
    if (soon.length) return P.chip("pending", `${soon[0].insurance_type.replaceAll("_", " ")} runs out ${P.fd(soon[0].expires_on)}`, "clock");
    return P.chip("saved", "Cover is valid", "check");
  };

  // ---------------------------------------------------------------- jobs
  P.screens.jobs = (r, ctx) => {
    const L = P.L(), jobs = [...visible(ctx)].map((id) => L.contracts.get(id));
    return `<header class="gap-s"><h1 class="title">Jobs</h1><p class="sub">Everything about a job lives inside it.</p></header><div class="card flat list">${jobs.map((c) => {
      const mine = ctx.actions.filter((a) => a.job.id === c.id);
      const n = mine.filter((a) => a.state === "ready").length, stop = P.S.work_holds.filter((h) => h.contract_id === c.id && ["active", "correction_submitted", "awaiting_release"].includes(h.status)).length;
      const chips = (n ? P.chip("pending", `${n} for you`, "bell") : "") + (stop ? P.chip("blocked", `${stop} stopped`, "stop") : n ? "" : P.chip("saved", "Nothing needed", "check"));
      return P.row({ href: "#/job/" + c.id, icon: "briefcase", title: esc(c.reference + " · " + c.name), sub: esc(c.client), chips });
    }).join("")}</div>`;
  };

  P.screens.job = (r, ctx) => {
    const S = P.S, L = P.L(), c = L.contracts.get(r.id);
    if (!c || !visible(ctx).has(c.id)) return `${P.back("#/jobs", "Jobs")}${P.empty("Not available", "You are not allocated to this job.", "lock")}`;
    const mine = ctx.actions.filter((a) => a.job.id === c.id);
    const nxt = mine.find((a) => a.state === "ready");
    const rest = mine.filter((a) => a !== nxt);
    const plans = S.planned_allocations.filter((p) => p.contract_id === c.id).sort((a, b) => (a.planned_start < b.planned_start ? -1 : 1));
    const areas = S.work_areas.filter((a) => a.contract_id === c.id);
    const docs = S.document_revisions.filter((d) => d.contract_id === c.id);
    const money = P.canSeeMoney(ctx) ? S.commercials.find((x) => x.contract_id === c.id) : null;
    const sec = (title, body, open) => `<details class="more" ${open ? "open" : ""}><summary>${title}</summary><div style="padding:0 0 16px;display:grid;gap:10px">${body}</div></details>`;
    return `${P.back("#/jobs", "Jobs")}<header class="gap-s"><p class="eyebrow">${esc(c.reference)} · ${esc(c.client)}</p><h1 class="title" style="font-size:clamp(32px,8cqw,46px)">${esc(c.name)}</h1><p class="sub">${esc(c.address)}</p></header>
      ${nxt ? P.hero(nxt) : P.empty("Nothing needs doing on this job", P.S.work_holds.some((h) => h.contract_id === c.id && ["active", "correction_submitted", "awaiting_release"].includes(h.status)) ? "Work is still restricted at this job. Completing set-up does not restart stopped work." : "It is set up. New work appears here when something is saved that needs you.")}
      ${rest.length ? `<section class="gap-s"><h2 class="section">Also on this job</h2><div class="card flat list">${rest.map(P.actionRow).join("")}</div></section>` : ""}
      <section class="card" style="padding-top:6px;padding-bottom:6px">
      ${sec(`Plan: who works where <span class="chip done">${plans.length}</span> ${P.hint("exists")}`, `${plans.map((p) => `<div class="row" role="group" style="border:0;padding:6px 0;min-height:0"><span class="text"><strong>${esc(P.L().teams.get(p.team_id).name)} · ${esc(L.path(p.work_area_id))}</strong><span>${esc(R.STAGE[p.stage])} · ${esc(P.fd(p.planned_start))} to ${esc(P.fd(p.planned_end))}</span></span></div>`).join("") || `<p class="muted">Nothing planned.</p>`}<button class="btn secondary" data-act="plan" data-job="${c.id}">${P.ic("plus")}Plan work</button>`)}
      ${sec(`Locations <span class="chip done">${areas.length}</span> ${P.hint("exists")}`, `${areas.map((a) => `<p style="padding-left:${(a.path_ids.length - 1) * 16}px">${esc(a.name)}</p>`).join("") || `<p class="muted">No locations yet.</p>`}<button class="btn secondary" data-act="add-locations" data-job="${c.id}">${P.ic("plus")}Add locations</button>`)}
      ${sec(`Documents <span class="chip done">${docs.length}</span> ${P.hint("exists")}`, `${docs.map((d) => `<button class="row" data-act="open-doc" style="border:0;min-height:56px"><span class="lead">${P.ic("file")}</span><span class="text"><strong>${esc(d.title)}</strong><span>${esc(d.document_reference)} · revision ${d.revision}</span></span></button>`).join("") || `<p class="muted">No documents.</p>`}<button class="btn secondary" data-act="add-doc" data-job="${c.id}">${P.ic("plus")}Add a document</button>`)}
      ${money ? sec(`Money ${P.hint("query", "Existing budget fields")}`, `${budgetCard(money)}<p class="small muted">Actual costs, variations, payment claims and retention are not recorded yet, so there is nothing to press here. ${P.hint("new", "New backend B4, B6")}</p>`) : ""}
      ${sec(`Recent activity`, S.log.length ? S.log.slice(0, 8).map((l) => `<p class="small"><strong>${esc(l.at)}</strong> ${esc(l.who)}: ${esc(l.text)}</p>`).join("") : `<p class="muted">Nothing saved yet in this session. Every saved change is recorded with who and when. ${P.hint("exists", "audit_events")}</p>`)}</section>`;
  };
  P.acts["open-doc"] = () => P.toast("Opens the private document in a new tab. The app already does this for the office, but the supervisor's list does not yet.");

  const budgetCard = (c) => {
    const b = R.budgetSummary(c), low = b.margin < c.target_margin;
    return `<div class="tile-row" style="grid-template-columns:repeat(2,1fr)"><div class="tile"><strong>${P.money(b.value)}</strong><span>Contract value</span></div><div class="tile"><strong>${P.money(b.cost)}</strong><span>Budgeted cost</span></div><div class="tile"><strong>${P.money(b.profit)}</strong><span>Budgeted profit after ${P.money(b.reserve)} reserve</span></div><div class="tile"><strong style="color:${low ? "var(--stop)" : "var(--ok)"}">${b.margin.toFixed(1)}%</strong><span>Margin. Target ${Number(c.target_margin).toFixed(0)}%</span></div></div>`;
  };

  // ---------------------------------------------------------------- tenders
  // Received enquiries and their documents exist today. A reply or decline cannot be RECORDED yet (B5),
  // so no button pretends it can.
  P.screens.tenders = (r, ctx) => `<header class="gap-s"><h1 class="title">Tenders</h1><p class="sub">Enquiries by reply date. ${P.hint("exists", "List and documents")}</p></header><div class="card flat list">${P.S.tender_enquiries.slice().sort((a, b) => (a.deadline < b.deadline ? -1 : 1)).map((t) => P.row({ href: "#/tender/" + t.id, icon: "inbox", title: esc(t.project), sub: esc(t.company + " · reply by " + P.fd(t.deadline)), chips: P.chip("done", "Received " + P.fd(t.received_at.slice(0, 10))) })).join("")}</div>
    <p class="small muted">TileSpec shows the enquiry and opens its documents. It cannot record that one was priced, replied to or declined, so no button is offered for that. ${P.hint("new", "New backend B5")}</p>`;
  P.screens.tender = (r) => {
    const t = find(P.S.tender_enquiries, r.id);
    if (!t) return `${P.back("#/tenders", "Tenders")}${P.empty("Not found", "That enquiry does not exist.", "inbox")}`;
    return `${P.back("#/tenders", "Tenders")}<header class="gap-s"><div class="chips">${P.chip("done", "Received " + P.fd(t.received_at.slice(0, 10)))}</div><h1 class="title" style="font-size:clamp(30px,8cqw,44px)">${esc(t.project)}</h1><p class="sub">${esc(t.company)}</p></header>
      <section class="card">${kv([["From", esc(t.name + " · " + t.email)], ["Reply needed by", esc(P.fd(t.deadline))], ["Message", esc(t.message)]])}</section>
      <section class="card flat list">${t.attachments.map((a) => `<button class="row" data-act="open-doc"><span class="lead">${P.ic("file")}</span><span class="text"><strong>${esc(a)}</strong></span></button>`).join("")}</section>`;
  };

  // ---------------------------------------------------------------- labour
  P.screens.labour = (r, ctx) => {
    const S = P.S, L = P.L(), vis = visible(ctx);
    const plans = S.planned_allocations.filter((p) => vis.has(p.contract_id) && p.planned_end >= S.today).sort((a, b) => (a.planned_start < b.planned_start ? -1 : 1));
    const prov = S.operatives.filter((o) => o.status === "provisional");
    return `<header class="gap-s"><h1 class="title">Labour</h1><p class="sub">Who is planned where, and whether they are covered. ${P.hint("exists")}</p></header>
      <section class="gap-s"><h2 class="section">Planned</h2><div class="card flat list">${plans.map((p) => P.row({ href: "#/job/" + p.contract_id, icon: "users", title: esc(L.teams.get(p.team_id).name + " · " + L.path(p.work_area_id)), sub: esc(`${P.fd(p.planned_start)} to ${P.fd(p.planned_end)} · ${R.STAGE[p.stage]}`) })).join("") || `<p class="muted" style="padding:16px">Nothing planned.</p>`}</div><button class="btn secondary" data-act="plan">${P.ic("plus")}Plan work</button></section>
      <section class="gap-s"><h2 class="section">Companies and cover</h2><div class="card flat list">${S.companies.map((co) => P.row({ act: "task", data: { id: "insurance:" + co.id, co: co.id }, icon: "shield", tone: "amber", title: esc(co.name), sub: esc(co.contact_name + " · " + co.contact_phone), chips: insuranceState(co) })).join("")}</div></section>
      ${prov.length ? `<section class="gap-s"><h2 class="section">To confirm</h2><div class="card flat list">${prov.map((o) => P.row({ act: "task", data: { id: "provisional:" + o.id }, icon: "users", title: esc(o.display_name), sub: "Added on site", chips: P.chip("pending", "Needs confirming") })).join("")}</div></section>` : ""}`;
  };

  // ---------------------------------------------------------------- money
  P.screens.money = (r, ctx) => {
    if (!P.canSeeMoney(ctx)) return P.empty("Not available", "Money is limited to people given money access.", "lock");
    const L = P.L();
    return `<header class="gap-s"><h1 class="title">Money</h1><p class="sub">Budgets compared with the profit you want. ${P.hint("query", "Existing budget fields")}</p></header>
      ${P.S.commercials.map((c) => `<section class="card" data-hint><h2 class="section" style="margin:0">${esc(L.contracts.get(c.contract_id).reference + " · " + L.contracts.get(c.contract_id).name)}</h2>${budgetCard(c)}</section>`).join("")}
      <section class="banner"><strong>Original budgets only</strong><span>Actual costs, variations, payment claims and any sign-off on a low margin are not recorded in TileSpec yet. There is nothing to press for them. ${P.hint("new", "New backend B3, B4, B6")}</span></section>`;
  };
  // ---------------------------------------------------------------- office set-up forms
  P.acts.task = (el) => {
    const id = el.dataset.id, a = P.actions.find((x) => x.id === id);
    if (!a) return P.toast("That is already done.");
    const S = P.S, L = P.L();
    const plan = (pid) => find(S.planned_allocations, pid);
    let body = "";
    if (a.rule === "G08") {
      const p = plan(a.id.split(":")[1]);
      body = `<p>${esc(a.why)}</p><div class="field"><span class="lbl">Does ${esc(R.STAGE[p.stage])} here need a mandatory inspection?</span>${P.choice("ans", [["required", "Yes"], ["not_applicable", "No"], ["unknown", "Not sure yet"]])}</div><div class="field"><label for="s">Which document says so?</label><input id="s" type="text" name="src"></div><p class="small muted">Choosing "Not sure yet" leaves it open. Unknown never counts as allowed.</p><button class="btn" data-act="save-task" data-id="${esc(id)}">Save</button>`;
    } else if (a.rule === "R09") {
      const p = plan(a.id.split(":")[1]);
      body = `<div class="field"><label for="t">Checklist name</label><input id="t" type="text" name="title" value="${esc(R.STAGE[p.stage] + " checks")}"></div><div class="field"><label for="c">Checks (one per line)</label><textarea id="c" name="checks">Floor flat and sound\nTile fully bedded\nJoints straight and even</textarea></div><button class="btn" data-act="save-task" data-id="${esc(id)}">Publish checks</button>`;
    } else if (a.rule === "R10") {
      body = `<p>${esc(a.why)}</p><button class="btn" data-act="save-task" data-id="${esc(id)}">Give access</button>`;
    } else if (a.rule === "A02" || a.rule === "R11") {
      body = `<p>${esc(a.why)}</p><div class="field"><label for="d">New cover runs until</label><input id="d" type="date" name="until" value="${R.addDays(S.today, 365)}"></div><div class="field"><label for="n">Certificate reference</label><input id="n" type="text" name="ref"></div><button class="btn" data-act="save-task" data-id="${esc(id)}">Save certificate</button>`;
    } else if (a.rule === "R04") {
      body = `<p>${esc(a.why)}</p><button class="btn" data-act="save-task" data-id="${esc(id)}">Confirm this person</button>`;
    } else if (a.rule === "R08") {
      const key = a.id.split(":")[2], c = L.contracts.get(a.job.id);
      if (key === "locations") body = `<div class="field"><label for="l">Locations (one per line)</label><textarea id="l" name="names">Sales floor\nCustomer toilets</textarea></div>`;
      else if (key === "supervisor") body = `<div class="field"><label for="u">Supervisor</label><select id="u" name="user">${S.members.filter((m) => m.role === "supervisor").map((m) => `<option value="${m.user_id}">${esc(m.display_name)}</option>`).join("")}</select></div>`;
      else if (key === "spec") body = `<div class="field"><label for="s">Tile specification</label><input id="s" type="text" name="spec" value="${esc(c.tile_specification)}"></div><div class="field"><label for="d">Document title</label><input id="d" type="text" name="doc" value="Tile and adhesive specification"></div>`;
      else body = planForm(c.id);
      body += `<button class="btn" data-act="save-task" data-id="${esc(id)}">Save</button>`;
    }
    P.sheet(P.sheetFrame(a.title, body));
  };
  P.acts["save-task"] = (el) => {
    const id = el.dataset.id, a = P.actions.find((x) => x.id === id), f = P.form(el), S = P.S, L = P.L();
    if (!a) return;
    let fn;
    if (a.rule === "G08") {
      const p = find(S.planned_allocations, a.id.split(":")[1]);
      if (!P.need(f.ans, "Choose an answer.")) return;
      if (f.ans === "unknown") return P.closeSheet();
      if (!P.need(f.src, "Say which document decides this.")) return;
      const template = S.location_inspection_templates.find(t => t.contract_id === p.contract_id && t.stage === p.stage && L.under(p.work_area_id, t.work_area_id));
      if (!P.need(f.ans !== "required" || template, "Publish the relevant checklist before approving a mandatory inspection.")) return;
      fn = () => S.location_inspection_requirements.push({ id: P.uid("rq"), contract_id: p.contract_id, work_area_id: p.work_area_id, work_package_id: p.work_package_id,
        stage: p.stage, applicability: f.ans === "required" ? "required" : "not_required", template_id: f.ans === "required" ? template.id : null, created_at: P.nowIso() });
    } else if (a.rule === "R09") {
      const p = find(S.planned_allocations, a.id.split(":")[1]);
      if (!P.need(f.title && f.checks, "Add a name and at least one check.")) return;
      fn = () => S.location_inspection_templates.push({ id: P.uid("tp"), contract_id: p.contract_id, work_area_id: p.work_area_id, stage: p.stage, title: f.title });
    } else if (a.rule === "R10") {
      const [, pid, uid] = a.id.split(":"), p = find(S.planned_allocations, pid);
      fn = () => S.package_assignments.push({ contract_id: p.contract_id, work_package_id: p.work_package_id, user_id: uid });
    } else if (a.rule === "A02") {
      if (!P.need(f.until > S.today, "The new cover must end after today.")) return;
      const co = id.split(":")[1];
      const types = [...new Set(S.company_insurances.filter((i) => i.company_id === co && i.expires_on < S.today).map((i) => i.insurance_type))];
      fn = () => types.forEach((t) => S.company_insurances.push({ id: P.uid("i"), company_id: co, insurance_type: t, expires_on: f.until, policy_number: f.ref }));
    } else if (a.rule === "R11") {
      const ins = find(S.company_insurances, id.split(":")[1]);
      if (!P.need(f.until > ins.expires_on, "The new date must be later than the current one.")) return;
      fn = () => S.company_insurances.push({ id: P.uid("i"), company_id: ins.company_id, insurance_type: ins.insurance_type, expires_on: f.until, policy_number: f.ref });
    } else if (a.rule === "R04") {
      const o = find(S.operatives, id.split(":")[1]);
      fn = () => { o.status = "active"; };
    } else if (a.rule === "R08") {
      const key = a.id.split(":")[2], c = L.contracts.get(a.job.id);
      if (key === "locations") { const names = (f.names || "").split("\n").map((x) => x.trim()).filter(Boolean); if (!P.need(names.length, "Add at least one location.")) return; fn = () => names.forEach((n) => { const i = P.uid("l-"); S.work_areas.push({ id: i, contract_id: c.id, name: n, path_ids: [i], parent_id: null }); }); }
      else if (key === "supervisor") fn = () => S.contract_assignments.push({ contract_id: c.id, user_id: f.user });
      else if (key === "spec") { if (!P.need(f.spec, "Add the specification.")) return; fn = () => { c.tile_specification = f.spec; c.installation_system = c.installation_system || "As specification"; S.document_revisions.push({ id: P.uid("d"), contract_id: c.id, work_area_id: null, title: f.doc, document_reference: "SPEC-01", revision: 1, classification: "operational" }); }; }
      else { const err = planErr(f); if (err) return P.toast(err, true); fn = () => S.planned_allocations.push(planRow(f, c.id)); }
    }
    P.save(a.title.replace(/\.$/, ""), fn, el);
  };

  function planForm(cid) {
    const S = P.S, L = P.L();
    return `<div class="field"><label for="g">Gang</label><select id="g" name="team">${P.teamOptions()}</select></div>
      <div class="field"><label for="a">Where</label><select id="a" name="area">${S.work_areas.filter((a) => a.contract_id === cid).map((a) => `<option value="${a.id}">${esc(L.path(a.id))}</option>`).join("")}</select></div>
      <div class="field"><label for="st">What</label><select id="st" name="stage">${Object.entries(R.STAGE).map(([k, v]) => `<option value="${k}" ${k === "installation" ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>
      <div class="triple" style="grid-template-columns:1fr 1fr"><div class="field"><label for="s">From</label><input id="s" type="date" name="start" value="${S.today}"></div><div class="field"><label for="e">To</label><input id="e" type="date" name="end" value="${R.addDays(S.today, 4)}"></div></div>
      <div class="field"><label for="i">Instructions for the gang</label><textarea id="i" name="instr"></textarea><small>The gang sees this on their phone. Keep it to the work.</small></div>`;
  }
  const planErr = (f) => (!f.area ? "Add a location to the job first." : f.end < f.start ? "The finish date is before the start date." : null);
  const planRow = (f, cid) => { const pk = P.S.work_packages.find((w) => w.work_area_id === f.area); return { id: P.uid("pa"), contract_id: cid, work_area_id: f.area, work_package_id: pk ? pk.id : null, team_id: f.team, stage: f.stage, planned_start: f.start, planned_end: f.end, instructions: f.instr || "" }; };
  P.acts.plan = (el) => {
    const jobs = [...visible(P.cur)].map((id) => P.L().contracts.get(id));
    const fixed = el.dataset.job, cid = fixed || el.dataset.pick || jobs[0].id;
    const picker = fixed ? "" : `<div class="field"><label for="j">Job</label><select id="j" name="job">${jobs.map((c) => `<option value="${c.id}" ${c.id === cid ? "selected" : ""}>${esc(c.reference + " · " + c.name)}</option>`).join("")}</select></div>`;
    P.sheet(P.sheetFrame("Plan work", `${picker}${planForm(cid)}<button class="btn" data-act="save-plan" data-job="${cid}">Save plan</button>`));
  };
  document.addEventListener("change", (e) => { if (e.target.matches('.sheet select[name="job"]')) P.acts.plan({ dataset: { pick: e.target.value } }); });
  P.acts["save-plan"] = (el) => { const f = P.form(el), cid = f.job || el.dataset.job, err = planErr(f); if (err) return P.toast(err, true); P.save("Work planned", () => P.S.planned_allocations.push(planRow(f, cid)), el); };
  P.acts["add-locations"] = (el) => P.sheet(P.sheetFrame("Add locations", `<div class="field"><label for="l">One per line</label><textarea id="l" name="names"></textarea></div><button class="btn" data-act="save-locations" data-job="${el.dataset.job}">Save</button>`));
  P.acts["save-locations"] = (el) => { const f = P.form(el), names = (f.names || "").split("\n").map((x) => x.trim()).filter(Boolean); if (!P.need(names.length, "Add at least one location.")) return; P.save("Locations added", () => names.forEach((n) => { const i = P.uid("l-"); P.S.work_areas.push({ id: i, contract_id: el.dataset.job, name: n, path_ids: [i], parent_id: null }); }), el); };
  P.acts["add-doc"] = (el) => P.sheet(P.sheetFrame("Add a document", `<div class="field"><label for="t">Title</label><input id="t" type="text" name="title"></div><div class="field"><label for="r">Reference</label><input id="r" type="text" name="ref"></div>${P.photo("file", "Choose a file")}<button class="btn" data-act="save-doc" data-job="${el.dataset.job}">Save document</button>`));
  P.acts["save-doc"] = (el) => { const f = P.form(el); if (!P.need(f.title && f.file, "Add a title and choose a file.")) return; P.save("Document added", () => P.S.document_revisions.push({ id: P.uid("d"), contract_id: el.dataset.job, work_area_id: null, title: f.title, document_reference: f.ref || "DOC", revision: 1, classification: "operational" }), el); };

  // ---------------------------------------------------------------- subcontractor
  P.screens.subToday = (r, ctx) => {
    const alloc = R.allocationFor(P.S, ctx.v), q = R.buildQueue(ctx.actions), nxt = q.next;
    const rest = q.then;
    const first = ctx.v.display_name.split(" ")[0];
    const head = `<header class="gap-s"><p class="eyebrow">${esc(P.fd(P.S.today))}</p><h1 class="title">Hello, ${esc(first)}</h1></header>`;
    const waiting = ctx.actions.filter((a) => a.state === "waiting");
    const card = alloc ? `<section class="card" data-hint><p class="eyebrow">Your work today ${P.hint("new", "New backend B1")}</p><p class="small muted" style="margin:0">Preview only. A gang cannot read its own plan in the app until backend item B1 exists.</p><h2 class="section" style="margin:0;font-size:30px">${esc(alloc.location)}</h2><p class="muted">${esc(alloc.job.name)} · ${esc(alloc.stage)}</p>
      ${alloc.instructions ? `<div class="banner"><strong>Instructions</strong><span>${esc(alloc.instructions)}</span></div>` : ""}
      ${kv([["Address", esc(alloc.address)], ["Hours", esc(alloc.hours || "Not set")], ["Site contact", esc(alloc.siteContact || "Not set")], ["Your supervisor", esc(alloc.supervisor || "Not set")], ["Your gang", esc(alloc.people.join(", "))]])}
      <a class="btn secondary" href="#/papers">${P.ic("file")}Drawings and documents (${alloc.documents.length})</a></section>` : P.empty("Nothing planned for you today", "When the office plans you onto a job it appears here.", "users");
    const primary = nxt ? P.hero(nxt) : "";
    const wait = (rest.length ? `<section class="gap-s"><h2 class="section">Then (${rest.length})</h2><div class="card flat list">${rest.map(P.actionRow).join("")}</div></section>` : "") + (waiting.length ? `<section class="gap-s"><h2 class="section">Waiting on others (${waiting.length})</h2><div class="card flat list">${waiting.map(P.actionRow).join("")}</div></section>` : "");
    return `${head}<div class="two-col"><div style="display:grid;gap:16px">${nxt ? primary + card : card}</div><div style="display:grid;gap:16px">${wait}</div></div>`;
  };
  P.screens.fixes = (r, ctx) => {
    const mine = ctx.actions;
    return `<header class="gap-s"><h1 class="title">Fixes</h1><p class="sub">Things your gang has been asked to put right.</p></header>${mine.length ? `<div class="card flat list">${mine.map(P.actionRow).join("")}</div>` : P.empty("No fixes", "Nothing needs putting right.", "wrench")}`;
  };
  P.screens.fix = (r, ctx) => {
    const S = P.S, L = P.L(), kind = r.q.kind, rec = find(kind === "hold" ? S.work_holds : S.supervisor_issues, r.id);
    const a = ctx.actions.find((x) => x.route && x.route.id === r.id && x.route.screen === "fix");
    if (!rec || !a) return `${P.back("#/fixes", "Fixes")}${P.empty("Nothing to do here", "This is already with the supervisor or the office.", "check")}`;
    const ask = kind === "hold" && rec.status === "correction_submitted";
    const body = ask
      ? `<section class="card" data-form><h2 class="section" style="margin:0">Fix saved</h2><p>Now ask the office to check it.</p><div class="field"><label for="n">Short note</label><textarea id="n" name="note"></textarea></div><button class="btn" data-act="ask-check" data-id="${rec.id}">Ask the office to check</button></section>`
      : `<section class="card" data-form data-hint><h2 class="section" style="margin:0">Send your fix ${P.hint("exists")}</h2>${P.photo("photo", "Add a photo of the finished fix")}<div class="field"><label for="d">When was it finished?</label><input id="d" type="date" name="date" value="${S.today}"></div><div class="field"><label for="n">Note</label><textarea id="n" name="note"></textarea></div><button class="btn" data-act="send-fix" data-kind="${kind}" data-id="${rec.id}">Send fix</button></section>`;
    return `${P.back("#/fixes", "Fixes")}<header class="gap-s"><h1 class="title">${esc(kind === "hold" ? "Work stopped" : rec.check_label)}</h1><p class="sub">${esc(L.path(rec.work_area_id))} · ${esc(L.job(rec.contract_id).name)}</p></header>${P.needBox(a)}${body}`;
  };
  P.acts["send-fix"] = (el) => {
    const f = P.form(el), kind = el.dataset.kind, rec = find(kind === "hold" ? P.S.work_holds : P.S.supervisor_issues, el.dataset.id);
    if (!P.need(f.photo, "Add a photo of the fix.")) return;
    P.save("Fix sent with photo", () => { if (kind === "hold") { rec.status = "correction_submitted"; rec.corrected_by = P.viewer().user_id; } else { rec.snag_status = "rectification_submitted"; rec.rectified_by = P.viewer().user_id; } }, el);
  };
  P.acts["ask-check"] = (el) => { const f = P.form(el), h = find(P.S.work_holds, el.dataset.id); if (!P.need(f.note, "Add a short note.")) return; P.save("Office asked to check the fix", () => { h.status = "awaiting_release"; }, el, () => nav("#/today")); };
  P.screens.papers = (r, ctx) => {
    const alloc = R.allocationFor(P.S, ctx.v);
    return `<header class="gap-s"><h1 class="title">Paperwork</h1><p class="sub">Documents for your job only.</p></header>${alloc ? `<div class="card flat list">${alloc.documents.map((d) => `<button class="row" data-act="open-doc"><span class="lead">${P.ic("file")}</span><span class="text"><strong>${esc(d.title)}</strong><span>${esc(d.document_reference)} · revision ${d.revision}</span></span>${P.ic("chevron")}</button>`).join("")}</div>` : P.empty("No job today", "Documents appear when you are planned onto a job.", "file")}`;
  };

  // ---------------------------------------------------------------- login
  P.screens.login = () => `<div class="login"><img src="tilespec-logo-animated.svg" alt="TileSPEC"><h1 class="title" style="text-align:center">Sign in</h1><p class="sub" style="text-align:center">This is the sign-in screen. In the prototype, pick who you are in the bar at the top.</p>
    <div class="card" data-form><div class="field"><label for="em">Email</label><input id="em" type="text" value="you@company.example"></div><div class="field"><label for="pw">Password</label><input id="pw" type="text" value="••••••••"></div><p class="small muted">The app already has its own sign-in. It would not change. ${P.hint("exists")}</p></div></div>`;
})();
