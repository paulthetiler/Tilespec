import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { currentDestination, destinationsFor, everythingElse, MAX_DESTINATIONS } from "../lib/operations/role-nav";
import { canReadFinancial } from "../lib/operations/permissions";
import { roles } from "../lib/operations/types";

test("office navigation offers the four practical destinations", () => {
  assert.deepEqual(destinationsFor("contracts_manager", "/admin", false).map(({ label, href }) => [label, href]), [
    ["Today", "/admin"], ["Inbox", "/admin/inbox"], ["Jobs", "/admin/contracts"], ["People", "/admin/workforce"],
  ]);
});

test("Money stays separate and never enters non-financial role navigation", () => {
  for (const role of roles) {
    for (const financial_access of [false, true]) {
      const financial = canReadFinancial({ role, active: true, financial_access, organisation_id: "org", user_id: "person", display_name: "Person" });
      const primary = destinationsFor(role, "/admin", financial);
      const all = [...primary, ...everythingElse(role, financial)];
      assert.ok(primary.length <= MAX_DESTINATIONS);
      if (!financial) assert.ok(!all.some(item => ["/admin/money", "/admin/finance", "/admin/estimator", "/admin/quotes", "/admin/startup-expenses", "/admin/accounts/settings"].includes(item.href)), `${role}: financial access ${financial_access}`);
    }
  }
  assert.deepEqual(destinationsFor("owner", "/admin", true).map(item => item.label), ["Today", "Inbox", "Jobs", "Money"]);
  assert.deepEqual(destinationsFor("owner", "/admin", false).map(item => item.label), ["Today", "Inbox", "Jobs"]);
});

test("Everything else preserves original office features and useful paperwork routes", () => {
  for (const role of ["owner", "contracts_manager"] as const) {
    const links = everythingElse(role, false).map(item => item.href);
    for (const href of ["/admin", "/admin/contracts", "/admin/workforce", "/admin/supervisor", "/admin/snags", "/admin/holds", "/admin/quality", "/admin/tenders", "/admin/paperwork", "/admin/messages"]) {
      assert.ok(links.includes(href), `${role}: ${href}`);
      assert.ok(existsSync(resolve(__dirname, "..", "app", href.slice(1), "page.tsx")), `existing real route: ${href}`);
    }
    assert.equal(links.includes("/admin/team"), role === "owner");
    assert.equal(new Set(links).size, links.length, "no duplicate secondary links");
  }
});

test("supervisor and installer secondary menus do not expose office paperwork or messages", () => {
  for (const role of ["supervisor", "lead_installer", "subcontract_installer"] as const) {
    const links = everythingElse(role, false).map(item => item.href);
    assert.ok(!links.includes("/admin/messages"));
    assert.ok(!links.includes("/admin/paperwork"));
    assert.ok(!links.includes("/admin/team"));
  }
});

test("office tabs identify the actual destination without labelling every secondary screen Today", () => {
  const tabs = destinationsFor("contracts_manager", "/admin");
  assert.equal(currentDestination(tabs, "/admin"), "today");
  assert.equal(currentDestination(tabs, "/admin/contracts/08c5ba2d-0000-4000-8000-000000000001/locations"), "jobs");
  assert.equal(currentDestination(tabs, "/admin/workforce"), "people");
  assert.equal(currentDestination(tabs, "/admin/inbox"), "inbox");
  assert.equal(currentDestination(tabs, "/admin/paperwork"), null, "paperwork is in the grouped menu");
  assert.equal(currentDestination(tabs, "/admin/tenders"), null);
  assert.equal(currentDestination(tabs, "/admin/messages"), null);
});

test("the grouped office menu reaches every administration area, including the sections the audit found hidden", () => {
  const owner = everythingElse("owner", true).map(item => item.href);
  for (const href of ["/admin/inbox", "/admin/planner", "/admin/materials", "/admin/finance", "/admin/customers", "/admin/quotes",
    "/admin/startup-expenses", "/admin/documents", "/admin/accounts/settings", "/admin/notifications", "/admin/subcontractors", "/admin/gang-invoices", "/admin/invoices"]) {
    assert.ok(owner.includes(href), href);
    assert.ok(existsSync(resolve(__dirname, "..", "app", href.slice(1), "page.tsx")), `existing real route: ${href}`);
  }
  const manager = everythingElse("contracts_manager", false).map(item => item.href);
  assert.ok(!manager.includes("/admin/notifications") && !manager.includes("/admin/team"), "owner-only settings stay with the owner");
  // Search is the box at the top of the menu, on every page; site alerts open from Stops and holds.
  assert.match(readFileSync(resolve(__dirname, "..", "components/admin/office-nav.tsx"), "utf8"), /action="\/admin\/search"/);
  assert.match(readFileSync(resolve(__dirname, "..", "components/admin/role-tabs.tsx"), "utf8"), /<SearchBox id="menu-search"/);
  assert.match(readFileSync(resolve(__dirname, "..", "app/admin/holds/page.tsx"), "utf8"), /\/admin\/alerts/);
});
