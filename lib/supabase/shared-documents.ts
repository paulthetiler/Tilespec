import "server-only";
import { createPublicClient } from "./public-client";
import type { DocumentRecord } from "../documents/model";

// Opens the single issued document a live, unrevoked, unexpired link names, and nothing else. The
// 256-bit token in the link is the secret: the database function checks it, so no service key is
// needed and nothing else is readable without signing in.
export async function readSharedDocument(token: string): Promise<DocumentRecord | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const connection = createPublicClient();
  if (!connection) throw new Error("Shared documents are not configured.");
  const publicClient = connection.client;
  const { data, error } = await publicClient.rpc("shared_commercial_document", { p_token: token });
  if (error) throw new Error("Shared documents are unavailable.");
  return (data ?? null) as DocumentRecord | null;
}
