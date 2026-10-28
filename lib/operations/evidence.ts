import { createHash } from "node:crypto";
import { fileType, ValidationError } from "./validation";

export function inspectEvidence(bytes: Uint8Array, claimedType: string) {
  const type = fileType(bytes, claimedType);
  return { ...type, sha256: createHash("sha256").update(bytes).digest("hex") };
}
export function verifyStoredEvidence(bytes: Uint8Array, expected: { bytes: number; mime_type: string; sha256: string }) {
  const actual = inspectEvidence(bytes, expected.mime_type);
  if (bytes.length !== expected.bytes || actual.sha256 !== expected.sha256) throw new ValidationError("The stored file does not match this revision. It remains unverified. Contact the owner.");
}
/**
 * A retry of the same reserved photograph can find its object already stored by an earlier
 * attempt (for example one whose verification failed). That is safe only because the caller then
 * checks the exact stored bytes; any other upload failure is a failure.
 */
export function alreadyStored(error: { status?: number; statusCode?: string; code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.status === 409 || error.statusCode === "409" || error.code === "ResourceAlreadyExists" || /already exists|duplicate/i.test(error.message ?? "");
}
