/*
 * Next Action rules (prototype).
 *
 * Design contract, in the order the review should check it:
 *  1. Actions are DERIVED from saved records. Nothing here stores or "ticks off" a
 *     task. An action disappears only when the underlying record changes.
 *  2. kind "gate" = a mandatory compliance or quality control. It cannot be
 *     dismissed, snoozed or completed by anyone except the named, authorised
 *     person recording the named saved outcome. The engine never approves an
 *     inspection, releases a hold, authorises work or bypasses a permission.
 *     kind "reminder" = a helpful nudge or a required daily record.
 *  3. Independence is explicit: if the viewer raised/repaired something, the
 *     action is returned as "blocked" for them, never "ready".
 *  4. Role scoping happens here, before any screen sees data. A subcontractor
 *     only ever receives actions for their own team and never any money.
 *  5. Every action names its job, location, responsible role/person, plain
 *     English instruction, priority, due date, required information, completion
 *     condition, next step and which saved record it came from.
 *
 * In the real build these rules would compose the EXISTING database functions and
 * helpers (snag_register, hold_register, work_release_status,
 * inspection_requirements, buildSiteDay, insuranceSummary, outstandingQa,
 * unacknowledgedInstructions). The simplified derivations below only exist so the
 * prototype can run without a backend.
 */
(function (root) {
  const STAGE = {
    preparation: "substrate preparation", waterproofing: "waterproofing", installation: "tile installation", grouting: "grouting",
    sealant: "sealant and movement joints", protection: "protection", remedial: "remedial work",
  };
  // Not decided by the business yet. Listed in docs/redesign/04-next-actions.md as
  // "thresholds needing owner approval". Changing a value changes reminders only,
  // never a gate.
  const PROPOSED_THRESHOLDS = {
    morningChecksOfficeSeesAfter: "10:00",
    handoverReminderAfter: "15:00",
    handoverOfficeSeesAfter: "17:30",
    insuranceWarningDays: 30,
    planHorizonDays: 7,
    jobSetupLeadDays: 21,
    overdueEscalatesToOwnerAfterDays: 3,
  };
  const T = PROPOSED_THRESHOLDS;

  const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
  const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
  const isoDate = (iso) => String(iso).slice(0, 10);
  const money = (n) => "£" + Math.round(n).toLocaleString("en-GB");

  function budgetSummary(c) {
    const cost = c.labour_budget + c.materials_budget + c.preliminaries_budget;
    const profit = c.contract_value - cost - c.contingency;
    return { value: c.contract_value, cost, reserve: c.contingency, profit, margin: c.contract_value > 0 ? (profit / c.contract_value) * 100 : null };
  }

  function lib(s) {
    const by = (arr, key = "id") => new Map((arr || []).map((x) => [x[key], x]));
    const areas = by(s.work_areas), contracts = by(s.contracts), teams = by(s.teams), companies = by(s.companies), members = by(s.members, "user_id");
    const path = (id) => (areas.get(id) ? areas.get(id).path_ids.map((p) => areas.get(p).name).join(" › ") : "Location not visible");
    return {
      areas, contracts, teams, companies, members, path,
      job: (id) => { const c = contracts.get(id); return c ? { id: c.id, reference: c.reference, name: c.name } : { id, reference: "", name: "Unknown job" }; },
      person: (id) => (members.get(id) ? members.get(id).display_name : "Someone"),
      supervisorOf: (cid) => s.contract_assignments.filter((a) => a.contract_id === cid).map((a) => members.get(a.user_id)).find((m) => m && m.role === "supervisor") || null,
      officeOf: (cid) => s.contract_assignments.filter((a) => a.contract_id === cid).map((a) => members.get(a.user_id)).filter((m) => m && m.role === "contracts_manager"),
      teamLead: (tid) => {
        const lead = s.team_memberships.find((m) => m.team_id === tid && m.is_lead);
        const op = lead && s.operatives.find((o) => o.id === lead.operative_id);
        return op ? op.display_name : null;
      },
      teamIdsOf: (userId) => {
        const ops = s.operatives.filter((o) => o.user_id === userId && o.status === "active").map((o) => o.id);
        return [...new Set(s.team_memberships.filter((m) => ops.includes(m.operative_id)).map((m) => m.team_id))];
      },
      covers: (plan, day) => plan.planned_start <= day && plan.planned_end >= day,
      under: (areaId, ancestorId) => !!areas.get(areaId) && areas.get(areaId).path_ids.includes(ancestorId),
    };
  }

  // Which contracts a person can see. Mirrors private.can_access_contract.
  function visibleContractIds(s, viewer, L) {
    if (viewer.role === "owner") return s.contracts.map((c) => c.id);
    if (viewer.role === "contracts_manager" || viewer.role === "supervisor")
      return [...new Set(s.contract_assignments.filter((a) => a.user_id === viewer.user_id).map((a) => a.contract_id))];
    return [...new Set(s.package_assignments.filter((a) => a.user_id === viewer.user_id).map((a) => a.contract_id))];
  }

  const roleKey = (viewer) => (viewer.role === "contracts_manager" ? "office" : viewer.role === "owner" ? "owner" : viewer.role === "supervisor" ? "supervisor" : "subcontractor");

  // ---- rule definitions -------------------------------------------------------
  // Each rule returns raw actions. `audience` says what each role may do with it:
  // "act" (can complete it), "see" (sees it as waiting on someone else) or absent.
  const rules = [];
  const rule = (id, fn) => rules.push({ id, fn });

  const holdLabel = (h) => (h.hold_type === "safety" ? "safety stop" : "quality hold");

  // G01/G02 - a stop has been raised but nobody has been told to fix it.
  rule("G01_G02_hold_needs_fixer", (s, L) => s.work_holds.filter((h) => h.status === "active" && !h.assigned_team_id && !h.assigned_operative_id).map((h) => ({
    id: `hold-assign:${h.id}`, rule: h.hold_type === "safety" ? "G01" : "G02", process: "stop-work", kind: "gate",
    priority: h.hold_type === "safety" ? 0 : 1, order: 1, job: L.job(h.contract_id), location: L.path(h.work_area_id),
    responsible: { role: "supervisor", who: (L.supervisorOf(h.contract_id) || {}).display_name || null, label: "Site supervisor or office" },
    title: `Say who will fix the ${holdLabel(h)}`, why: `${h.reason} Affected work stays stopped until it is fixed and the office releases it.`,
    due: null, requires: ["Which gang fixes it", "What they must do", "A target date"], doneWhen: "A fixer and a target date are saved on the stop",
    next: "The gang sends photos of the fix", audience: { supervisor: "act", office: "act", owner: h.hold_type === "safety" ? "see" : null },
    source: { table: "work_holds", id: h.id }, route: { screen: "hold", id: h.id }, backend: "exists",
  })));

  // G03 - a gang has been told to fix it and has not yet said they have.
  rule("G03_hold_awaiting_fix", (s, L) => s.work_holds.filter((h) => h.status === "active" && (h.assigned_team_id || h.assigned_operative_id)).map((h) => ({
    id: `hold-fix:${h.id}`, rule: "G03", process: "stop-work", kind: "gate", priority: h.hold_type === "safety" ? 0 : 1, order: 1,
    job: L.job(h.contract_id), location: L.path(h.work_area_id),
    responsible: { role: "subcontractor", who: L.teamLead(h.assigned_team_id), label: (L.teams.get(h.assigned_team_id) || {}).name || "Assigned gang" },
    title: "Fix it and send photos", why: `${h.required_action || h.reason}`,
    due: h.target_date || null, requires: ["Photos of the finished fix", "When the work was finished"], doneWhen: "A correction with photos is saved",
    next: "Ask the office to check it", audience: { subcontractor: "act", supervisor: "see", office: "see" },
    parties: { teamIds: [h.assigned_team_id] }, source: { table: "work_holds", id: h.id }, route: { screen: "fix", id: h.id, kind: "hold" }, backend: "exists",
  })));

  // G04 - the fix has been submitted; someone must ask for the independent check.
  rule("G04_hold_ask_release", (s, L) => s.work_holds.filter((h) => h.status === "correction_submitted").map((h) => ({
    id: `hold-ask:${h.id}`, rule: "G04", process: "stop-work", kind: "gate", priority: 1, order: 2, job: L.job(h.contract_id), location: L.path(h.work_area_id),
    responsible: { role: "subcontractor", who: L.teamLead(h.assigned_team_id), label: (L.teams.get(h.assigned_team_id) || {}).name || "Assigned gang" },
    title: "Ask the office to check the fix", why: "The fix is saved. A different person now has to check it before work can restart.",
    due: null, requires: ["A short note"], doneWhen: "A release review is requested", next: "Office checks and decides",
    audience: { subcontractor: "act", supervisor: "see", office: "see" }, parties: { teamIds: [h.assigned_team_id] },
    source: { table: "work_holds", id: h.id }, route: { screen: "fix", id: h.id, kind: "hold" }, backend: "exists",
  })));

  // G05 - the independent decision. The engine only SHOWS the decision; it never takes it.
  rule("G05_hold_release_decision", (s, L) => s.work_holds.filter((h) => h.status === "awaiting_release").map((h) => {
    const blockers = [];
    if (h.critical_snags_open || s.supervisor_issues.some((i) => i.contract_id === h.contract_id && i.severity === "critical" && !["closed", "cancelled"].includes(i.snag_status) && L.under(i.work_area_id, h.work_area_id)))
      blockers.push("A critical defect is still open on this work.");
    return {
      id: `hold-release:${h.id}`, rule: "G05", process: "stop-work", kind: "gate", priority: h.hold_type === "safety" ? 0 : 1, order: 2,
      job: L.job(h.contract_id), location: L.path(h.work_area_id),
      responsible: { role: "office", who: null, label: "Office or owner. Not the person who raised it" },
      independence: { forbidden: [{ userId: h.raised_by, reason: `${L.person(h.raised_by)} raised this stop, so someone else has to check it.` }, ...(h.corrected_by ? [{ userId: h.corrected_by, reason: `${L.person(h.corrected_by)} submitted the fix, so someone else has to check it.` }] : [])] },
      title: `Check the fix and decide: ${holdLabel(h)}`, why: `${h.reason} The gang says it is fixed. Review their photos and the inspection results, then restart the work or send it back.`,
      due: null, requires: ["Photos of the fix", "Inspection results for this work", ...(h.hold_type === "safety" ? ["Principal contractor's name and reference"] : []), "A reason for your decision"],
      doneWhen: "A release or a send-back decision is saved", next: "Work restarts for this location only, or the gang is sent back",
      blockers, audience: { office: "act", owner: "act", supervisor: "see", subcontractor: "see" }, parties: { teamIds: [h.assigned_team_id] },
      source: { table: "work_holds", id: h.id }, route: { screen: "decision", id: h.id }, backend: "exists",
    };
  }));

  // G06/G07/G08 - mandatory inspections for planned work.
  function reqFor(s, L, plan) {
    return s.location_inspection_requirements.filter((r) => r.contract_id === plan.contract_id && r.stage === plan.stage && L.under(plan.work_area_id, r.work_area_id));
  }
  function latestInspection(s, L, plan) {
    return s.location_inspections.filter((i) => i.contract_id === plan.contract_id && i.stage === plan.stage
      && (i.work_area_id === plan.work_area_id || L.under(i.work_area_id, plan.work_area_id)))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  }
  rule("G06_G07_G08_inspections", (s, L) => {
    const out = [];
    for (const plan of s.planned_allocations) {
      const horizon = addDays(s.today, T.planHorizonDays);
      if (plan.planned_start > horizon || plan.planned_end < s.today) continue;
      const reqs = reqFor(s, L, plan);
      const job = L.job(plan.contract_id), where = L.path(plan.work_area_id), stage = STAGE[plan.stage];
      if (!reqs.length) {
        out.push({
          id: `applicability:${plan.id}`, rule: "G08", process: "inspection", kind: "gate", priority: 2, order: 13, job, location: where,
          responsible: { role: "office", who: null, label: "Office" }, title: `Confirm which inspections apply to ${stage}`,
          why: `Work is planned here from ${plan.planned_start}. Until the office confirms what must be inspected, this work is not released. Unknown never counts as allowed.`,
          due: plan.planned_start, requires: ["The specification or manufacturer document", "Whether a mandatory inspection is needed"], doneWhen: "An inspection decision is saved for this location and activity",
          next: "Supervisors see exactly which checks to do", audience: { office: "act", supervisor: "see" }, source: { table: "location_inspection_requirements", id: plan.id },
          route: { screen: "job", id: plan.contract_id }, backend: "exists",
        });
        continue;
      }
      if (!reqs.some((r) => r.applicability === "required")) continue;
      const last = latestInspection(s, L, plan);
      if (last && last.issues_count > 0) {
        out.push({
          id: `inspection-failed:${plan.id}`, rule: "G06", process: "inspection", kind: "gate", priority: 1, order: 4, job, location: where,
          responsible: { role: "supervisor", who: (L.supervisorOf(plan.contract_id) || {}).display_name || null, label: "Site supervisor" },
          title: `Required inspection failed: ${where}`, why: "A required check did not pass. Affected work stays blocked until it is corrected and checked again.",
          due: null, requires: ["Correction done", "A new inspection"], doneWhen: "A later inspection for the same location and activity passes", next: "Office is told once it passes",
          audience: { supervisor: "act", office: "see" }, source: { table: "location_inspections", id: last.id }, route: { screen: "inspect", id: plan.work_area_id }, backend: "exists",
        });
      } else if (!last && plan.planned_start <= s.today && plan.planned_end >= s.today) {
        out.push({
          id: `inspection-due:${plan.id}`, rule: "G07", process: "inspection", kind: "gate", priority: 2, order: 13, job, location: where,
          responsible: { role: "supervisor", who: (L.supervisorOf(plan.contract_id) || {}).display_name || null, label: "Site supervisor" },
          title: `Inspect ${where} before ${stage} goes ahead`, why: "This work needs a mandatory inspection and none has been saved yet. Nothing here passes the inspection for you.",
          due: s.today, requires: ["Pass, fail or not applicable for each check", "A photo where the check asks for one"], doneWhen: "A passing inspection is saved for this location and activity",
          next: "Work at this location is cleared to continue", audience: { supervisor: "act", office: "see" }, source: { table: "location_inspection_requirements", id: reqs[0].id },
          route: { screen: "inspect", id: plan.work_area_id, stage: plan.stage }, backend: "exists",
        });
      }
    }
    return out;
  });

  // G09 - critical snag.
  rule("G09_critical_snag", (s, L) => s.supervisor_issues.filter((i) => i.severity === "critical" && i.snag_status === "open" && !i.assigned_team_id).map((i) => ({
    id: `snag-critical:${i.id}`, rule: "G09", process: "snag", kind: "gate", priority: 1, order: 5, job: L.job(i.contract_id), location: L.path(i.work_area_id),
    responsible: { role: "office", who: null, label: "Office" }, title: "Review the critical defect",
    why: `${i.check_label}. ${i.description} A critical defect does not stop work by itself. If affected work must stop, raise a STOP WORK.`,
    due: i.target_date || null, requires: ["Who will fix it", "A target date"], doneWhen: "The defect is fixed, re-inspected and accepted by the office",
    next: "Assign a gang to fix it", audience: { office: "act", owner: "see", supervisor: "see" }, source: { table: "supervisor_issues", id: i.id },
    route: { screen: "snag", id: i.id }, backend: "exists",
  })));

  // R13 - an ordinary snag nobody has been told to fix. Without this rule it would have no owner.
  rule("R13_snag_needs_gang", (s, L) => s.supervisor_issues.filter((i) => i.snag_status === "open" && !i.assigned_team_id && i.severity !== "critical").map((i) => ({
    id: `snag-assign:${i.id}`, rule: "R13", process: "snag", kind: "reminder", priority: 2, order: 8, job: L.job(i.contract_id), location: L.path(i.work_area_id),
    responsible: { role: "supervisor", who: (L.supervisorOf(i.contract_id) || {}).display_name || null, label: "Site supervisor" }, title: "Say who will fix this snag",
    why: `${i.check_label}. ${i.description}`, due: null, requires: ["Which gang", "A target date"], doneWhen: "A gang and a target date are saved on the snag",
    next: "The gang fixes it and sends a photo", audience: { supervisor: "act", office: "act" }, source: { table: "supervisor_issues", id: i.id },
    route: { screen: "snag", id: i.id }, backend: "exists",
  })));

  // G10 - repair submitted; an independent person must re-inspect.
  rule("G10_snag_reinspect", (s, L) => s.supervisor_issues.filter((i) => ["rectification_submitted", "reinspection"].includes(i.snag_status)).map((i) => {
    const needsOffice = i.severity === "critical" || i.escalated;
    return {
      id: `snag-reinspect:${i.id}`, rule: "G10", process: "snag", kind: "gate", priority: 1, order: 6, job: L.job(i.contract_id), location: L.path(i.work_area_id),
      responsible: needsOffice ? { role: "office", who: null, label: "Office. Critical repairs need the office" } : { role: "supervisor", who: (L.supervisorOf(i.contract_id) || {}).display_name || null, label: "Site supervisor. Not the person who did the repair" },
      independence: i.rectified_by ? { forbidden: [{ userId: i.rectified_by, reason: `${L.person(i.rectified_by)} did the repair, so someone else has to check it.` }] } : null,
      title: "Check the repair", why: `${i.check_label}. The gang says it is repaired. Look at it in person and add a photo, then accept or send it back.`,
      due: null, requires: ["A look at the repair", "A photo of the result", "A note"], doneWhen: "The repair is accepted or sent back, and saved", next: needsOffice ? "Closed once the office accepts" : "Closed once accepted",
      audience: needsOffice ? { office: "act", supervisor: "see", subcontractor: "see", owner: null } : { supervisor: "act", office: "act", subcontractor: "see" },
      parties: { teamIds: [i.assigned_team_id] }, source: { table: "supervisor_issues", id: i.id }, route: { screen: "snag", id: i.id }, backend: "exists",
    };
  }));

  // G11 - responsibility proposed to a gang; disputes go to the office.
  rule("G11_responsibility", (s, L) => s.supervisor_issues.filter((i) => i.responsibility_state === "proposed" || i.responsibility_state === "disputed").map((i) => {
    const disputed = i.responsibility_state === "disputed";
    return {
      id: `snag-responsibility:${i.id}`, rule: "G11", process: "snag", kind: "gate", priority: 1, order: 7, job: L.job(i.contract_id), location: L.path(i.work_area_id),
      responsible: disputed ? { role: "office", who: null, label: "Office" } : { role: "subcontractor", who: L.teamLead(i.responsibility_team_id), label: (L.teams.get(i.responsibility_team_id) || {}).name || "Named gang" },
      title: disputed ? "Decide who is responsible" : "Say whether this was your gang's work", why: `${i.check_label}. The site records show your gang worked here. Being present is evidence of work, not proof of fault.`,
      due: null, requires: ["Accept or dispute", "A short reason"], doneWhen: disputed ? "The office records its decision" : "The gang accepts or disputes",
      next: disputed ? "Repair can be assigned" : "Office reviews if disputed",
      audience: disputed ? { office: "act", owner: null, supervisor: "see" } : { subcontractor: "act", supervisor: "see", office: "see" },
      parties: { teamIds: [i.responsibility_team_id] }, source: { table: "supervisor_issues", id: i.id }, route: { screen: "snag", id: i.id }, backend: "exists",
    };
  }));

  // G12 - the office has asked this supervisor to inspect something.
  rule("G12_qa_request", (s, L) => s.supervisor_office_items.filter((m) => m.kind === "qa_request" && !s.supervisor_qa_submissions.some((q) => q.item_id === m.id)).map((m) => ({
    id: `qa:${m.id}`, rule: "G12", process: "inspection", kind: "gate", priority: 2, order: 9, job: L.job(m.contract_id), location: L.path(m.work_area_id),
    responsible: { role: "supervisor", who: L.person(m.recipient_id), label: "Site supervisor" }, title: `Inspect ${L.path(m.work_area_id)} for the office`,
    why: `${L.person(m.created_by)} asked for this. ${m.body} Sending your result does not approve payment or lift any stop.`,
    due: m.due_on, requires: ["The inspection result", "Send it to the office"], doneWhen: "Your saved inspection is sent back to the office", next: "Office sees the result",
    audience: { supervisor: "act", office: "see" }, actUsers: [m.recipient_id], source: { table: "supervisor_office_items", id: m.id }, route: { screen: "inspect", id: m.work_area_id, stage: m.stage, qa: m.id }, backend: "exists",
  })));

  // G13 - subcontractor insurance. Not blocked by the database today (see audit).
  // Insurance records are append-only in the database: a renewal is a NEW entry, so only the
  // latest entry of each type counts (same as insuranceSummary in lib/operations/companies.ts).
  const latestCover = (s, companyId) => {
    const latest = new Map();
    for (const i of s.company_insurances.filter((x) => x.company_id === companyId)) {
      const cur = latest.get(i.insurance_type);
      if (!cur || i.expires_on > cur.expires_on) latest.set(i.insurance_type, i);
    }
    return [...latest.values()];
  };
  rule("G13_insurance_expired", (s, L) => {
    const out = [];
    for (const co of s.companies) {
      const teamIds = s.teams.filter((t) => t.company_id === co.id).map((t) => t.id);
      const soon = s.planned_allocations.filter((p) => teamIds.includes(p.team_id) && p.planned_end >= s.today && p.planned_start <= addDays(s.today, T.planHorizonDays));
      const onSite = s.actual_allocations.some((a) => teamIds.includes(a.team_id) && !a.ended_at && !a.voided_at);
      if (!soon.length && !onSite) continue;
      const covers = latestCover(s, co.id);
      const expired = covers.filter((i) => i.expires_on < s.today);
      if (covers.length && !expired.length) continue;
      const kind = expired[0] ? expired[0].insurance_type.replaceAll("_", " ") : "insurance";
      const plan = soon[0];
      out.push({
        id: `insurance:${co.id}`, rule: "G13", process: "compliance", kind: "gate", priority: onSite ? 1 : 2, order: 12,
        job: plan ? L.job(plan.contract_id) : { id: null, reference: "", name: "Several jobs" }, location: plan ? L.path(plan.work_area_id) : null,
        responsible: { role: "office", who: null, label: "Office" }, title: `${co.name}: ${kind} has expired`,
        why: `${co.name} ${onSite ? "is on site" : `is planned from ${plan.planned_start}`} and its ${kind} cover is out of date. The system does not stop planning today, so the office has to decide before they arrive.`,
        due: plan ? plan.planned_start : null, requires: ["The new certificate", "Its start and end dates"], doneWhen: "Valid cover is saved for the company, or the plan is changed",
        next: "Owner can see the risk is closed", audience: { office: "act", owner: "see", supervisor: onSite ? "see" : null },
        source: { table: "company_insurances", id: co.id }, route: { screen: "labour" }, backend: "exists", enforcedByBackend: false,
      });
    }
    return out;
  });

  // Snag repairs assigned to a gang: a task for the gang, a gate only when critical.
  rule("S03_snag_repair_assigned", (s, L) => s.supervisor_issues.filter((i) => ["open", "assigned"].includes(i.snag_status) && i.assigned_team_id).map((i) => ({
    id: `snag-fix:${i.id}`, rule: "S03", process: "snag", kind: i.severity === "critical" ? "gate" : "reminder", priority: i.target_date && i.target_date < s.today ? 1 : 2, order: 8,
    job: L.job(i.contract_id), location: L.path(i.work_area_id), responsible: { role: "subcontractor", who: L.teamLead(i.assigned_team_id), label: (L.teams.get(i.assigned_team_id) || {}).name || "Assigned gang" },
    title: "Fix this snag and send a photo", why: `${i.check_label}. ${i.description}`, due: i.target_date, requires: ["Photo of the repair", "The date the work was done"], doneWhen: "The repair is submitted with a photo",
    next: "The supervisor checks it in person", audience: { subcontractor: "act", supervisor: "see", office: "see" }, parties: { teamIds: [i.assigned_team_id] },
    source: { table: "supervisor_issues", id: i.id }, route: { screen: "fix", id: i.id, kind: "snag" }, backend: "exists",
  })));

  // R07 - chasing: overdue fixes. The reminder goes to the person who can chase.
  rule("R07_overdue_fix", (s, L) => {
    const out = [];
    const overdue = [
      ...s.supervisor_issues.filter((i) => ["open", "assigned"].includes(i.snag_status) && i.assigned_team_id && i.target_date && i.target_date < s.today).map((i) => ({ kind: "snag", rec: i, team: i.assigned_team_id, what: i.check_label })),
      ...s.work_holds.filter((h) => h.status === "active" && h.assigned_team_id && h.target_date && h.target_date < s.today).map((h) => ({ kind: "hold", rec: h, team: h.assigned_team_id, what: h.reason })),
    ];
    for (const o of overdue) {
      const late = dayDiff(s.today, o.rec.target_date);
      out.push({
        id: `chase:${o.kind}:${o.rec.id}`, rule: "R07", process: o.kind === "hold" ? "stop-work" : "snag", kind: "reminder", priority: 2, order: 8,
        job: L.job(o.rec.contract_id), location: L.path(o.rec.work_area_id), responsible: { role: "office", who: null, label: "Office" },
        title: `Chase ${(L.teams.get(o.team) || {}).name}: ${late} day${late === 1 ? "" : "s"} late`, why: `${o.what}. It was due ${o.rec.target_date}.`,
        due: o.rec.target_date, overdue: true, requires: ["Speak to the gang lead", "Agree a new date"], doneWhen: "The fix is submitted, or a new target date is saved",
        next: "Supervisor checks the repair", audience: { office: "act", supervisor: "see", owner: late > T.overdueEscalatesToOwnerAfterDays ? "see" : null },
        source: { table: o.kind === "hold" ? "work_holds" : "supervisor_issues", id: o.rec.id }, route: { screen: o.kind === "hold" ? "hold" : "snag", id: o.rec.id }, backend: "exists",
        contact: (L.teams.get(o.team) || {}).name,
      });
    }
    return out;
  });

  // R01..R06 - the supervisor's day.
  const workToday = (s, cid) => s.planned_allocations.some((p) => p.contract_id === cid && p.planned_start <= s.today && p.planned_end >= s.today)
    || s.actual_allocations.some((a) => a.contract_id === cid && a.work_date === s.today && !a.voided_at);

  rule("R01_morning_checks", (s, L) => s.contracts.filter((c) => workToday(s, c.id) && !s.supervisor_inspections.some((m) => m.contract_id === c.id && isoDate(m.created_at) === s.today)).map((c) => ({
    id: `morning:${c.id}:${s.today}`, rule: "R01", process: "daily-site", kind: "reminder", priority: 2, order: 9, job: L.job(c.id), location: null,
    responsible: { role: "supervisor", who: (L.supervisorOf(c.id) || {}).display_name || null, label: "Site supervisor" }, title: "Do the morning checks",
    why: "A two-minute check of people, materials and access before work starts. Problems go straight to the office.", due: s.today, requires: ["Yes, no or not applicable for each question"],
    doneWhen: "Morning checks are saved for today", next: "Confirm who is on site", audience: { supervisor: "act", office: s.now >= T.morningChecksOfficeSeesAfter ? "see" : null },
    source: { table: "supervisor_inspections", id: null }, route: { screen: "morning" }, backend: "exists",
  })));

  rule("R02_earlier_work_open", (s, L) => {
    const stale = s.actual_allocations.filter((a) => !a.ended_at && !a.voided_at && a.work_date < s.today);
    return [...new Set(stale.map((a) => a.contract_id))].map((cid) => {
      const n = stale.filter((a) => a.contract_id === cid).length;
      return {
        id: `stale:${cid}`, rule: "R02", process: "daily-site", kind: "reminder", priority: 2, order: 10, job: L.job(cid), location: null,
        responsible: { role: "supervisor", who: (L.supervisorOf(cid) || {}).display_name || null, label: "Site supervisor" }, title: "Finish yesterday's work",
        why: `${n} earlier work ${n === 1 ? "record has" : "records have"} no finish time. Add one before confirming today.`, due: s.today, requires: ["A finish time for each record"],
        doneWhen: "Every earlier work record has a finish time", next: "Confirm who is on site", audience: { supervisor: "act", office: "see" },
        source: { table: "actual_allocations", id: stale[0].id }, route: { screen: "people", earlier: true }, backend: "exists",
      };
    });
  });

  rule("R03_confirm_teams", (s, L) => s.planned_allocations.filter((p) => L.covers(p, s.today)
    && !s.actual_allocations.some((a) => a.planned_allocation_id === p.id && a.work_date === s.today && !a.voided_at)
    && !s.allocation_absences.some((a) => a.planned_allocation_id === p.id && a.work_date === s.today)).map((p) => ({
    id: `confirm:${p.id}:${s.today}`, rule: "R03", process: "daily-site", kind: "reminder", priority: 2, order: 11, job: L.job(p.contract_id), location: L.path(p.work_area_id),
    responsible: { role: "supervisor", who: (L.supervisorOf(p.contract_id) || {}).display_name || null, label: "Site supervisor" }, title: `Confirm who is here: ${L.teams.get(p.team_id).name}`,
    why: "The office planned this gang here today. Tap who actually turned up, or say they did not.", due: s.today, requires: ["Who is here", "Or: gang not on site, with a reason"],
    doneWhen: "The gang is confirmed or marked not on site", next: "Check the work as it goes",
    audience: { supervisor: "act", office: "see" }, source: { table: "planned_allocations", id: p.id }, route: { screen: "people" }, backend: "exists",
  })));

  rule("R04_provisional_person", (s, L) => s.operatives.filter((o) => o.status === "provisional").map((o) => ({
    id: `provisional:${o.id}`, rule: "R04", process: "workforce", kind: "reminder", priority: 3, order: 14, job: { id: null, reference: "", name: "Workforce" }, location: null,
    responsible: { role: "office", who: null, label: "Office" }, title: `Confirm ${o.display_name}`, why: "A supervisor added this person on site. The office has not confirmed who they are yet.",
    due: null, requires: ["Full name", "Company", "Engagement"], doneWhen: "The person is confirmed", next: null, audience: { office: "act", supervisor: "see" },
    source: { table: "operatives", id: o.id }, route: { screen: "labour" }, backend: "exists",
  })));

  rule("R05_instruction_unread", (s, L) => s.supervisor_office_items.filter((m) => m.kind === "instruction" && m.acknowledgement_required
    && !s.supervisor_office_acknowledgements.some((a) => a.item_id === m.id)).map((m) => ({
    id: `ack:${m.id}`, rule: "R05", process: "daily-site", kind: "reminder", priority: 2, order: 9.5, job: L.job(m.contract_id), location: null,
    responsible: { role: "supervisor", who: L.person(m.recipient_id), label: "Site supervisor" }, title: `Read: ${m.title}`, why: m.body, due: null, requires: ["Tap Got it"],
    doneWhen: "You acknowledge it", next: null, audience: { supervisor: "act", office: "see" }, actUsers: m.recipient_id ? [m.recipient_id] : null,
    source: { table: "supervisor_office_items", id: m.id }, route: { screen: "messages" }, backend: "exists",
  })));

  rule("R06_handover", (s, L) => s.contracts.filter((c) => workToday(s, c.id) && !s.site_handovers.some((h) => h.contract_id === c.id && h.work_date === s.today)).flatMap((c) => {
    const base = {
      id: `handover:${c.id}:${s.today}`, rule: "R06", process: "daily-site", kind: "reminder", priority: 3, order: 15, job: L.job(c.id), location: null,
      responsible: { role: "supervisor", who: (L.supervisorOf(c.id) || {}).display_name || null, label: "Site supervisor" }, title: "Send today's handover",
      why: "Tell the office what is finished, what is stuck and what you need tomorrow. Today's records are filled in for you.", due: s.today, requires: ["Check the summary", "Add anything missing"],
      doneWhen: "Today's handover is saved", next: "Office reads it", audience: { supervisor: s.now >= T.handoverReminderAfter ? "act" : null, office: s.now >= T.handoverOfficeSeesAfter ? "see" : null },
      source: { table: "site_handovers", id: null }, route: { screen: "handover" }, backend: "exists",
    };
    return [base];
  }));

  // R08 - setting a job up. One action per missing step, in a fixed order.
  rule("R08_job_setup", (s, L) => {
    const out = [];
    for (const c of s.contracts) {
      const live = c.start_date <= addDays(s.today, T.jobSetupLeadDays) && c.end_date >= s.today;
      if (!live) continue;
      const job = L.job(c.id), steps = [];
      const locs = s.work_areas.filter((a) => a.contract_id === c.id);
      const planned = s.planned_allocations.some((p) => p.contract_id === c.id && p.planned_end >= s.today && p.planned_start <= addDays(s.today, T.planHorizonDays));
      const sup = L.supervisorOf(c.id);
      const docs = s.document_revisions.filter((d) => d.contract_id === c.id);
      if (!locs.length) steps.push(["locations", "Add the locations", "Blocks, floors, flats or rooms you will work in.", ["Names of areas"], "Locations are saved", "Plan who works where"]);
      if (!sup) steps.push(["supervisor", "Give the job a supervisor", "Nobody is looking after this job on site yet.", ["Which supervisor"], "A supervisor is allocated", "They see the job on their phone"]);
      if (!docs.length || !c.tile_specification) steps.push(["spec", "Add the specification and drawings", "Supervisors and gangs need them on site.", ["Specification", "Drawings"], "Documents and spec fields are saved", "Gangs can open them"]);
      if (locs.length && c.start_date <= addDays(s.today, T.planHorizonDays) && !planned) steps.push(["plan", "Plan who works where", `Nothing is planned for the next ${T.planHorizonDays} days.`, ["Gang", "Location", "Stage", "Dates"], "A plan covers the next working days", "The supervisor confirms it on site"]);
      steps.forEach(([key, title, why, requires, doneWhen, next], idx) => out.push({
        id: `setup:${c.id}:${key}`, rule: "R08", process: "job-setup", kind: "reminder", priority: 3, order: 20 + idx, job, location: null, responsible: { role: "office", who: null, label: "Office" },
        title, why, due: c.start_date, requires, doneWhen, next, audience: { office: "act", owner: null }, source: { table: "contracts", id: c.id }, route: { screen: "job", id: c.id, step: key }, backend: "exists",
      }));
    }
    return out;
  });

  rule("R09_missing_checklist", (s, L) => s.planned_allocations.filter((p) => p.planned_end >= s.today && p.planned_start <= addDays(s.today, T.planHorizonDays)
    && !s.location_inspection_templates.some((t) => t.contract_id === p.contract_id && t.stage === p.stage && L.under(p.work_area_id, t.work_area_id))).map((p) => ({
    id: `checklist:${p.id}`, rule: "R09", process: "inspection", kind: "reminder", priority: 3, order: 21, job: L.job(p.contract_id), location: L.path(p.work_area_id),
    responsible: { role: "office", who: null, label: "Office" }, title: `Publish the ${STAGE[p.stage]} checks`, why: `A gang is planned here from ${p.planned_start} but the supervisor has no checklist to inspect against.`,
    due: p.planned_start, requires: ["The approved specification", "The checks to do"], doneWhen: "A current checklist covers this location and activity", next: "Supervisor can inspect",
    audience: { office: "act", supervisor: "see" }, source: { table: "location_inspection_templates", id: null }, route: { screen: "job", id: p.contract_id }, backend: "exists",
  })));

  rule("R10_installer_cannot_see_job", (s, L) => {
    const out = [];
    for (const p of s.planned_allocations.filter((x) => x.planned_end >= s.today && x.planned_start <= addDays(s.today, T.planHorizonDays) && x.work_package_id)) {
      const logins = s.team_memberships.filter((m) => m.team_id === p.team_id).map((m) => s.operatives.find((o) => o.id === m.operative_id)).filter((o) => o && o.user_id);
      for (const op of logins) {
        if (s.package_assignments.some((a) => a.user_id === op.user_id && a.work_package_id === p.work_package_id)) continue;
        out.push({
          id: `access:${p.id}:${op.user_id}`, rule: "R10", process: "job-setup", kind: "reminder", priority: 3, order: 22, job: L.job(p.contract_id), location: L.path(p.work_area_id),
          responsible: { role: "office", who: null, label: "Office" }, title: `${op.display_name} cannot see this job on their phone yet`,
          why: "The plan names their gang, but they have not been given access to the work package. This is entered twice today (plan and package access).", due: p.planned_start,
          requires: ["Give them access to the package"], doneWhen: "Package access is saved", next: "They see today's job", audience: { office: "act" },
          source: { table: "package_assignments", id: null }, route: { screen: "job", id: p.contract_id }, backend: "exists",
        });
      }
    }
    return out;
  });

  rule("R11_insurance_expiring", (s, L) => {
    const out = [];
    for (const co of s.companies) {
      const soon = latestCover(s, co.id).filter((i) => i.expires_on >= s.today && dayDiff(i.expires_on, s.today) <= T.insuranceWarningDays);
      for (const i of soon) out.push({
        id: `insurance-soon:${i.id}`, rule: "R11", process: "compliance", kind: "reminder", priority: 3, order: 23, job: { id: null, reference: "", name: co.name }, location: null,
        responsible: { role: "office", who: null, label: "Office" }, title: `${co.name}: ${i.insurance_type.replaceAll("_", " ")} runs out in ${dayDiff(i.expires_on, s.today)} days`,
        why: "Ask for the renewed certificate before it expires.", due: i.expires_on, requires: ["The renewed certificate"], doneWhen: "New cover is saved", next: null, audience: { office: "act" },
        source: { table: "company_insurances", id: i.id }, route: { screen: "labour" }, backend: "exists",
      });
    }
    return out;
  });

  rule("R12_new_tender", (s, L) => s.tender_enquiries.filter((t) => t.status === "received").map((t) => ({
    id: `tender:${t.id}`, rule: "R12", process: "tender", kind: "reminder", priority: dayDiff(t.deadline, s.today) <= 7 ? 2 : 3, order: 18, job: { id: null, reference: t.reference, name: t.project }, location: null,
    responsible: { role: "office", who: null, label: "Office" }, title: `Look at new enquiry: ${t.project}`, why: `${t.company}. Reply needed by ${t.deadline}.`, due: t.deadline,
    requires: ["Read the documents", "Decide whether to price it"], doneWhen: "The enquiry is priced, declined or replied to", next: "Start an estimate", audience: { office: "act" },
    source: { table: "tender_enquiries", id: t.id }, route: { screen: "tender", id: t.id }, backend: "new:B5",
  })));

  // R14 - the margin. There is no way to RECORD owner acceptance today, so this is
  // information for the owner, not a gate. See docs/redesign/01 finding C-5.
  rule("R14_margin_below_target", (s, L) => s.commercials.map((c) => ({ c, b: budgetSummary(c) })).filter(({ c, b }) => b.margin !== null && b.margin < c.target_margin).map(({ c, b }) => ({
    id: `margin:${c.contract_id}`, rule: "R14", process: "money", kind: "reminder", priority: 2, order: 19, job: L.job(c.contract_id), location: null,
    responsible: { role: "owner", who: null, label: "Owner" }, title: `Budget margin is ${b.margin.toFixed(1)}%, target is ${Number(c.target_margin).toFixed(0)}%`,
    why: `Budgeted profit after reserve is ${money(b.profit)} on ${money(b.value)}. These are original budgets only: actual costs, variations and claims are not recorded yet.`,
    due: null, requires: ["Your decision", "A reason, written down"], doneWhen: "Not recordable yet: this needs a small backend addition (B3)", next: null,
    audience: { owner: "act", office: "see" }, financial: true, source: { table: "contract_commercials", id: c.contract_id }, route: { screen: "money" }, backend: "new:B3", informationOnly: true,
  })));

  // ---- evaluation ---------------------------------------------------------------
  function forViewer(raw, viewer, s, L) {
    const key = roleKey(viewer);
    const mode = raw.audience[key];
    if (!mode) return null;
    if (raw.financial && key === "office" && !viewer.financial_access) return null;
    if (key === "subcontractor") {
      const teams = L.teamIdsOf(viewer.user_id);
      if (!raw.parties || !raw.parties.teamIds.some((t) => teams.includes(t))) return null;
    }
    const a = { ...raw, viewerMode: mode, state: mode === "act" ? "ready" : "waiting", blockedBy: null };
    if (raw.actUsers && mode === "act" && !raw.actUsers.includes(viewer.user_id)) { a.state = "waiting"; a.viewerMode = "see"; }
    if (mode === "act" && raw.blockers && raw.blockers.length) { a.state = "blocked"; a.blockedBy = raw.blockers[0]; }
    const barred = mode === "act" && raw.independence && raw.independence.forbidden.find((f) => f.userId === viewer.user_id);
    if (barred) { a.state = "blocked"; a.blockedBy = barred.reason; }
    if (raw.informationOnly && a.state === "ready") a.state = "info";
    a.overdue = !!(a.due && a.due < s.today && a.kind !== "gate") || !!raw.overdue;
    return a;
  }

  function compute(s, viewer) {
    const L = lib(s), visible = new Set(visibleContractIds(s, viewer, L));
    const raws = rules.flatMap((r) => r.fn(s, L));
    const staff = ["owner", "contracts_manager"].includes(viewer.role);
    const mine = raws.filter((a) => (a.job.id ? visible.has(a.job.id) : staff))
      .map((a) => forViewer(a, viewer, s, L)).filter(Boolean);
    mine.sort((a, b) => (a.state === "ready" || a.state === "info" ? 0 : 1) - (b.state === "ready" || b.state === "info" ? 0 : 1) || a.priority - b.priority
      || a.order - b.order || (a.kind === b.kind ? 0 : a.kind === "gate" ? -1 : 1) || String(a.due || "9999").localeCompare(String(b.due || "9999")) || a.id.localeCompare(b.id));
    // A viewer's list must never contain duplicate ids (parallel processes have distinct ids).
    const seen = new Set();
    return mine.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  }

  // The one prominent action. Only "ready" or "info" actions can be primary. If
  // there is nothing to do, say so honestly instead of inventing work.
  function nextAction(actions) {
    const ready = actions.filter((a) => a.state === "ready");
    return ready[0] || null;
  }

  // Everything saved today: shown as "Saved" so people see progress without a tick-box.
  function savedToday(s, viewer) {
    const L = lib(s), out = [];
    const visible = new Set(visibleContractIds(s, viewer, L));
    const t = (iso) => iso.slice(11, 16);
    s.supervisor_inspections.filter((m) => isoDate(m.created_at) === s.today && visible.has(m.contract_id)).forEach((m) => out.push({ label: "Morning checks", at: t(m.created_at), job: L.job(m.contract_id).name }));
    s.actual_allocations.filter((a) => a.work_date === s.today && !a.voided_at && visible.has(a.contract_id)).forEach((a) => out.push({ label: `${(L.teams.get(a.team_id) || {}).name || "Team"} confirmed on site`, at: t(a.started_at), job: L.job(a.contract_id).name }));
    s.site_handovers.filter((h) => h.work_date === s.today && visible.has(h.contract_id)).forEach((h) => out.push({ label: "Handover sent", at: t(h.created_at), job: L.job(h.contract_id).name }));
    s.location_inspections.filter((i) => isoDate(i.created_at) === s.today && visible.has(i.contract_id)).forEach((i) => out.push({ label: `Inspection saved: ${L.path(i.work_area_id)}`, at: t(i.created_at), job: L.job(i.contract_id).name }));
    return out.sort((a, b) => (a.at < b.at ? -1 : 1));
  }

  // Today's allocation for a subcontractor. Needs backend change B1: gangs cannot
  // read planned_allocations today (row-level security allows supervisors and above).
  function allocationFor(s, viewer) {
    if (roleKey(viewer) !== "subcontractor") return null;
    const L = lib(s), teams = L.teamIdsOf(viewer.user_id);
    const plan = s.planned_allocations.find((p) => teams.includes(p.team_id) && L.covers(p, s.today));
    if (!plan) return null;
    const c = L.contracts.get(plan.contract_id), sup = L.supervisorOf(plan.contract_id);
    const members = s.team_memberships.filter((m) => m.team_id === plan.team_id).map((m) => s.operatives.find((o) => o.id === m.operative_id).display_name);
    return {
      plan, job: { id: c.id, reference: c.reference, name: c.name }, address: c.address, hours: c.working_hours, siteContact: c.site_contact, location: L.path(plan.work_area_id),
      stage: STAGE[plan.stage], instructions: plan.instructions, team: L.teams.get(plan.team_id).name, people: members, supervisor: sup ? sup.display_name : null,
      documents: s.document_revisions.filter((d) => d.contract_id === c.id && d.classification === "operational" && (!d.work_area_id || L.under(plan.work_area_id, d.work_area_id))),
    };
  }

  root.TSRules = { compute, nextAction, savedToday, allocationFor, budgetSummary, lib, rules, PROPOSED_THRESHOLDS, STAGE, money, addDays, dayDiff, visibleContractIds, roleKey };
  if (typeof module !== "undefined") module.exports = root.TSRules;
})(typeof window !== "undefined" ? window : globalThis);
