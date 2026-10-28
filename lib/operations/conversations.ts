import { threadState, type AboutType, type JobThread } from "./daily";
import type { JobThreadRow } from "./next-actions/types";
import { dayLabel } from "./planning";

/** Titles of the records a conversation can be about, from records the viewer can already read. */
export type AboutLookups = {
  items: Map<string, { title: string; kind: string }>;
  results: Map<string, { item_id: string }>;
  handovers: Map<string, { work_date: string; actor_name: string }>;
  snags: Map<string, string>;
  holds: Map<string, string>;
};
export const emptyLookups = (): AboutLookups => ({ items: new Map(), results: new Map(), handovers: new Map(), snags: new Map(), holds: new Map() });

export function aboutLabel(type: AboutType, id: string | null, lookups: AboutLookups): string {
  switch (type) {
    case "snag": return `About the snag: ${(id && lookups.snags.get(id)) || "a snag"}`;
    case "hold": return `About the stop: ${(id && lookups.holds.get(id)) || "stopped work"}`;
    case "office_item": {
      const item = id ? lookups.items.get(id) : undefined;
      return item ? `About the ${item.kind === "qa_request" ? "inspection request" : "instruction"}: “${item.title}”` : "About an office message";
    }
    case "qa_result": {
      const item = id ? lookups.items.get(lookups.results.get(id)?.item_id ?? "") : undefined;
      return item ? `About the inspection result: “${item.title}”` : "About an inspection result";
    }
    case "handover": {
      const handover = id ? lookups.handovers.get(id) : undefined;
      return handover ? `About ${handover.actor_name}’s handover of ${dayLabel(handover.work_date)}` : "About a handover";
    }
    default: return "About the job";
  }
}

/** Where the record opens. The office reads handovers on the job's Messages page; a supervisor on Finish today. */
export function aboutHref(type: AboutType, id: string | null, lookups: AboutLookups, siteBase: string, office: boolean): string | null {
  if (!id) return null;
  switch (type) {
    case "snag": return `/admin/snags/${id}`;
    case "hold": return `/admin/holds/${id}`;
    case "office_item": return lookups.items.get(id)?.kind === "qa_request" ? `${siteBase}/tasks/${id}` : `${siteBase}/messages#message-${id}`;
    case "qa_result": { const item = lookups.results.get(id)?.item_id; return item ? `${siteBase}/tasks/${item}` : null; }
    case "handover": return office ? `${siteBase}/messages?handover=${id}#handover-${id}` : `${siteBase}/finish`;
    default: return null;
  }
}

/** What the Next Action rules read for each conversation: what it is about, its latest message and who it waits on. */
export function jobThreadRows(threads: JobThread[], lookups: AboutLookups): JobThreadRow[] {
  return threads.map(thread => {
    const { latest, waitingOn } = threadState(thread);
    return { id: thread.id, contract_id: thread.contract_id, site_user_id: thread.site_user_id, about: aboutLabel(thread.about_type, thread.about_id, lookups),
      latest: { id: latest.id, author_side: latest.author_side, author_name: latest.author_name, body: latest.body, needs_answer: latest.needs_answer, created_at: latest.created_at },
      waiting_on: waitingOn };
  });
}
