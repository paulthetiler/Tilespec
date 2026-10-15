import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { morningUuid, normalizeMorningAnswers } from "@/lib/operations/morning-checks";

export async function POST(request: Request) {
  const { supabase, member } = await requireActor();
  if (!["owner", "contracts_manager", "supervisor"].includes(member.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const { contractId, requestKey, answers } = payload as Record<string, unknown>;
  const normalized = normalizeMorningAnswers(answers);
  if (typeof contractId !== "string" || !morningUuid.test(contractId) || typeof requestKey !== "string" || !morningUuid.test(requestKey) || !normalized)
    return NextResponse.json({ error: "Answer every morning check before saving." }, { status: 400 });
  const contract = await supabase.from("contracts").select("id").eq("id", contractId).maybeSingle();
  if (contract.error || !contract.data) return NextResponse.json({ error: "Site unavailable" }, { status: 403 });
  const record = { organisation_id: member.organisation_id, contract_id: contractId, actor_id: member.user_id, request_key: requestKey, answers: normalized, issues_count: normalized.filter(answer => answer.status === "issue").length };
  const result = await supabase.from("supervisor_inspections").insert(record).select("id").single();
  if (result.error && result.error.code !== "23505")
    return NextResponse.json({ error: "Morning checks could not be confirmed. Keep this page open and retry." }, { status: 503 });

  // A successful HTTP reply (or even a returned UUID) is insufficient: confirm
  // the exact immutable record, including on a retry after a lost response.
  const existing = await supabase.from("supervisor_inspections").select("id,organisation_id,actor_id,created_at,issues_count,answers,contract_id,request_key")
    .eq("request_key", requestKey).eq("actor_id", member.user_id).maybeSingle();
  const saved = existing.data;
  if (existing.error || !saved || !morningUuid.test(saved.id)
    || saved.organisation_id !== member.organisation_id || saved.actor_id !== member.user_id
    || saved.contract_id !== contractId || saved.request_key !== requestKey
    || saved.issues_count !== record.issues_count || !Number.isFinite(Date.parse(saved.created_at))
    || JSON.stringify(normalizeMorningAnswers(saved.answers)) !== JSON.stringify(normalized)
    || (!result.error && result.data?.id !== saved.id)) {
    return NextResponse.json({ error: "We could not confirm these morning checks were saved. Retry the same checks." }, { status: 503 });
  }
  return NextResponse.json({ id: saved.id, contractId, requestKey, createdAt: saved.created_at, issuesCount: saved.issues_count, confirmed: true }, { status: result.error ? 200 : 201 });
}
