/*
 * Illustrative scenario data for the clickable prototype.
 *
 * EVERYTHING HERE IS FICTIONAL. Table and column names mirror the real Supabase
 * schema (supabase/migrations) so the Next Action rules in rules.js read the same
 * shapes the real application already stores. No real project, person or
 * company appears here, and nothing in this folder talks to a backend.
 *
 * Scenarios:
 *   "start"  - an ordinary quiet morning before anything has been done
 *   "busy"   - the same site with a hold, snags, an inspection request and
 *              unfinished work from yesterday
 */
(function (root) {
  const TODAY = "2026-10-15"; // a Thursday

  function base() {
    return {
      today: TODAY,
      now: "07:40",
      members: [
        { user_id: "u-alex", display_name: "Alex Morgan", role: "owner", financial_access: true },
        { user_id: "u-sam", display_name: "Sam Patel", role: "contracts_manager", financial_access: true },
        { user_id: "u-jo", display_name: "Jo Bennett", role: "contracts_manager", financial_access: false },
        { user_id: "u-dave", display_name: "Dave Collins", role: "supervisor", financial_access: false },
        { user_id: "u-ellie", display_name: "Ellie Ross", role: "supervisor", financial_access: false },
        { user_id: "u-marek", display_name: "Marek Kowalski", role: "lead_installer", financial_access: false },
      ],
      contracts: [
        { id: "c1", reference: "RS-2041", name: "Riverside Quay", client: "Harbour Homes Ltd", address: "Block B, Riverside Quay, Anytown AB1 2CD",
          site_contact: "Priti (site manager) 07700 900101", working_hours: "07:30 to 16:30", start_date: "2026-09-28", end_date: "2026-12-18",
          tile_specification: "600 x 600 matt porcelain floor, 300 x 600 gloss wall", installation_system: "Approved flexible adhesive and waterproofing system",
          access_restrictions: "Goods lift booked with the site manager", scope: "Bathroom floors and walls, levels 2 and 3" },
        { id: "c2", reference: "NG-1187", name: "Northgate Retail Unit 4", client: "Northgate Retail Park Ltd", address: "Unit 4, Northgate Retail Park, Anytown AB3 4EF",
          site_contact: "", working_hours: "", start_date: "2026-11-02", end_date: "2026-11-27",
          tile_specification: "", installation_system: "", access_restrictions: "", scope: "Sales floor and customer toilets" },
        { id: "c3", reference: "SA-0932", name: "St Anne's School wet rooms", client: "Anytown Academy Trust", address: "St Anne's School, School Lane, Anytown AB5 6GH",
          site_contact: "Mr Hall (premises) 07700 900303", working_hours: "07:00 to 15:30", start_date: "2026-08-17", end_date: "2026-10-30",
          tile_specification: "Slip-resistant 300 x 300 floor, white wall tile", installation_system: "Approved waterproofing and adhesive system",
          access_restrictions: "School holiday working only until 23 October", scope: "Two pupil wet rooms" },
      ],
      commercials: [
        { contract_id: "c1", contract_value: 184000, labour_budget: 71000, materials_budget: 52000, preliminaries_budget: 9000, contingency: 6000, target_margin: 30 },
        { contract_id: "c3", contract_value: 96000, labour_budget: 38000, materials_budget: 21000, preliminaries_budget: 4000, contingency: 3000, target_margin: 30 },
      ],
      contract_assignments: [
        { contract_id: "c1", user_id: "u-sam" }, { contract_id: "c1", user_id: "u-jo" }, { contract_id: "c1", user_id: "u-dave" },
        { contract_id: "c3", user_id: "u-sam" }, { contract_id: "c3", user_id: "u-ellie" },
        { contract_id: "c2", user_id: "u-sam" },
      ],
      work_areas: [
        { id: "l-b", contract_id: "c1", name: "Block B", path_ids: ["l-b"], parent_id: null },
        { id: "l-b3", contract_id: "c1", name: "Level 3", path_ids: ["l-b", "l-b3"], parent_id: "l-b" },
        { id: "l-f31", contract_id: "c1", name: "Flat 31", path_ids: ["l-b", "l-b3", "l-f31"], parent_id: "l-b3" },
        { id: "l-f31-bath", contract_id: "c1", name: "Bathroom", path_ids: ["l-b", "l-b3", "l-f31", "l-f31-bath"], parent_id: "l-f31" },
        { id: "l-f32", contract_id: "c1", name: "Flat 32", path_ids: ["l-b", "l-b3", "l-f32"], parent_id: "l-b3" },
        { id: "l-f32-bath", contract_id: "c1", name: "Bathroom", path_ids: ["l-b", "l-b3", "l-f32", "l-f32-bath"], parent_id: "l-f32" },
        { id: "l-l2", contract_id: "c1", name: "Level 2", path_ids: ["l-b", "l-l2"], parent_id: "l-b" },
        { id: "l-l2-corr", contract_id: "c1", name: "Corridor", path_ids: ["l-b", "l-l2", "l-l2-corr"], parent_id: "l-l2" },
        { id: "l-sa", contract_id: "c3", name: "Main building", path_ids: ["l-sa"], parent_id: null },
        { id: "l-sa-wc1", contract_id: "c3", name: "Wet room 1", path_ids: ["l-sa", "l-sa-wc1"], parent_id: "l-sa" },
        { id: "l-sa-wc2", contract_id: "c3", name: "Wet room 2", path_ids: ["l-sa", "l-sa-wc2"], parent_id: "l-sa" },
      ],
      work_packages: [
        { id: "p1", contract_id: "c1", work_area_id: "l-f31-bath", name: "Flat 31 bathroom: floor and walls", quantity: 38, unit: "m2" },
        { id: "p2", contract_id: "c1", work_area_id: "l-f32-bath", name: "Flat 32 bathroom: floor and walls", quantity: 36, unit: "m2" },
        { id: "p3", contract_id: "c1", work_area_id: "l-l2-corr", name: "Level 2 corridor floor", quantity: 120, unit: "m2" },
        { id: "p4", contract_id: "c3", work_area_id: "l-sa-wc1", name: "Wet room 1: floor and walls", quantity: 44, unit: "m2" },
      ],
      package_assignments: [
        { contract_id: "c1", work_package_id: "p1", user_id: "u-marek" },
        { contract_id: "c1", work_package_id: "p2", user_id: "u-marek" },
        { contract_id: "c3", work_package_id: "p4", user_id: "u-marek" },
      ],
      companies: [
        { id: "co1", name: "Kowalski Tiling Ltd", contact_name: "Marek Kowalski", contact_phone: "07700 900201" },
        { id: "co2", name: "Mason and Daughters Tiling", contact_name: "Gary Mason", contact_phone: "07700 900202" },
      ],
      company_insurances: [
        { id: "i1", company_id: "co1", insurance_type: "public_liability", expires_on: "2027-03-01" },
        { id: "i2", company_id: "co1", insurance_type: "employers_liability", expires_on: "2026-11-05" },
        { id: "i3", company_id: "co2", insurance_type: "public_liability", expires_on: "2026-10-01" },
        { id: "i4", company_id: "co2", insurance_type: "employers_liability", expires_on: "2027-01-10" },
      ],
      teams: [
        { id: "t1", name: "Kowalski gang", company_id: "co1", kind: "subcontract_gang", active: true },
        { id: "t2", name: "Mason gang", company_id: "co2", kind: "subcontract_gang", active: true },
      ],
      operatives: [
        { id: "o1", display_name: "Marek Kowalski", engagement: "subcontractor", company_id: "co1", user_id: "u-marek", status: "active" },
        { id: "o2", display_name: "Tomasz Nowak", engagement: "subcontractor", company_id: "co1", user_id: null, status: "active" },
        { id: "o3", display_name: "Ania Zielinska", engagement: "subcontractor", company_id: "co1", user_id: null, status: "active" },
        { id: "o4", display_name: "Gary Mason", engagement: "subcontractor", company_id: "co2", user_id: null, status: "active" },
        { id: "o5", display_name: "Lee Mason", engagement: "subcontractor", company_id: "co2", user_id: null, status: "active" },
      ],
      team_memberships: [
        { team_id: "t1", operative_id: "o1", is_lead: true }, { team_id: "t1", operative_id: "o2", is_lead: false }, { team_id: "t1", operative_id: "o3", is_lead: false },
        { team_id: "t2", operative_id: "o4", is_lead: true }, { team_id: "t2", operative_id: "o5", is_lead: false },
      ],
      planned_allocations: [
        { id: "pa1", contract_id: "c1", work_area_id: "l-f31-bath", work_package_id: "p1", team_id: "t1", stage: "installation", planned_start: "2026-10-12", planned_end: "2026-10-16",
          instructions: "Floor tiles first, 600 x 600 matt. Waterproofing was signed off on Tuesday. Leave the wall tile until Friday. Goods lift is booked 10:00 to 12:00 for the tile delivery." },
        { id: "pa2", contract_id: "c1", work_area_id: "l-f32-bath", work_package_id: "p2", team_id: "t1", stage: "waterproofing", planned_start: "2026-10-19", planned_end: "2026-10-20", instructions: "" },
        { id: "pa3", contract_id: "c1", work_area_id: "l-l2-corr", work_package_id: "p3", team_id: "t2", stage: "installation", planned_start: "2026-10-21", planned_end: "2026-10-30", instructions: "" },
      ],
      actual_allocations: [],
      attendance: [],
      allocation_absences: [],
      supervisor_inspections: [], // morning checks
      location_inspection_templates: [
        { id: "tpl1", contract_id: "c1", work_area_id: "l-b", stage: "installation", title: "Floor tile workmanship" },
      ],
      location_inspection_requirements: [
        { id: "req1", contract_id: "c1", work_area_id: "l-b3", work_package_id: null, stage: "installation", applicability: "required", template_id: "tpl1", created_at: "2026-10-12T07:00:00Z" },
      ],
      location_inspections: [],
      supervisor_issues: [], // snags
      work_holds: [],
      supervisor_office_items: [
        { id: "m1", contract_id: "c1", kind: "instruction", title: "Goods lift booked for tiles", body: "Goods lift is booked 10:00 to 12:00 today for the tile delivery. Keep the corridor clear.",
          recipient_id: "u-dave", acknowledgement_required: true, created_by: "u-sam", created_at: "2026-10-14T16:10:00Z", due_on: null },
      ],
      supervisor_office_acknowledgements: [],
      supervisor_qa_submissions: [],
      site_handovers: [],
      document_revisions: [
        { id: "d1", contract_id: "c1", work_area_id: null, title: "Tile and adhesive specification", document_reference: "SPEC-01", revision: 2, classification: "operational" },
        { id: "d2", contract_id: "c1", work_area_id: "l-b3", title: "Level 3 floor plan", document_reference: "DWG-L3", revision: 4, classification: "operational" },
        { id: "d3", contract_id: "c3", work_area_id: null, title: "Wet room specification", document_reference: "SPEC-WR", revision: 1, classification: "operational" },
      ],
      tender_enquiries: [
        { id: "te1", reference: "TE-0412", kind: "tender", name: "Rachel Okafor", company: "Millbrook Care Group", email: "tenders@example.test",
          project: "Millbrook Care Home: corridor flooring", deadline: "2026-10-20", status: "received", received_at: "2026-10-14T09:12:00Z",
          message: "Please price vinyl-look porcelain to 140 m of corridor. Drawings attached.", attachments: ["Corridor plan.pdf", "Finishes schedule.pdf"] },
        { id: "te2", reference: "TE-0409", kind: "tender", name: "Dan Price", company: "Price Interiors", email: "dan@example.test",
          project: "Harbour Hotel: 12 bathrooms", deadline: "2026-10-30", status: "received", received_at: "2026-10-12T15:40:00Z",
          message: "Looking for a tiling subcontractor from January.", attachments: ["Bathroom drawings.pdf"] },
      ],
      log: [], // human-readable audit lines for the prototype, newest first
    };
  }

  function busy() {
    const s = base();
    s.now = "11:25";
    s.supervisor_inspections.push({ id: "mc1", contract_id: "c1", actor_id: "u-dave", created_at: TODAY + "T07:12:00Z", issues_count: 0 });
    s.actual_allocations.push({ id: "aa0", contract_id: "c1", planned_allocation_id: null, work_area_id: "l-f32-bath", team_id: "t1", stage: "preparation",
      work_date: "2026-10-14", started_at: "2026-10-14T07:30:00Z", ended_at: null, voided_at: null });
    s.supervisor_issues.push(
      { id: "s1", contract_id: "c1", work_area_id: "l-f32-bath", stage: "installation", check_label: "Lippage at the bathroom threshold", description: "Edge of floor tile stands proud of the corridor tile.",
        severity: "major", snag_status: "assigned", assigned_team_id: "t1", target_date: "2026-10-13", raised_by: "u-dave", rectified_by: null, escalated: false },
      { id: "s2", contract_id: "c1", work_area_id: "l-f31-bath", stage: "installation", check_label: "Hollow-sounding tile near the bath", description: "Two tiles sound hollow when tapped.",
        severity: "major", snag_status: "rectification_submitted", assigned_team_id: "t1", target_date: "2026-10-16", raised_by: "u-dave", rectified_by: "u-marek", escalated: false },
      { id: "s3", contract_id: "c3", work_area_id: "l-sa-wc1", stage: "installation", check_label: "Cracked tiles at the drain", description: "Cracks around the floor drain.",
        severity: "critical", snag_status: "open", assigned_team_id: null, target_date: null, raised_by: "u-ellie", rectified_by: null, escalated: true });
    s.work_holds.push(
      { id: "h1", contract_id: "c1", work_area_id: "l-f32-bath", stage: "installation", hold_type: "quality", status: "awaiting_release",
        reason: "Screed moisture reading is not accepted by the adhesive manufacturer's requirement.", required_action: "Let the screed dry, retest and send the reading.",
        raised_by: "u-dave", assigned_team_id: "t1", target_date: "2026-10-16", critical_snags_open: false },
      { id: "h2", contract_id: "c3", work_area_id: "l-sa-wc1", stage: "installation", hold_type: "quality", status: "awaiting_release",
        reason: "Floor falls to the drain do not match the drawing.", required_action: "Re-lay the screed falls and send photos.",
        raised_by: "u-sam", assigned_team_id: "t1", target_date: "2026-10-14", critical_snags_open: false },
      { id: "h3", contract_id: "c3", work_area_id: "l-sa-wc2", stage: "waterproofing", hold_type: "quality", status: "active",
        reason: "Waterproofing not carried up the wall far enough.", required_action: "Extend the waterproofing to the height on the drawing and send photos.",
        raised_by: "u-ellie", assigned_team_id: "t1", target_date: "2026-10-16", critical_snags_open: false },
    );
    s.supervisor_office_items.push(
      { id: "m2", contract_id: "c1", kind: "qa_request", title: "Check Flat 31 bathroom before tiling", body: "Please inspect the waterproofing and send the result.",
        recipient_id: "u-dave", acknowledgement_required: false, work_area_id: "l-f31-bath", stage: "waterproofing", created_by: "u-sam", created_at: "2026-10-14T16:20:00Z", due_on: TODAY });
    return s;
  }

  root.TSData = { TODAY, scenarios: { start: base, busy }, make: (name) => (name === "busy" ? busy() : base()) };
  if (typeof module !== "undefined") module.exports = root.TSData;
})(typeof window !== "undefined" ? window : globalThis);
