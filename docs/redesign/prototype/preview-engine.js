/*
 * Thin adapter between the preview screens and the real engine (engine.js, bundled from
 * lib/operations/next-actions). It contains NO rules. Anything that decides what a person
 * should do next lives in the engine and nowhere else.
 *
 * Two helpers below read the fictional scenario for display only:
 *  - savedToday: a "what you have done" list built from saved records
 *  - allocationFor: a subcontractor's plan for today. The real database does not let a gang
 *    read its own plan yet (backend gap B1), so the preview marks it as such.
 */
(function (root) {
  const E = root.TSEngine;
  const config = E.DEFAULT_CONFIG;
  const isoDate = (iso) => String(iso).slice(0, 10);

  function budgetSummary(c) {
    const b = E.budgetOf(c);
    return { value: b.value, cost: b.cost, reserve: b.reserve, profit: b.profit, margin: b.margin };
  }

  function savedToday(s, viewer) {
    const L = E.makeLookups(s), out = [];
    const visible = new Set(E.visibleContractIds(s, viewer));
    const t = (iso) => iso.slice(11, 16);
    s.supervisor_inspections.filter((m) => isoDate(m.created_at) === s.today && visible.has(m.contract_id)).forEach((m) => out.push({ label: "Morning checks", at: t(m.created_at), job: L.job(m.contract_id).name }));
    s.actual_allocations.filter((a) => a.work_date === s.today && !a.voided_at && visible.has(a.contract_id)).forEach((a) => out.push({ label: `${(L.teams.get(a.team_id) || {}).name || "Team"} confirmed on site`, at: t(a.started_at), job: L.job(a.contract_id).name }));
    s.site_handovers.filter((h) => h.work_date === s.today && visible.has(h.contract_id)).forEach((h) => out.push({ label: "Handover sent", at: t(h.created_at), job: L.job(h.contract_id).name }));
    s.location_inspections.filter((i) => isoDate(i.created_at) === s.today && visible.has(i.contract_id)).forEach((i) => out.push({ label: `Inspection saved: ${L.path(i.work_area_id)}`, at: t(i.created_at), job: L.job(i.contract_id).name }));
    return out.sort((a, b) => (a.at < b.at ? -1 : 1));
  }

  function allocationFor(s, viewer) {
    if (E.roleKey(viewer) !== "subcontractor") return null;
    const L = E.makeLookups(s), teams = L.teamIdsOf(viewer.user_id);
    const plan = s.planned_allocations.find((p) => teams.includes(p.team_id) && L.covers(p, s.today));
    if (!plan) return null;
    const c = L.contracts.get(plan.contract_id), sup = L.supervisorOf(plan.contract_id);
    const members = s.team_memberships.filter((m) => m.team_id === plan.team_id).map((m) => s.operatives.find((o) => o.id === m.operative_id).display_name);
    return {
      plan, job: { id: c.id, reference: c.reference, name: c.name }, address: c.address, hours: c.working_hours, siteContact: c.site_contact, location: L.path(plan.work_area_id),
      stage: E.STAGE_LABEL[plan.stage], instructions: plan.instructions, team: L.teams.get(plan.team_id).name, people: members, supervisor: sup ? sup.display_name : null,
      documents: s.document_revisions.filter((d) => d.classification === "operational" && d.contract_id === c.id && (!d.work_area_id || L.under(plan.work_area_id, d.work_area_id))),
    };
  }

  root.TSRules = {
    config,
    compute: (s, viewer) => E.compute(s, viewer, config),
    nextAction: E.nextAction, buildQueue: E.buildQueue, queueCounts: E.queueCounts,
    classChip: E.classChip, classNote: E.classNote, ctaLabel: E.ctaLabel, idleCopy: E.idleCopy, todayCountCopy: E.todayCountCopy, resolveTimings: E.resolveTimings,
    lib: E.makeLookups, roleKey: E.roleKey, visibleContractIds: (s, viewer) => E.visibleContractIds(s, viewer),
    STAGE: E.STAGE_LABEL, addDays: E.addDays, dayDiff: E.dayDiff, money: E.pounds, budgetSummary, savedToday, allocationFor,
  };
  if (typeof module !== "undefined") module.exports = root.TSRules;
})(typeof window !== "undefined" ? window : globalThis);
