import { notFound, redirect } from "next/navigation";
import { londonTimeToIso } from "@/lib/operations/planning";
import { addDays } from "@/lib/operations/next-actions/lookups";

/** The job's complete history (shared with site), opened at the end of a chosen day. */
export default async function JobHistory({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const date = (await searchParams).date;
  const before = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? londonTimeToIso(addDays(date, 1), "00:00") : null;
  redirect(`/admin/supervisor/sites/${id}/activity${before ? `?before=${encodeURIComponent(before)}` : ""}`);
}
